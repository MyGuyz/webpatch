import { defineMiddleware } from 'astro:middleware';

/**
 * ทุกหน้าดึงข้อมูลสดจาก Supabase ตอน render (รายชื่อเกม/ประกาศ/ความคืบหน้า)
 * ถ้าไม่กันไว้ตรงนี้ เบราว์เซอร์ (โดยเฉพาะตอน prefetch ลิงก์ล่วงหน้าด้วย
 * <link rel="prefetch">) อาจแคชคำตอบที่ดึงมาตอน Supabase มีปัญหาชั่วคราว
 * (เช่น ดึงรายชื่อเกมมาได้ไม่ครบ) แล้วเสิร์ฟหน้าเก่าที่ค้างนั้นซ้ำไปเรื่อยๆ
 * ผู้ใช้จะเจออาการ "เลือกเกมแล้วไม่มีเกมให้เลือก" แบบสุ่มๆ ที่หาสาเหตุยาก
 *
 * ก่อนหน้านี้ตั้ง max-age สั้นๆ ไว้เฉยๆ (ไม่ใช้ no-store) เพื่อให้ prefetch ยังพอ
 * ช่วยให้เปลี่ยนหน้าลื่นขึ้นได้ — แต่นั่นทำให้ Safari มองว่าหน้านี้ยังเข้าเงื่อนไข
 * เก็บใน back-forward cache (bfcache) ได้ ถ้าผู้ใช้ปิด Safari ทิ้งไว้นานๆ (ไม่ใช่แค่
 * สลับแอปสั้นๆ) แล้วมี deploy ใหม่ขึ้นระหว่างนั้น (ไฟล์ CSS/JS เก่าถูกลบทิ้งจริงตอน deploy)
 * กลับมาเปิดแท็บเดิมจะได้หน้าที่ค้างจาก bfcache ซึ่งอ้างอิงไฟล์ที่ถูกลบไปแล้ว —
 * และร้ายกว่านั้น หน้าที่ค้างอยู่นั้นเป็นโค้ดเก่าที่ไม่มีสคริปต์แก้ปัญหานี้อยู่ในตัวเลย
 * (แก้จากข้างในหน้าไม่ได้ เพราะหน้านั้นไม่เคยรันโค้ดใหม่)
 *
 * ทางแก้ที่ตรงจุดคือกัน "การนำทางจริง" (เปิดแท็บ/พิมพ์ URL/กดลิงก์ข้ามหน้า) ไม่ให้เข้า
 * เงื่อนไข bfcache ของ Safari ตั้งแต่ต้น ด้วย no-store — Safari จะไม่เก็บหน้านั้นไว้ใน
 * bfcache เลย บังคับให้โหลดจาก network ใหม่ทุกครั้งที่กลับมาเปิด ส่วนคำขอที่มาจาก
 * prefetch (มี header Sec-Purpose/Purpose: prefetch) ยังคงได้ max-age สั้นๆ ตามเดิม
 * เพราะนั่นไม่ใช่การนำทางจริงที่ทำให้เกิด bfcache — และตั้งเป็น private กัน
 * Cloudflare หรือแคชกลางอื่นๆ เก็บคำตอบเดียวกันไปเสิร์ฟคนอื่นซ้ำ
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();

  // เคารพ Cache-Control ที่ route ตั้งเอง (เช่น /api/patch-file ที่ตั้งใจแคชไฟล์แพตช์ไว้ 1 ชม.)
  // ตั้งให้เฉพาะ route ที่ยังไม่ได้กำหนดไว้เอง (หน้าเว็บทั่วไปที่ดึงข้อมูลสดจาก Supabase)
  if (!response.headers.has('Cache-Control')) {
    const purpose =
      context.request.headers.get('Sec-Purpose') ?? context.request.headers.get('Purpose') ?? '';
    const isPrefetch = purpose.includes('prefetch');
    response.headers.set(
      'Cache-Control',
      isPrefetch ? 'private, max-age=3, must-revalidate' : 'private, no-store'
    );
  }

  return response;
});
