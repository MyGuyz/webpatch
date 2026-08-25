import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

export const prerender = false;

/**
 * เช็คก่อนรับรายงานบั๊ก กันสแปมส่งรัวๆ จากเครือข่ายเดียวกัน (ดู ADR-010)
 *
 * เก็บแค่ hash ของ IP ไม่เก็บ IP จริง จึงย้อนกลับไปหา IP เดิมไม่ได้
 * ถ้ายังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY หรือ IP_HASH_SALT
 * จะปล่อยผ่านเสมอ (ฟีเจอร์นี้เสริม ไม่ควรบล็อกคนแจ้งบั๊กจริงเพราะลืมตั้งค่า)
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

  if (!supabaseUrl || !serviceKey || !salt) {
    return json({ allowed: true });
  }

  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const ipHash = await sha256Hex(`${salt}:${ip}`);

  const supabase = createClient(supabaseUrl, serviceKey);
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
    return json({ allowed: true });
  }

  if (row.count >= MAX_PER_WINDOW) {
    return json({
      allowed: false,
      message: 'ส่งรายงานถี่เกินไปจากเครือข่ายนี้ รอสักครู่แล้วลองใหม่นะครับ',
    });
  }

  await supabase
    .from('bug_report_rate_limit')
    .update({ count: row.count + 1 })
    .eq('ip_hash', ipHash);

  return json({ allowed: true });
};

async function sha256Hex(text: string) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  });
}
