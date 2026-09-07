import { sfxChime, sfxCancel } from '../lib/sfx.js';
import { pickRandomShopeeLink } from '../lib/shopee-links.js';

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
  // สุ่มเลือก 1 อันทุกครั้งที่เปิดป๊อปอัปนี้
  const link = pickRandomShopeeLink();
  if (link) el('donate-shopee-btn').href = link.url;
  donateModal.classList.add('open');
}

function closeDonate() {
  donateModal.classList.remove('open');
}
