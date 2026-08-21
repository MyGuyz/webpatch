import { createClient } from '@supabase/supabase-js';

/**
 * ตัวเชื่อม Supabase ฝั่งเบราว์เซอร์สำหรับหน้า Admin
 *
 * หน้า Admin เขียนข้อมูลตรงเข้า Supabase ไม่ผ่านเซิร์ฟเวอร์ของเรา
 * จึงไม่ต้องมีความลับอะไรเก็บไว้ที่ฝั่งเรา — กุญแจที่ใช้เป็นกุญแจสาธารณะ
 * และสิทธิ์จริงมาจากกฎ RLS ในฐานข้อมูล (ดู supabase/migrations/0002_admin.sql)
 */

let client = null;

export function getSupabase() {
  if (client) return client;

  const { url, key } = window.__SUPABASE__ ?? {};
  if (!url || !key) return null;

  client = createClient(url, key);
  return client;
}

/** แสดงข้อความบอกผลให้ผู้ใช้ — ใช้ร่วมกันทั้งหน้ารายการและหน้าฟอร์ม */
export function showMessage(el, text, kind = 'error') {
  el.textContent = text;
  el.dataset.kind = kind;
  el.hidden = false;
}

export function hideMessage(el) {
  el.hidden = true;
}
