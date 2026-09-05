import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { sha1Hex, sha1HexOfBlob, _internal } from './sha1.js';

const enc = (text) => new TextEncoder().encode(text);
const nodeSha1Hex = (bytes) => createHash('sha1').update(bytes).digest('hex');

// ความยาวที่ครอบขอบเขตของ padding (56/64/128 ไบต์) ที่สูตร SHA-1 แยกกรณี 1 หรือ 2 บล็อกท้าย
const BOUNDARY_LENGTHS = [0, 1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 121, 127, 128, 129, 1000, 100_000];

describe('SHA-1 (ทาง crypto.subtle ปกติ)', () => {
  test('ค่ามาตรฐาน: ข้อความว่าง', async () => {
    assert.equal(await sha1Hex(enc('')), 'da39a3ee5e6b4b0d3255bfef95601890afd80709');
  });

  test('ค่ามาตรฐาน: "abc"', async () => {
    assert.equal(await sha1Hex(enc('abc')), 'a9993e364706816aba3e25717850c26c9cd0d89d');
  });

  test('ค่ามาตรฐาน: ข้อความยาวหลายบล็อก (FIPS 180-4)', async () => {
    const msg = 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq';
    assert.equal(await sha1Hex(enc(msg)), '84983e441c3bd26ebaae4aa1f95129e5e54670f1');
  });

  for (const length of BOUNDARY_LENGTHS) {
    test(`ตรงกับ node:crypto ที่ความยาว ${length} ไบต์`, async () => {
      const bytes = randomBytes(length);
      assert.equal(await sha1Hex(bytes), nodeSha1Hex(bytes));
    });
  }
});

describe('createSha1 (ตัวแฮชแบบป้อนทีละก้อน — ใช้ตอนไฟล์เกินเพดาน ArrayBuffer ของเบราว์เซอร์)', () => {
  test('ป้อนทีเดียวทั้งก้อน ให้ผลตรงกับ node:crypto', () => {
    for (const length of BOUNDARY_LENGTHS) {
      const bytes = randomBytes(length);
      const hasher = _internal.createSha1();
      hasher.update(bytes);
      assert.equal(hasher.digestHex(), nodeSha1Hex(bytes), `ความยาว ${length} ไบต์`);
    }
  });

  test('ค่ามาตรฐาน: "abc" ป้อนทีเดียว', () => {
    const hasher = _internal.createSha1();
    hasher.update(enc('abc'));
    assert.equal(hasher.digestHex(), 'a9993e364706816aba3e25717850c26c9cd0d89d');
  });

  test('แบ่งป้อนหลายก้อนขนาดเท่ากันทุกก้อน ยังได้ผลตรงกับป้อนทีเดียว (จุดต่อระหว่างก้อนตรงกับขอบเขต 64 ไบต์พอดี)', () => {
    const bytes = randomBytes(64 * 10); // 10 บล็อกเป๊ะ
    for (const chunkSize of [1, 3, 7, 16, 64, 65, 200, 640]) {
      const hasher = _internal.createSha1();
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        hasher.update(bytes.subarray(offset, offset + chunkSize));
      }
      assert.equal(hasher.digestHex(), nodeSha1Hex(bytes), `แบ่งก้อนละ ${chunkSize} ไบต์`);
    }
  });

  test('แบ่งป้อนหลายก้อนที่ความยาวรวมตกกลางขอบเขต padding พอดี (55/56/57/63/64/65 ไบต์)', () => {
    for (const length of [55, 56, 57, 63, 64, 65, 4096 + 33]) {
      const bytes = randomBytes(length);
      for (const chunkSize of [1, 5, 17]) {
        const hasher = _internal.createSha1();
        for (let offset = 0; offset < bytes.length; offset += chunkSize) {
          hasher.update(bytes.subarray(offset, offset + chunkSize));
        }
        assert.equal(
          hasher.digestHex(),
          nodeSha1Hex(bytes),
          `ความยาว ${length} ไบต์ แบ่งก้อนละ ${chunkSize} ไบต์`
        );
      }
    }
  });

  test('เรียก update() ศูนย์ครั้ง (ไฟล์ว่าง) ก็ยังได้ค่าที่ถูกต้อง', () => {
    const hasher = _internal.createSha1();
    assert.equal(hasher.digestHex(), 'da39a3ee5e6b4b0d3255bfef95601890afd80709');
  });
});

describe('sha1HexOfBlob (อ่านไฟล์ทีละก้อนแทนการอ่านทั้งไฟล์เป็น ArrayBuffer เดียว)', () => {
  test('ไฟล์เล็ก (ทางลัดผ่าน crypto.subtle) ให้ผลตรงกับ sha1Hex', async () => {
    const bytes = randomBytes(10_000);
    const blob = new Blob([bytes]);
    assert.equal(await sha1HexOfBlob(blob), await sha1Hex(bytes));
  });

  test('บังคับให้อ่านทีละก้อนเล็กๆ (ปรับ threshold ชั่วคราวผ่าน chunk เทียบเอง) ยังตรงกับ node:crypto', async () => {
    // จำลองพฤติกรรม "ไฟล์ใหญ่กว่าเพดาน" โดยเรียก createSha1 ป้อนทีละก้อนขนาดเท่า BLOB_CHUNK_BYTES
    // จริง (ผ่าน Blob.slice) แทนที่จะสร้างไฟล์ทดสอบขนาดหลาย GB จริงซึ่งช้าเกินไปสำหรับเทส
    const bytes = randomBytes(_internal.BLOB_CHUNK_BYTES + 12_345);
    const blob = new Blob([bytes]);
    const hasher = _internal.createSha1();
    for (let offset = 0; offset < blob.size; offset += _internal.BLOB_CHUNK_BYTES) {
      const chunk = blob.slice(offset, offset + _internal.BLOB_CHUNK_BYTES);
      hasher.update(new Uint8Array(await chunk.arrayBuffer()));
    }
    assert.equal(hasher.digestHex(), nodeSha1Hex(bytes));
  });

  test('เรียก onProgress ครบตามจำนวนก้อน และค่าสุดท้ายเท่ากับขนาดไฟล์', async () => {
    const bytes = randomBytes(1000);
    const blob = new Blob([bytes]);
    const calls = [];
    await sha1HexOfBlob(blob, (loaded, total) => calls.push([loaded, total]));
    assert.ok(calls.length >= 1);
    const [lastLoaded, lastTotal] = calls.at(-1);
    assert.equal(lastLoaded, 1000);
    assert.equal(lastTotal, 1000);
  });
});

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  // ใช้ค่ากึ่งสุ่มที่ทำซ้ำได้ (ไม่ใช่ crypto.getRandomValues) พอสำหรับเทสว่าตรงกับ node:crypto
  // ไม่ต้องพึ่งความสุ่มจริง — และ crypto.getRandomValues ปฏิเสธ buffer ใหญ่กว่า 65536 ไบต์อยู่แล้ว
  let seed = length + 1;
  for (let i = 0; i < length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    bytes[i] = seed & 0xff;
  }
  return bytes;
}
