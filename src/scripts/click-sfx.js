import { sfxTick, sfxConfirm, sfxWarn, sfxCancel } from '../lib/sfx.js';

/**
 * เสียงคลิกพื้นฐานให้ปุ่ม/ลิงก์ทั่วเว็บที่ยังไม่มีเสียงเฉพาะของตัวเอง
 *
 * ใช้ event delegation ฟังที่ document ตัวเดียว แทนที่จะผูกทีละปุ่ม เพราะปุ่ม
 * ส่วนใหญ่ (เมนู, การ์ดเกม, แถวในหน้า Admin) ถูกสร้าง/แทนที่ใหม่ทุกครั้งที่เปลี่ยนหน้า
 * แบบ SPA หรือโหลดข้อมูลใหม่ — ผูกทีละปุ่มจะต้องคอยผูกซ้ำ แต่ delegation ทำงานถูกได้เสมอ
 * ไม่ว่า element จะถูกสร้างใหม่กี่รอบก็ตาม
 *
 * ปุ่มที่มีเสียงเฉพาะของตัวเองอยู่แล้ว (เขียนไว้ในสคริปต์ประจำหน้า) ต้องใส่
 * data-sfx="none" กันเสียงซ้อนกัน 2 เสียงตอนกดครั้งเดียว
 */
const SELECTOR =
  '.btn, .close-x, .nav__item, .top-nav__link, .top-nav__brand, .game__go, .game__cover-dl, .credit, .skip-link';

const SOUNDS = { tick: sfxTick, confirm: sfxConfirm, warn: sfxWarn, cancel: sfxCancel };

document.addEventListener('click', (event) => {
  const el = event.target.closest(SELECTOR);
  if (!el) return;

  const override = el.dataset.sfx;
  if (override === 'none') return;

  const kind = override && SOUNDS[override] ? override : el.classList.contains('btn--danger') ? 'warn' : 'tick';
  SOUNDS[kind]();
});
