/**
 * หาลายนิ้วมือ (SHA-1) ของไฟล์ ด้วย Web Crypto ที่มีมากับเบราว์เซอร์
 *
 * ใช้สองที่: หน้าแปะแพตช์ (ตรวจว่าผู้ใช้เอาไฟล์ถูกรุ่นมาไหม)
 * และหน้า /tools/sha1 (ให้แอดมินหาค่าไปใส่ฐานข้อมูล)
 *
 * SHA-1 ถือว่าอ่อนเกินไปสำหรับงานความปลอดภัย แต่ตรงนี้ใช้ระบุ "รุ่นไฟล์"
 * ไม่ได้ใช้กันการปลอมแปลง และเป็นค่าที่วงการ ROM ใช้กันเป็นมาตรฐานอยู่แล้ว
 */
export async function sha1Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-1', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
