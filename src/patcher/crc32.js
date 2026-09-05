let table = null;

function buildTable() {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let bit = 0; bit < 8; bit++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[i] = c >>> 0;
  }
  return t;
}

/** CRC-32 (IEEE) — ใช้ตรวจ checksum ที่ฝังมาในไฟล์ BPS */
export function crc32(bytes) {
  if (!table) table = buildTable();

  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * เหมือน crc32() แต่ไล่ทีละ segment ของ BigBuffer แทนที่จะต้องรวมเป็น Uint8Array
 * เดียวก่อน (ไฟล์ ROM ขนาด GB ระดับ PS2 รวมเป็นก้อนเดียวไม่ได้ — ดู big-buffer.js)
 */
export function crc32OfBigBuffer(bigBuffer) {
  if (!table) table = buildTable();

  let crc = 0xffffffff;
  for (const segment of bigBuffer.segments) {
    for (let i = 0; i < segment.length; i++) {
      crc = table[(crc ^ segment[i]) & 0xff] ^ (crc >>> 8);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
