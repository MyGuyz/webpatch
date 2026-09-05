import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { sha1Hex, _internal } from './sha1.js';

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

describe('SHA-1 (ทางสำรองเขียนเอง — ใช้ตอนไฟล์เกินเพดาน crypto.subtle)', () => {
  test('ค่ามาตรฐาน: ข้อความว่าง', async () => {
    assert.equal(await _internal.sha1HexPureJs(enc('')), 'da39a3ee5e6b4b0d3255bfef95601890afd80709');
  });

  test('ค่ามาตรฐาน: "abc"', async () => {
    assert.equal(await _internal.sha1HexPureJs(enc('abc')), 'a9993e364706816aba3e25717850c26c9cd0d89d');
  });

  for (const length of BOUNDARY_LENGTHS) {
    test(`ตรงกับ node:crypto ที่ความยาว ${length} ไบต์ (บังคับใช้ทางสำรอง)`, async () => {
      const bytes = randomBytes(length);
      assert.equal(await _internal.sha1HexPureJs(bytes), nodeSha1Hex(bytes));
    });
  }

  test('ประมวลผลได้มากกว่า 1 ล้านบล็อก (จุดที่โค้ดคั่นด้วย setTimeout) โดยไม่ค้างและได้ค่าถูกต้อง', async () => {
    // เกินจุด yield 1 ครั้งพอดี (YIELD_EVERY_BLOCKS = 1,000,000 บล็อก x 64 ไบต์) แต่เล็กพอให้เทสเร็ว
    const bytes = randomBytes(64 * 1_000_050);
    assert.equal(await _internal.sha1HexPureJs(bytes), nodeSha1Hex(bytes));
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
