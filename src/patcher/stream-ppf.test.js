import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { streamApplyPPF } from './stream-ppf.js';
import { applyPPF } from './ppf.js';
import { BigBuffer } from './big-buffer.js';

const bytes = (...values) => new Uint8Array(values);
const ascii = (text) => Array.from(text, (c) => c.charCodeAt(0));
const uint32LE = (n) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
const header = (magic, extra = []) => [
  ...ascii(magic),
  0x00, // encoding
  ...new Array(50).fill(0x20), // description
  ...extra,
];

/** ตัว writable จำลอง — เก็บทุกก้อนที่เขียนไว้ แล้วรวมเป็น Uint8Array เดียวตอนจบให้เทียบผลลัพธ์ */
function collectingWritable() {
  const chunks = [];
  return {
    write: async (chunk) => {
      chunks.push(chunk.slice()); // สำเนาไว้ กัน caller เอา buffer เดิมไปใช้ซ้ำ (เช่นใน stream-ppf.js เอง)
    },
    result: () => {
      const total = chunks.reduce((sum, c) => sum + c.length, 0);
      const out = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) {
        out.set(c, offset);
        offset += c.length;
      }
      return out;
    },
  };
}

function randomBytes(length, seed = length + 1) {
  const out = new Uint8Array(length);
  let s = seed;
  for (let i = 0; i < length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    out[i] = s & 0xff;
  }
  return out;
}

describe('streamApplyPPF', () => {
  test('PPF1.0 ค่าพื้นฐาน — ตรงกับ applyPPF', async () => {
    const source = bytes(0, 1, 2, 3);
    const patch = bytes(...header('PPF10'), ...uint32LE(1), 0x02, 0xde, 0xad);

    const blob = new Blob([source]);
    const writable = collectingWritable();
    await streamApplyPPF(blob, patch, writable);

    const expected = applyPPF(BigBuffer.fromUint8Array(source), patch);
    assert.deepEqual(Array.from(writable.result()), Array.from(expected.read(0, expected.length)));
    assert.deepEqual(Array.from(writable.result()), [0, 0xde, 0xad, 3]);
  });

  test('PPF2.0 ปฏิเสธไฟล์ต้นฉบับผิดขนาด', async () => {
    const blockCheck = new Array(1024).fill(0);
    const patch = bytes(...header('PPF20', [...uint32LE(999), ...blockCheck]), ...uint32LE(0), 0x01, 0xff);
    const blob = new Blob([bytes(0, 1, 2, 3)]);

    await assert.rejects(
      () => streamApplyPPF(blob, patch, collectingWritable()),
      /ขนาดไฟล์ต้นฉบับไม่ตรง/
    );
  });

  test('ปฏิเสธเมื่อแพตช์เขียนเลยท้ายไฟล์ต้นฉบับ (ไม่เขียนอะไรออกไปก่อนโยน error)', async () => {
    const patch = bytes(...header('PPF10'), ...uint32LE(10), 0x02, 0xde, 0xad);
    const blob = new Blob([bytes(0, 1, 2, 3)]);
    const writable = collectingWritable();

    await assert.rejects(
      () => streamApplyPPF(blob, patch, writable),
      /เลยท้ายไฟล์ต้นฉบับ/
    );
    assert.equal(writable.result().length, 0);
  });

  test('เรคคอร์ดตกกลางรอยต่อก้อนพอดี (chunk เล็กจิ๋ว) ยังเขียนถูกทุกไบต์', async () => {
    // แพตช์เขียนทับตำแหน่ง 2..4 (3 ไบต์) กับ chunk ขนาด 3 ไบต์ ทำให้เรคคอร์ดนี้คร่อม
    // รอยต่อก้อนที่ 1 (0-2) กับก้อนที่ 2 (3-5) พอดี
    const source = bytes(0, 1, 2, 3, 4, 5, 6, 7, 8, 9);
    const patch = bytes(...header('PPF10'), ...uint32LE(2), 0x03, 0xaa, 0xbb, 0xcc);
    const blob = new Blob([source]);
    const writable = collectingWritable();

    await streamApplyPPF(blob, patch, writable, undefined, 3);

    assert.deepEqual(Array.from(writable.result()), [0, 1, 0xaa, 0xbb, 0xcc, 5, 6, 7, 8, 9]);
  });

  test('หลายเรคคอร์ดกระจายทั่วไฟล์ ตรงกับ applyPPF ที่ chunk หลายขนาด', async () => {
    const sourceLen = 5000;
    const source = randomBytes(sourceLen, 7);

    // เรคคอร์ดกระจายทั่วไฟล์ รวมถึงตำแหน่งที่ชนขอบเขตของ chunk ขนาดต่างๆ ที่จะทดสอบ
    const points = [
      { offset: 0, data: [0xde, 0xad] },
      { offset: 63, data: [1, 2, 3, 4, 5] },
      { offset: 64, data: [9] },
      { offset: 127, data: [7, 7, 7] },
      { offset: 1000, data: randomBytes(200, 99) },
      { offset: 4998, data: [0xff, 0xee] },
    ];

    const records = [];
    for (const p of points) {
      records.push(...uint32LE(p.offset), p.data.length, ...p.data);
    }
    const patch = bytes(...header('PPF10'), ...records);

    const expectedBig = applyPPF(BigBuffer.fromUint8Array(source.slice()), patch);
    const expected = Array.from(expectedBig.read(0, expectedBig.length));

    for (const chunkBytes of [1, 7, 32, 64, 128, 999, 100000]) {
      const blob = new Blob([source]);
      const writable = collectingWritable();
      await streamApplyPPF(blob, patch, writable, undefined, chunkBytes);
      assert.deepEqual(Array.from(writable.result()), expected, `chunkBytes=${chunkBytes}`);
    }
  });

  test('เรียก onProgress ครบและค่าสุดท้ายเท่ากับขนาดไฟล์', async () => {
    const source = randomBytes(1000);
    const patch = bytes(...header('PPF10'), ...uint32LE(0), 0x01, 0xff);
    const blob = new Blob([source]);
    const calls = [];

    await streamApplyPPF(blob, patch, collectingWritable(), (written, total) => calls.push([written, total]), 300);

    assert.ok(calls.length >= 1);
    const [lastWritten, lastTotal] = calls.at(-1);
    assert.equal(lastWritten, 1000);
    assert.equal(lastTotal, 1000);
  });

  test('ไฟล์ใหญ่ระดับหลาย MB พร้อมเรคคอร์ดจำนวนมาก ยังตรงกับ applyPPF', async () => {
    const sourceLen = 20 * 1024 * 1024; // 20MB
    const source = randomBytes(sourceLen, 42);

    const records = [];
    for (let i = 0; i < 500; i++) {
      const offset = Math.floor((i / 500) * (sourceLen - 200));
      const data = randomBytes(1 + (i % 200), offset + 1);
      records.push(...uint32LE(offset), data.length, ...data);
    }
    const patch = bytes(...header('PPF10'), ...records);

    const expectedBig = applyPPF(BigBuffer.fromUint8Array(source.slice(), 4 * 1024 * 1024), patch);
    const expected = Array.from(expectedBig.read(0, expectedBig.length));

    const blob = new Blob([source]);
    const writable = collectingWritable();
    await streamApplyPPF(blob, patch, writable);
    assert.deepEqual(Array.from(writable.result()), expected);
  });
});
