/**
 * ที่อยู่ไฟล์แพตช์มาจากฐานข้อมูล ซึ่งแอดมินเป็นคนกรอก
 * ถ้าไม่กรองไว้ ค่าที่กรอกผิด (หรือถูกแก้) จะทำให้ตัวกลางกลายเป็น
 * เครื่องมือให้คนอื่นยิงคำขอไปที่ไหนก็ได้ในนามเซิร์ฟเวอร์เรา
 *
 * จึงอนุญาตเฉพาะปลายทางของ GitHub เท่านั้น และต้องเป็น https
 */

const ALLOWED_HOSTS = [
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
  'raw.githubusercontent.com',
];

export function isAllowedPatchHost(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  return parsed.protocol === 'https:' && ALLOWED_HOSTS.includes(parsed.hostname);
}
