/**
 * แปะแพตช์ PPF แบบสตรีม — อ่านไฟล์ต้นฉบับทีละก้อนเล็กๆ เขียนผลลัพธ์ออกทันทีทีละก้อน
 * แทนที่จะโหลดทั้งไฟล์เข้าหน่วยความจำก่อน (ต่างจาก applyPPF ใน ppf.js ที่ต้องมีทั้งไฟล์
 * อยู่ใน BigBuffer พร้อมกัน)
 *
 * ใช้ตอนไฟล์ใหญ่จนมือถือ (โดยเฉพาะ Android — Safari ไม่รองรับ FileSystemWritableFileStream
 * เลย ไม่มีทางใช้ทางนี้ได้) มีแรมไม่พอจะโหลดทั้งไฟล์แบบเดิม — ดู ADR-017
 *
 * ใช้ได้เฉพาะ PPF เท่านั้น (ไม่ใช่ IPS/BPS) เพราะ PPF ไม่ขยาย/ตัดไฟล์ ขนาดผลลัพธ์เท่า
 * ต้นฉบับเป๊ะเสมอ ทำให้อ่านต้นฉบับตามลำดับตั้งแต่ต้นจนจบแล้วเขียนทับเป็นจุดๆ ระหว่างทางได้
 * ตรงไปตรงมา (ไม่ต้องสุ่มอ่าน/ต้องรู้ความยาวผลลัพธ์ล่วงหน้าแบบ BPS)
 */

import { parsePPFRecords } from './ppf.js';

const CHUNK_BYTES = 16 * 1024 * 1024; // 16MB — เล็กพอให้ใช้แรมน้อย ใหญ่พอไม่ต้องเรียก write() ถี่เกินไป

/**
 * @param {Blob} sourceFile ไฟล์ต้นฉบับ (จาก <input type=file>) — อ่านทีละก้อนผ่าน .slice()
 * @param {Uint8Array} patch เนื้อไฟล์ .ppf (ไฟล์เล็ก โหลดทั้งก้อนได้ตามปกติ)
 * @param {{ write(chunk: Uint8Array): Promise<void> }} writable ปลายทางที่เขียนผลลัพธ์ออก
 *   (เช่น FileSystemWritableFileStream จาก showSaveFilePicker())
 * @param {(written: number, total: number) => void} [onProgress]
 * @param {number} [chunkBytes] ขนาดก้อนที่อ่าน/เขียนต่อรอบ (ปรับได้เพื่อเทสจุดต่อระหว่างก้อน
 *   โดยไม่ต้องสร้างไฟล์ทดสอบขนาดหลาย GB จริง — การใช้งานจริงปล่อยใช้ค่าเริ่มต้นเสมอ)
 */
export async function streamApplyPPF(sourceFile, patch, writable, onProgress, chunkBytes = CHUNK_BYTES) {
  const { expectedSourceSize, records } = parsePPFRecords(patch);
  const total = sourceFile.size;

  if (expectedSourceSize != null && total !== expectedSourceSize) {
    throw new Error(
      `ขนาดไฟล์ต้นฉบับไม่ตรงกับที่แพตช์ต้องการ (ต้องการ ${expectedSourceSize} ไบต์ แต่ได้ ${total} ไบต์)`
    );
  }

  // ตรวจ "เขียนเลยท้ายไฟล์" ให้ครบทุกเรคคอร์ดก่อนเริ่มเขียนอะไรจริง — กันเขียนไฟล์ปลายทาง
  // ไปแล้วครึ่งหนึ่งค่อยมาพบว่าแพตช์ผิดรุ่นทีหลัง (ไฟล์ที่ผู้ใช้เลือกไว้จะพังครึ่งๆ กลางๆ)
  for (const rec of records) {
    if (rec.offset + rec.data.length > total) {
      throw new Error(
        'แพตช์พยายามเขียนเลยท้ายไฟล์ต้นฉบับ — น่าจะใช้ไฟล์เกมผิดรุ่นหรือผิดรูปแบบการ dump'
      );
    }
  }

  // windowStart = ดัชนีแรกใน records ที่ยังอาจ overlap ก้อนที่กำลังจะประมวลผลหรือก้อนถัดไป
  // (เรคคอร์ดปกติไม่ overlap กันเอง เพราะตัวสร้างแพตช์จริงเทียบไฟล์ทีละไบต์แล้วรวมช่วงที่ต่าง
  // กันเป็นเรคคอร์ดเดียวอยู่แล้ว แต่เขียนให้ทนกรณี overlap ได้ด้วย โดยประมวลผลเรคคอร์ดที่ยัง
  // "ค้าง" อยู่ซ้ำทุกก้อนที่มันแตะ เรียงตาม offset เสมอ — ให้ผลเหมือน applyPPF ที่เขียนทับ
  // ตามลำดับ offset จากน้อยไปมาก (ตัวหลังทับตัวก่อนถ้าตำแหน่งชนกัน) ไม่ว่าจะแบ่งก้อนแบบไหน
  let windowStart = 0;

  for (let chunkStart = 0; chunkStart < total; chunkStart += chunkBytes) {
    const chunkEnd = Math.min(chunkStart + chunkBytes, total);
    const chunk = new Uint8Array(await sourceFile.slice(chunkStart, chunkEnd).arrayBuffer());

    while (windowStart < records.length) {
      const rec = records[windowStart];
      if (rec.offset + rec.data.length > chunkStart) break;
      windowStart++; // เรคคอร์ดนี้จบสนิทไปแล้วก่อนก้อนนี้ ไม่มีทาง overlap อะไรอีก
    }

    for (let i = windowStart; i < records.length && records[i].offset < chunkEnd; i++) {
      const rec = records[i];
      const overlapStart = Math.max(rec.offset, chunkStart);
      const overlapEnd = Math.min(rec.offset + rec.data.length, chunkEnd);
      if (overlapStart >= overlapEnd) continue;
      chunk.set(
        rec.data.subarray(overlapStart - rec.offset, overlapEnd - rec.offset),
        overlapStart - chunkStart
      );
    }

    await writable.write(chunk);
    onProgress?.(chunkEnd, total);
  }
}
