import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { buildBugReportPayload, explainBugReportError } from '../../lib/bug-report-form.js';

export const prerender = false;

/**
 * รับรายงานบั๊กทั้งก้อน (ตรวจฟอร์ม + กันสแปม + อัปโหลดไฟล์แนบ + บันทึกลง bug_reports)
 *
 * ย้ายมาจากเดิมที่เบราว์เซอร์เขียนตรงเข้า Supabase ด้วยกุญแจ anon เอง (ดู ADR-013) —
 * ตอนนั้นตัวกันสแปม (/api/bug-report-guard เดิม) เป็นแค่คำขอความร่วมมือที่เบราว์เซอร์เลือก
 * จะเชื่อหรือไม่ก็ได้ ใครยิง Supabase JS SDK ตรงๆ ก็ข้ามไปได้เลย ตอนนี้ทุกอย่างที่แก้ไข
 * ข้อมูลจริง (อัปโหลดไฟล์ + insert แถว) ทำที่นี่ฝั่งเซิร์ฟเวอร์เท่านั้น ใช้ service role key
 * ซึ่งไม่มีทางถูกข้ามจากฝั่งเบราว์เซอร์ได้ — RLS จึงปิดช่อง insert ของ anon ไปแล้ว
 * (ดู migrations/0012_bug_reports_server_only_writes.sql)
 */

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 3;

export const POST: APIRoute = async ({ request }) => {
  let runtimeEnv: Record<string, string | undefined> | null = null;
  try {
    ({ env: runtimeEnv } = await import('cloudflare:workers'));
  } catch {
    // รันนอก Cloudflare (เช่น dev/test) — ไม่มี binding ให้อ่าน
  }

  const supabaseUrl = runtimeEnv?.PUBLIC_SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL;
  const serviceKey = runtimeEnv?.SUPABASE_SERVICE_ROLE_KEY || import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  const salt = runtimeEnv?.IP_HASH_SALT || import.meta.env.IP_HASH_SALT;

  // ก่อนเคยยอมให้ผ่านเงียบๆ ถ้าไม่ได้ตั้งค่า เพราะตอนนั้นการเขียนจริงทำโดยเบราว์เซอร์อยู่แล้ว
  // ตอนนี้จุดนี้เป็นทางเขียนข้อมูลทางเดียวที่เหลืออยู่ จึงต้องมี service key ไม่งั้นส่งอะไรไม่ได้เลย
  if (!supabaseUrl || !serviceKey) {
    return json({ ok: false, message: 'เซิร์ฟเวอร์ยังไม่ได้ตั้งค่าให้รับรายงานบั๊ก ลองแจ้งเราทางอื่นก่อนนะครับ' }, 500);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return json({ ok: false, message: 'อ่านข้อมูลที่ส่งมาไม่สำเร็จ ลองใหม่อีกครั้ง' }, 400);
  }

  // กับดักสแปม — ช่องนี้ซ่อนไว้ในหน้าเว็บ คนจริงไม่มีทางกรอก เนียนไว้ว่าส่งสำเร็จ
  // (ย้ายมาเช็คซ้ำที่นี่ด้วย เพราะการเช็คฝั่งเบราว์เซอร์อย่างเดียวข้ามได้ง่ายเหมือนกัน)
  if (String(formData.get('note_extra') ?? '').trim() !== '') {
    return json({ ok: true });
  }

  const fields = {
    game_id: formData.get('game_id'),
    patch_version: formData.get('patch_version'),
    description: formData.get('description'),
    where_in_game: formData.get('where_in_game'),
    emulator: formData.get('emulator'),
    wrong_text: formData.get('wrong_text'),
    contact: formData.get('contact'),
  };
  const files = formData.getAll('media').filter((value): value is File => value instanceof File);

  const result = buildBugReportPayload(fields, files);
  if (!result.ok) {
    return json({ ok: false, message: 'ข้อมูลที่ส่งมาไม่ครบหรือไม่ถูกต้อง', errors: result.errors }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  if (salt) {
    const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
    const ipHash = await sha256Hex(`${salt}:${ip}`);
    const guard = await checkAndBumpRateLimit(supabase, ipHash);
    if (!guard.allowed) {
      return json({ ok: false, message: guard.message }, 429);
    }
  }

  const folder = crypto.randomUUID();
  const mediaPaths: string[] = [];

  for (const [index, file] of files.entries()) {
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const path = `${folder}/${index}-${safeName}`;

    const { error } = await supabase.storage
      .from('bug-reports')
      .upload(path, file, { contentType: file.type });

    if (error) {
      if (mediaPaths.length) await supabase.storage.from('bug-reports').remove(mediaPaths).catch(() => {});
      return json({ ok: false, message: explainBugReportError(error) }, 400);
    }
    mediaPaths.push(path);
  }

  const { error } = await supabase
    .from('bug_reports')
    .insert({ ...result.payload, media_paths: mediaPaths });

  if (error) {
    if (mediaPaths.length) await supabase.storage.from('bug-reports').remove(mediaPaths).catch(() => {});
    return json({ ok: false, message: explainBugReportError(error) }, 400);
  }

  return json({ ok: true });
};

async function checkAndBumpRateLimit(supabase: ReturnType<typeof createClient>, ipHash: string) {
  const now = Date.now();

  const { data: row } = await supabase
    .from('bug_report_rate_limit')
    .select('window_start, count')
    .eq('ip_hash', ipHash)
    .maybeSingle();

  if (!row || now - new Date(row.window_start).getTime() > WINDOW_MS) {
    await supabase
      .from('bug_report_rate_limit')
      .upsert({ ip_hash: ipHash, window_start: new Date(now).toISOString(), count: 1 });
    return { allowed: true };
  }

  if (row.count >= MAX_PER_WINDOW) {
    return { allowed: false, message: 'ส่งรายงานถี่เกินไปจากเครือข่ายนี้ รอสักครู่แล้วลองใหม่นะครับ' };
  }

  await supabase
    .from('bug_report_rate_limit')
    .update({ count: row.count + 1 })
    .eq('ip_hash', ipHash);

  return { allowed: true };
}

async function sha256Hex(text: string) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
