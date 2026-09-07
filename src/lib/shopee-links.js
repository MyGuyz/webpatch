const el = (id) => document.getElementById(id);

/**
 * สุ่มเลือกลิงก์ Shopee 1 อันจาก data island ที่ Base.astro ฝังไว้ทุกหน้า (ดู games.js
 * getShopeeLinks) — ใช้ร่วมกันทั้งป๊อปอัป "สนับสนุนเรา" หลัก และปุ่มสนับสนุนในป๊อปอัป
 * แปะแพตช์เสร็จ กันตรรกะสุ่มลิงก์เพี้ยนไปคนละแบบถ้าแก้ที่เดียวแล้วลืมอีกที่
 */
export function pickRandomShopeeLink() {
  const links = JSON.parse(el('shopee-links-data')?.textContent ?? '[]');
  if (links.length === 0) return null;
  return links[Math.floor(Math.random() * links.length)];
}
