import type { APIRoute } from 'astro';
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
export const GET: APIRoute = async ({ params }) => {
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
    return text(`โหลดไฟล์แพตช์จากต้นทางไม่สำเร็จ (${upstream.status})`, 502);
  }

  const headers = new Headers({
    'Content-Type': 'application/octet-stream',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=3600',
  });

  const length = upstream.headers.get('content-length');
  if (length) headers.set('Content-Length', length);

  return new Response(upstream.body, { status: 200, headers });
};

function text(message: string, status: number) {
  return new Response(message, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
