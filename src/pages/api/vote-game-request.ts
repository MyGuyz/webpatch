import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

export const prerender = false;

/**
 * โหวตคำขอเกม กันโหวตซ้ำด้วย hash ของ IP (ดู ADR-012 และ ADR-010/011 ที่ใช้แพทเทิร์นเดียวกัน)
 * ใช้ secret ชุดเดียวกับระบบกันสแปม/นับดาวน์โหลด ไม่ต้องตั้งค่าเพิ่ม
 */
export const POST: APIRoute = async ({ request }) => {
  let body: { request_id?: number };
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, message: 'ข้อมูลที่ส่งมาไม่ถูกต้อง' }, 400);
  }

  const requestId = Number(body.request_id);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return json({ ok: false, message: 'ไม่พบคำขอเกมนี้' }, 400);
  }

  let runtimeEnv: Record<string, string | undefined> | null = null;
  try {
    ({ env: runtimeEnv } = await import('cloudflare:workers'));
  } catch {
    // รันนอก Cloudflare (เช่น dev/test)
  }

  const supabaseUrl = runtimeEnv?.PUBLIC_SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL;
  const serviceKey = runtimeEnv?.SUPABASE_SERVICE_ROLE_KEY || import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  const salt = runtimeEnv?.IP_HASH_SALT || import.meta.env.IP_HASH_SALT;

  if (!supabaseUrl || !serviceKey || !salt) {
    return json({ ok: false, message: 'ระบบโหวตยังไม่พร้อมใช้งาน (ยังไม่ได้ตั้งค่าฝั่งเซิร์ฟเวอร์)' });
  }

  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const data = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const ipHash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');

  const supabase = createClient(supabaseUrl, serviceKey);

  const { error: voteError } = await supabase
    .from('game_request_votes')
    .insert({ ip_hash: ipHash, request_id: requestId });

  if (voteError) {
    // ชนกัน primary key = โหวตไปแล้ว ไม่ใช่ error จริง
    return json({ ok: false, alreadyVoted: true, message: 'คุณโหวตอันนี้ไปแล้วครับ' });
  }

  await supabase.rpc('increment_game_request_vote', { p_request_id: requestId });

  return json({ ok: true });
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
