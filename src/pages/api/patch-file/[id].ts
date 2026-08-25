import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { getGameById } from '../../../lib/games.js';
import { isAllowedPatchHost } from '../../../lib/allowed-hosts.js';

export const prerender = false;

/**
 * ตัวกลาง CORS (ดู ADR-004)
 *
 * ไฟล์ใน GitHub Releases ไม่ส่ง access-control-allow-origin มาด้วย
 * เบราว์เซอร์จึงห้าม JS อ่านเนื้อไฟล์ ตรงนี้ทำหน้าที่ดึงมาส่งต่อพร้อมติดป้ายให้
 *
 * สำคัญ: ส่งต่อแบบ stream เท่านั้น ห้ามอ่านทั้งไฟล์เข้าหน่วยความจำก่อน
 * เพราะแพตช์อาจใหญ่ถึง 500MB
 */
export const GET: APIRoute = async ({ params, request }) => {
  const game = await getGameById(params.id);
  if (!game) {
    return text('ไม่พบเกมนี้', 404);
  }

  if (!game.patch_url) {
    return text('เกมนี้ยังไม่มีไฟล์แพตช์ให้โหลด', 404);
  }

  // กันไม่ให้ค่าในฐานข้อมูลถูกใช้ดึงไฟล์จากที่อื่นนอกจาก GitHub
  if (!isAllowedPatchHost(game.patch_url)) {
    return text('ที่อยู่ไฟล์แพตช์ไม่ถูกต้อง', 502);
  }

  const upstream = await fetch(game.patch_url, {
    headers: { 'User-Agent': 'webpatch' },
    redirect: 'follow',
  });

  if (!upstream.ok || !upstream.body) {
    // 404 จาก GitHub ทั้งที่ลิงก์ถูก มักแปลว่า repo เป็น private
    // เพราะไฟล์ release ของ repo ส่วนตัวต้องล็อกอินถึงโหลดได้ ส่วนตัวกลางนี้ดึงแบบไม่ล็อกอิน
    const hint =
      upstream.status === 404
        ? ' — ถ้าลิงก์ถูกต้องแล้ว ให้เช็คว่า repo บน GitHub ตั้งเป็นสาธารณะหรือยัง'
        : '';
    return text(`โหลดไฟล์แพตช์จากต้นทางไม่สำเร็จ (${upstream.status})${hint}`, 502);
  }

  const headers = new Headers({
    'Content-Type': 'application/octet-stream',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=3600',
  });

  const length = upstream.headers.get('content-length');
  if (length) headers.set('Content-Length', length);

  await countDownload(game.id, request).catch(() => {});

  return new Response(upstream.body, { status: 200, headers });
};

function text(message: string, status: number) {
  return new Response(message, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

/**
 * นับจำนวนโหลดแพตช์ (ดู ADR-011) — จำกัด 1 คน 1 เกม 1 ครั้งต่อวัน กันคนกดรัวๆ ปั่นตัวเลข
 * เก็บแค่ hash ของ IP เหมือน bug-report-guard.ts ไม่มีทางย้อนกลับเป็น IP จริงได้
 * ถ้ายังไม่ได้ตั้งค่า secret ที่ต้องใช้ จะข้ามการนับไปเงียบๆ ไม่บล็อกการโหลดแพตช์จริง
 */
async function countDownload(gameId: number, request: Request) {
  let runtimeEnv: Record<string, string | undefined> | null = null;
  try {
    ({ env: runtimeEnv } = await import('cloudflare:workers'));
  } catch {
    // รันนอก Cloudflare (เช่น dev/test)
  }

  const supabaseUrl = runtimeEnv?.PUBLIC_SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL;
  const serviceKey = runtimeEnv?.SUPABASE_SERVICE_ROLE_KEY || import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  const salt = runtimeEnv?.IP_HASH_SALT || import.meta.env.IP_HASH_SALT;
  if (!supabaseUrl || !serviceKey || !salt) return;

  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const data = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const ipHash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');

  const supabase = createClient(supabaseUrl, serviceKey);

  // insert สำเร็จ = ยังไม่เคยนับคนนี้กับเกมนี้วันนี้ → ค่อยบวกตัวนับจริง
  // ชนกัน primary key (ip_hash, game_id, day) = นับไปแล้ววันนี้ ข้ามเงียบๆ
  const { error: logError } = await supabase
    .from('game_download_log')
    .insert({ ip_hash: ipHash, game_id: gameId });

  if (logError) return;

  await supabase.rpc('increment_game_download_count', { p_game_id: gameId });
}
