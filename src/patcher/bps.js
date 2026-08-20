/**
 * BPS — สร้างไฟล์ผลลัพธ์ขึ้นใหม่จากไฟล์ต้นฉบับ + คำสั่งในแพตช์
 * spec: https://www.romhacking.net/documents/746/
 *
 * ต่างจาก IPS/PPF ตรงที่ไม่ได้เขียนทับเป็นจุดๆ แต่ประกอบไฟล์ใหม่ทั้งก้อน
 * จึงกินหน่วยความจำมากกว่า — แต่ใช้กับ ROM เล็ก (SNES/GBA) จึงไม่ชนเพดาน
 *
 * BPS มี checksum ฝังมาในตัว ทำให้ตรวจได้ว่าไฟล์ต้นฉบับถูกรุ่นไหม
 * และไฟล์ผลลัพธ์ออกมาถูกต้องหรือเปล่า
 */

import { crc32 } from './crc32.js';

const MAGIC = [0x42, 0x50, 0x53, 0x31]; // "BPS1"

const SOURCE_READ = 0;
const TARGET_READ = 1;
const SOURCE_COPY = 2;
const TARGET_COPY = 3;

export function applyBPS(source, patch) {
  for (let i = 0; i < MAGIC.length; i++) {
    if (patch[i] !== MAGIC[i]) {
      throw new Error('ไฟล์แพตช์ BPS ไม่ถูกต้อง (ไม่พบหัวไฟล์ BPS1)');
    }
  }

  // 12 ไบต์สุดท้ายเป็น checksum ไม่ใช่คำสั่ง
  const actionsEnd = patch.length - 12;
  const reader = { bytes: patch, pos: MAGIC.length };

  const sourceSize = readVarint(reader);
  const targetSize = readVarint(reader);
  const metadataSize = readVarint(reader);
  reader.pos += metadataSize;

  if (source.length !== sourceSize) {
    throw new Error(
      `ขนาดไฟล์ต้นฉบับไม่ตรงกับที่แพตช์ต้องการ (ต้องการ ${sourceSize} ไบต์ แต่ได้ ${source.length} ไบต์)`
    );
  }

  const sourceChecksum = readUint32LE(patch, actionsEnd);
  if (crc32(source) !== sourceChecksum) {
    throw new Error('ไฟล์ต้นฉบับไม่ตรงรุ่นที่แพตช์นี้รองรับ (checksum ไม่ตรง)');
  }

  const target = new Uint8Array(targetSize);
  let outPos = 0;
  let sourceRelative = 0;
  let targetRelative = 0;

  while (reader.pos < actionsEnd) {
    const data = readVarint(reader);
    const command = data & 3;
    const length = (data >> 2) + 1;

    switch (command) {
      case SOURCE_READ:
        // คัดลอกจากตำแหน่งเดียวกันในไฟล์ต้นฉบับ
        target.set(source.subarray(outPos, outPos + length), outPos);
        outPos += length;
        break;

      case TARGET_READ:
        // ข้อมูลใหม่ที่ฝังมาในแพตช์ตรงๆ
        target.set(patch.subarray(reader.pos, reader.pos + length), outPos);
        reader.pos += length;
        outPos += length;
        break;

      case SOURCE_COPY: {
        sourceRelative += readSignedVarint(reader);
        target.set(source.subarray(sourceRelative, sourceRelative + length), outPos);
        sourceRelative += length;
        outPos += length;
        break;
      }

      case TARGET_COPY: {
        targetRelative += readSignedVarint(reader);
        // ต้องคัดทีละไบต์ เพราะช่วงต้นทางกับปลายทางซ้อนทับกันได้ (ใช้ทำ RLE)
        for (let i = 0; i < length; i++) {
          target[outPos++] = target[targetRelative++];
        }
        break;
      }
    }
  }

  const targetChecksum = readUint32LE(patch, actionsEnd + 4);
  if (crc32(target) !== targetChecksum) {
    throw new Error('ไฟล์ผลลัพธ์ผิดพลาด (checksum ไม่ตรง) — แพตช์อาจเสียหาย');
  }

  return target;
}

/**
 * varint ของ BPS: 7 บิตต่อไบต์ บิตสูงสุดเป็นตัวบอกว่าจบแล้ว
 * และบวกค่าชดเชยทุกรอบเพื่อไม่ให้มีวิธีเข้ารหัสเลขเดียวกันได้หลายแบบ
 */
function readVarint(reader) {
  let result = 0;
  let shift = 1;

  for (;;) {
    const byte = reader.bytes[reader.pos++];
    result += (byte & 0x7f) * shift;
    if (byte & 0x80) return result;
    shift *= 128;
    result += shift;
  }
}

function readSignedVarint(reader) {
  const value = readVarint(reader);
  return value & 1 ? -(value >>> 1) : value >>> 1;
}

function readUint32LE(bytes, pos) {
  return (
    (bytes[pos] | (bytes[pos + 1] << 8) | (bytes[pos + 2] << 16) | (bytes[pos + 3] << 24)) >>> 0
  );
}
