/**
 * IPS — เขียนทับไฟล์ต้นฉบับเป็นจุดๆ ตาม offset ที่ระบุ
 * spec: https://zerosoft.zophar.net/ips.php
 *
 * ข้อจำกัดของฟอร์แมตเอง: offset เก็บด้วย 3 ไบต์ จึงอ้างถึงได้แค่ 16MB แรกของไฟล์
 */

const MAGIC = [0x50, 0x41, 0x54, 0x43, 0x48]; // "PATCH"
const EOF_MARKER = [0x45, 0x4f, 0x46]; // "EOF"

export function applyIPS(source, patch) {
  for (let i = 0; i < MAGIC.length; i++) {
    if (patch[i] !== MAGIC[i]) {
      throw new Error('ไฟล์แพตช์ IPS ไม่ถูกต้อง (ไม่พบหัวไฟล์ PATCH)');
    }
  }

  // เผื่อที่ไว้ก่อน เพราะบางแพตช์เขียนเลยท้ายไฟล์ต้นฉบับเพื่อขยายไฟล์
  let out = new Uint8Array(source);
  let pos = MAGIC.length;

  while (pos < patch.length) {
    if (isEofMarker(patch, pos)) {
      pos += EOF_MARKER.length;
      // ถ้ามี 3 ไบต์ต่อท้าย EOF แปลว่าให้ตัดไฟล์ให้สั้นลงเท่านั้น
      if (pos + 3 <= patch.length) {
        out = out.subarray(0, readUint24(patch, pos));
      }
      return out;
    }

    if (pos + 5 > patch.length) {
      throw new Error('ไฟล์แพตช์ IPS ขาดกลางคัน (เรคคอร์ดไม่ครบ)');
    }

    const offset = readUint24(patch, pos);
    const size = (patch[pos + 3] << 8) | patch[pos + 4];
    pos += 5;

    if (size === 0) {
      // เรคคอร์ดแบบ RLE: เขียนค่าเดิมซ้ำหลายไบต์
      if (pos + 3 > patch.length) {
        throw new Error('ไฟล์แพตช์ IPS ขาดกลางคัน (เรคคอร์ด RLE ไม่ครบ)');
      }
      const runLength = (patch[pos] << 8) | patch[pos + 1];
      const value = patch[pos + 2];
      pos += 3;

      out = growIfNeeded(out, offset + runLength);
      out.fill(value, offset, offset + runLength);
    } else {
      if (pos + size > patch.length) {
        throw new Error('ไฟล์แพตช์ IPS ขาดกลางคัน (ข้อมูลไม่ครบ)');
      }
      out = growIfNeeded(out, offset + size);
      out.set(patch.subarray(pos, pos + size), offset);
      pos += size;
    }
  }

  throw new Error('ไฟล์แพตช์ IPS ไม่สมบูรณ์ (ไม่พบเครื่องหมายจบไฟล์)');
}

function isEofMarker(patch, pos) {
  return (
    patch[pos] === EOF_MARKER[0] &&
    patch[pos + 1] === EOF_MARKER[1] &&
    patch[pos + 2] === EOF_MARKER[2]
  );
}

function readUint24(bytes, pos) {
  return (bytes[pos] << 16) | (bytes[pos + 1] << 8) | bytes[pos + 2];
}

function growIfNeeded(out, requiredLength) {
  if (requiredLength <= out.length) return out;
  const bigger = new Uint8Array(requiredLength);
  bigger.set(out);
  return bigger;
}
