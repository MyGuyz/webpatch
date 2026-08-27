import { defineMiddleware } from 'astro:middleware';

/**
 * ทุกหน้าดึงข้อมูลสดจาก Supabase ตอน render (รายชื่อเกม/ประกาศ/ความคืบหน้า)
 * ถ้าไม่กันไว้ตรงนี้ เบราว์เซอร์ (โดยเฉพาะตอน prefetch ลิงก์ล่วงหน้าด้วย
 * <link rel="prefetch">) อาจแคชคำตอบที่ดึงมาตอน Supabase มีปัญหาชั่วคราว
 * (เช่น ดึงรายชื่อเกมมาได้ไม่ครบ) แล้วเสิร์ฟหน้าเก่าที่ค้างนั้นซ้ำไปเรื่อยๆ
 * ผู้ใช้จะเจออาการ "เลือกเกมแล้วไม่มีเกมให้เลือก" แบบสุ่มๆ ที่หาสาเหตุยาก
 *
 * ตั้ง max-age สั้นๆ ไว้ (ไม่ใช้ no-store เลย) เพื่อให้ prefetch ยังพอช่วยให้
 * เปลี่ยนหน้าลื่นขึ้นได้ในเคสปกติ (ชี้/แตะแล้วกดต่อภายในไม่กี่วินาที) แต่ไม่ให้
 * ข้อมูลเก่าค้างอยู่นานเกินไปถ้าเกิดปัญหาจริง — และตั้งเป็น private กัน
 * Cloudflare หรือแคชกลางอื่นๆ เก็บคำตอบเดียวกันไปเสิร์ฟคนอื่นซ้ำ
 */
export const onRequest = defineMiddleware(async (_context, next) => {
  const response = await next();

  // เคารพ Cache-Control ที่ route ตั้งเอง (เช่น /api/patch-file ที่ตั้งใจแคชไฟล์แพตช์ไว้ 1 ชม.)
  // ตั้งให้เฉพาะ route ที่ยังไม่ได้กำหนดไว้เอง (หน้าเว็บทั่วไปที่ดึงข้อมูลสดจาก Supabase)
  if (!response.headers.has('Cache-Control')) {
    response.headers.set('Cache-Control', 'private, max-age=3, must-revalidate');
  }

  return response;
});
