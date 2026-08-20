import { applyIPS } from './ips.js';
import { applyBPS } from './bps.js';
import { applyPPF } from './ppf.js';

/**
 * ทะเบียนตัวแปะแพตช์ — เพิ่มรูปแบบใหม่ทีหลังได้โดยไม่ต้องแตะโค้ดเดิม
 * (เพิ่มไฟล์โมดูลใหม่ 1 ไฟล์ กับอีก 1 บรรทัดตรงนี้)
 */
const APPLIERS = {
  ips: applyIPS,
  bps: applyBPS,
  ppf: applyPPF,
};

export const SUPPORTED_FORMATS = Object.keys(APPLIERS);

export function detectFormat(filename) {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext && ext in APPLIERS ? ext : null;
}

/**
 * แปะแพตช์ลงไฟล์ต้นฉบับ แล้วคืนไฟล์ผลลัพธ์
 *
 * ทำงานในเบราว์เซอร์ของผู้ใช้ทั้งหมด ไฟล์ต้นฉบับไม่ถูกส่งไปไหน (ดู ADR-007)
 */
export function applyPatch(source, patch, format) {
  const applier = APPLIERS[format];
  if (!applier) {
    throw new Error(`ยังไม่รองรับแพตช์รูปแบบ .${format}`);
  }
  return applier(source, patch);
}
