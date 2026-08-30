import { sfxChime, sfxCancel } from '../lib/sfx.js';

const el = (id) => document.getElementById(id);
const donateModal = el('donate-modal');
const donateBtn = el('donate-btn');
if (donateModal && donateBtn) start();

/**
 * ลิงก์สินค้า Shopee ที่ปุ่ม "คลิก = สนับสนุน" จะพาไป — สุ่มเลือก 1 อันทุกครั้งที่เปิดป๊อปอัปนี้
 * ใส่ได้หลายลิงก์ตามต้องการ (ยังเป็นลิงก์ตัวอย่าง รอใส่ลิงก์ Shopee จริงแทน)
 */
const SHOPEE_LINKS = ['https://shopee.co.th/'];

function start() {
  donateBtn.addEventListener('click', () => {
    sfxChime();
    openDonate();
  });

  el('donate-close').addEventListener('click', () => {
    sfxCancel();
    closeDonate();
  });
}

function openDonate() {
  const link = SHOPEE_LINKS[Math.floor(Math.random() * SHOPEE_LINKS.length)];
  el('donate-shopee-btn').href = link;
  donateModal.classList.add('open');
}

function closeDonate() {
  donateModal.classList.remove('open');
}
