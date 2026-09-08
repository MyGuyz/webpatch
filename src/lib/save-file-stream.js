/**
 * ห่อ File System Access API (showSaveFilePicker) ไว้ที่เดียว — ใช้ตอนไฟล์ใหญ่จนต้อง
 * เขียนผลลัพธ์ลงดิสก์ทีละก้อนแทนที่จะรวมเป็น Blob เดียวในหน่วยความจำก่อน (ดู ADR-017)
 *
 * รองรับเฉพาะ Chrome/Edge (desktop และ Android) — Safari/iOS และ Firefox ไม่มี API นี้เลย
 * ต้องเช็ค supportsStreamingSave() ก่อนเรียกใช้เสมอ แล้วมีทางสำรอง (BigBuffer แบบเดิม) ไว้
 * สำหรับเบราว์เซอร์ที่ไม่รองรับ
 */

export function supportsStreamingSave() {
  return typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function';
}

/**
 * เปิดกล่องให้ผู้ใช้เลือกที่เก็บไฟล์ แล้วคืนทั้ง handle (มี .name ตัวจริงหลังผู้ใช้เลือก/แก้ชื่อ
 * เอง ใช้โชว์ในหน้าคู่มือเปิดเล่นได้แม่นยำกว่าเดายังไว้เองล่วงหน้า) กับ writable stream พร้อมเขียน
 *
 * โยน DOMException name "AbortError" ถ้าผู้ใช้กดยกเลิก — ผู้เรียกต้องดักไว้เอง
 * (ไม่ใช่ error จริง แค่ผู้ใช้เปลี่ยนใจ)
 */
export async function createSaveStream(suggestedName) {
  const handle = await window.showSaveFilePicker({
    suggestedName,
    types: [{ description: 'ไฟล์เกม', accept: { 'application/octet-stream': ['.iso', '.bin', '.img'] } }],
  });
  const writable = await handle.createWritable();
  return { handle, writable };
}
