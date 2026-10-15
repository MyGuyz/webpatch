import type { APIRoute } from 'astro';

export const prerender = false;

/**
 * ตัวกลางภาพปกเกม — ส่งต่อไฟล์จาก Supabase Storage (bucket game-covers) แล้วให้ Cloudflare จำไว้
 *
 * ต.ค. 2026 ภาพปกที่โหลดตรงจาก Supabase ทุกครั้งที่มีคนเปิดหน้า กินโควต้า egress ของแพ็กฟรี
 * (5 GB/เดือน) จนเต็มในไม่ถึงเดือน (ปกรวมกันแค่ ~2 MB แต่ส่งออกไป 13.7 GB) Supabase เลย
 * ล็อกทั้งโปรเจกต์ ทั้งที่ Cloudflare ส่งไฟล์ให้ฟรีไม่จำกัด
 *
 * ชื่อไฟล์ปกขึ้นต้นด้วย UUID ที่สุ่มใหม่ทุกครั้งที่อัปโหลด (ดู scripts/admin-form.js)
 * เปลี่ยนปก = ได้ชื่อไฟล์ใหม่ ไฟล์เดิมไม่มีวันเปลี่ยนเนื้อหา จึงจำไว้ได้ยาวๆ แบบ immutable
 * ทั้งในแคชของ Cloudflare (Cache API) และในเบราว์เซอร์ Supabase จะถูกดึงแค่ตอนแคชว่าง
 */
const ONE_YEAR = 60 * 60 * 24 * 365;

export const GET: APIRoute = async ({ params, request }) => {
  const file = params.file ?? '';
  // ชื่อไฟล์ที่ admin-form สร้างมีแค่ตัวอักษรอังกฤษ ตัวเลข . - _ เท่านั้น กันการแอบอ้างพาธอื่น
  if (!/^[a-zA-Z0-9._-]+$/.test(file)) {
    return new Response('ไม่พบภาพ', { status: 404 });
  }

  let runtimeEnv: Record<string, string | undefined> | null = null;
  try {
    ({ env: runtimeEnv } = await import('cloudflare:workers'));
  } catch {
    // รันนอก Cloudflare (เช่น dev/test)
  }
  const supabaseUrl = runtimeEnv?.PUBLIC_SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    return new Response('ไม่พบภาพ', { status: 404 });
  }

  // Cache API มีเฉพาะบน Cloudflare — รันที่อื่นก็ข้ามแคชไปเฉยๆ
  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  const cacheKey = new Request(new URL(request.url).toString(), { method: 'GET' });

  const cached = await cache?.match(cacheKey);
  if (cached) return cached;

  const upstream = await fetch(`${supabaseUrl}/storage/v1/object/public/game-covers/${file}`);
  if (!upstream.ok || !upstream.body) {
    // ไม่จำคำตอบที่พัง (เช่น 402 ตอนโควต้าเต็ม) — ให้ลองใหม่ได้เมื่อ Supabase กลับมา
    return new Response('โหลดภาพปกไม่สำเร็จ', {
      status: 502,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const response = new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'image/jpeg',
      'Cache-Control': `public, max-age=${ONE_YEAR}, immutable`,
    },
  });

  if (cache) await cache.put(cacheKey, response.clone());
  return response;
};
