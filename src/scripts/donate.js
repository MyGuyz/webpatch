import { sfxChime, sfxCancel } from '../lib/sfx.js';

const el = (id) => document.getElementById(id);
const donateModal = el('donate-modal');
const donateBtn = el('donate-btn');
if (donateModal && donateBtn) start();

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
  // ลิงก์สินค้า Shopee มาจากตาราง shopee_links ใน Supabase (ดู getShopeeLinks ใน lib/games.js)
  // ส่งมาเป็น data island ใน Base.astro — สุ่มเลือก 1 อันทุกครั้งที่เปิดป๊อปอัปนี้
  const links = JSON.parse(el('shopee-links-data')?.textContent ?? '[]');
  if (links.length > 0) {
    const link = links[Math.floor(Math.random() * links.length)];
    el('donate-shopee-btn').href = link.url;
  }
  donateModal.classList.add('open');
}

function closeDonate() {
  donateModal.classList.remove('open');
}
