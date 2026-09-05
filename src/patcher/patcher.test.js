import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { applyIPS } from './ips.js';
import { applyBPS } from './bps.js';
import { applyPPF } from './ppf.js';
import { applyPatch, detectFormat } from './index.js';
import { crc32 } from './crc32.js';
import { BigBuffer } from './big-buffer.js';

const bytes = (...values) => new Uint8Array(values);
const ascii = (text) => Array.from(text, (c) => c.charCodeAt(0));

/**
 * แพตช์ทุกตัวในไฟล์นี้เขียนด้วยมือทีละไบต์ตาม spec
 * ไม่ได้สร้างจาก encoder ของเราเอง เพื่อไม่ให้บั๊กเดียวกันหักล้างกันเองจนมองไม่เห็น
 *
 * ตัวแปะแพตช์ทั้ง 3 รูปแบบรับ `source` เป็น BigBuffer (ไม่ใช่ Uint8Array ตรงๆ) ตั้งแต่
 * เปลี่ยนให้รองรับไฟล์ที่ใหญ่กว่า ~2GB ได้ (ดู ADR-016) — เทสทุกชุดในไฟล์นี้จึงรันซ้ำที่
 * "ขนาด segment" หลายแบบ ทั้งแบบก้อนเดียวใหญ่ (พฤติกรรมเดิมก่อนเปลี่ยน) และแบบ segment
 * เล็กจิ๋ว (1-3 ไบต์) ที่บังคับให้ทุกการอ่าน/เขียนต้องข้าม segment หลายรอบ เพื่อพิสูจน์ว่า
 * ตรรกะข้าม segment ถูกต้องจริง ไม่ใช่ผ่านแค่เพราะข้อมูลทดสอบเล็กจนอยู่ segment เดียวพอดี
 */
const SEGMENT_SIZES = [1_000_000, 1, 2, 3];

const toBig = (uint8arr, segmentBytes) => BigBuffer.fromUint8Array(uint8arr, segmentBytes);

/** แปลง BigBuffer กลับเป็น array ธรรมดาไว้เทียบผลลัพธ์ในเทส */
function flat(big) {
  const out = new Uint8Array(big.length);
  let offset = 0;
  for (const seg of big.segments) {
    out.set(seg, offset);
    offset += seg.length;
  }
  return Array.from(out);
}

describe('crc32', () => {
  test('ตรงกับค่าตรวจสอบมาตรฐานของ CRC-32', () => {
    // ค่านี้เป็นค่ามาตรฐานที่ spec CRC-32 (IEEE) กำหนดไว้สำหรับสตริง "123456789"
    assert.equal(crc32(new Uint8Array(ascii('123456789'))), 0xcbf43926);
  });

  test('ไฟล์ว่างได้ 0', () => {
    assert.equal(crc32(new Uint8Array(0)), 0);
  });
});

for (const segmentBytes of SEGMENT_SIZES) {
  const suffix = ` (segment ${segmentBytes} ไบต์)`;

  describe(`IPS${suffix}`, () => {
    test('เขียนทับข้อมูลตามตำแหน่งที่ระบุ', () => {
      const source = bytes(0, 1, 2, 3, 4, 5, 6, 7, 8, 9);
      const patch = bytes(
        ...ascii('PATCH'),
        0x00, 0x00, 0x02,       // offset 2
        0x00, 0x03,             // ยาว 3 ไบต์
        0xaa, 0xbb, 0xcc,       // ข้อมูลใหม่
        ...ascii('EOF')
      );

      assert.deepEqual(
        flat(applyIPS(toBig(source, segmentBytes), patch)),
        [0, 1, 0xaa, 0xbb, 0xcc, 5, 6, 7, 8, 9]
      );
    });

    test('เรคคอร์ดแบบ RLE เขียนค่าเดิมซ้ำ', () => {
      const source = bytes(0, 1, 2, 3, 4, 5);
      const patch = bytes(
        ...ascii('PATCH'),
        0x00, 0x00, 0x01,       // offset 1
        0x00, 0x00,             // ยาว 0 = เป็นเรคคอร์ด RLE
        0x00, 0x03,             // ซ้ำ 3 ครั้ง
        0xff,                   // ด้วยค่านี้
        ...ascii('EOF')
      );

      assert.deepEqual(flat(applyIPS(toBig(source, segmentBytes), patch)), [0, 0xff, 0xff, 0xff, 4, 5]);
    });

    test('ขยายไฟล์ได้เมื่อแพตช์เขียนเลยท้ายไฟล์เดิม', () => {
      const source = bytes(1, 2);
      const patch = bytes(
        ...ascii('PATCH'),
        0x00, 0x00, 0x03,       // offset 3 ซึ่งเลยท้ายไฟล์เดิม
        0x00, 0x02,
        0x07, 0x08,
        ...ascii('EOF')
      );

      assert.deepEqual(flat(applyIPS(toBig(source, segmentBytes), patch)), [1, 2, 0, 0x07, 0x08]);
    });

    test('ตัดไฟล์ให้สั้นลงเมื่อมี 3 ไบต์ต่อท้าย EOF', () => {
      const source = bytes(1, 2, 3, 4, 5, 6, 7, 8);
      const patch = bytes(...ascii('PATCH'), ...ascii('EOF'), 0x00, 0x00, 0x04);

      assert.deepEqual(flat(applyIPS(toBig(source, segmentBytes), patch)), [1, 2, 3, 4]);
    });

    test('ปฏิเสธไฟล์ที่ไม่ใช่ IPS', () => {
      assert.throws(
        () => applyIPS(toBig(bytes(1, 2, 3), segmentBytes), bytes(...ascii('NOPE!'), ...ascii('EOF'))),
        /ไม่ถูกต้อง/
      );
    });

    test('ปฏิเสธไฟล์ที่ขาดกลางคัน', () => {
      const patch = bytes(...ascii('PATCH'), 0x00, 0x00, 0x02, 0x00, 0x05, 0xaa);
      assert.throws(() => applyIPS(toBig(bytes(1, 2, 3, 4), segmentBytes), patch), /ขาดกลางคัน/);
    });
  });

  describe(`BPS${suffix}`, () => {
    const varint = (n) => {
      const out = [];
      for (;;) {
        const x = n & 0x7f;
        n = Math.floor(n / 128);
        if (n === 0) {
          out.push(0x80 | x);
          return out;
        }
        out.push(x);
        n -= 1;
      }
    };

    const signedVarint = (n) => varint(n < 0 ? (-n << 1) | 1 : n << 1);
    const action = (command, length) => varint(((length - 1) << 2) | command);
    const uint32LE = (n) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];

    /** ต่อ header + actions + footer ให้เป็นไฟล์ BPS ที่สมบูรณ์ (ใช้ crc32 บน Uint8Array ปกติ
        เพราะนี่คือการ "สร้าง" ไฟล์แพตช์ทดสอบ ไม่ใช่การรัน applyBPS จริง) */
    const buildPatch = (source, target, actions) => {
      const body = [
        ...ascii('BPS1'),
        ...varint(source.length),
        ...varint(target.length),
        ...varint(0), // ไม่มี metadata
        ...actions,
        ...uint32LE(crc32(source)),
        ...uint32LE(crc32(target)),
      ];
      return bytes(...body, ...uint32LE(crc32(new Uint8Array(body))));
    };

    test('SourceRead คัดจากตำแหน่งเดียวกัน และ TargetRead ใช้ข้อมูลใหม่จากแพตช์', () => {
      const source = bytes(0x10, 0x11, 0x12, 0x13);
      const target = bytes(0x10, 0x11, 0xaa, 0xbb);
      const patch = buildPatch(source, target, [
        ...action(0, 2),                  // SourceRead 2 ไบต์
        ...action(1, 2), 0xaa, 0xbb,      // TargetRead 2 ไบต์
      ]);

      assert.deepEqual(flat(applyBPS(toBig(source, segmentBytes), patch)), Array.from(target));
    });

    test('SourceCopy กระโดดไปคัดจากตำแหน่งอื่นได้ทั้งเดินหน้าและถอยหลัง', () => {
      const source = bytes(0x10, 0x11, 0x12, 0x13);
      const target = bytes(0x13, 0x12);
      const patch = buildPatch(source, target, [
        ...action(2, 1), ...signedVarint(3),   // ไปข้างหน้า 3 → source[3]
        ...action(2, 1), ...signedVarint(-2),  // ถอยหลัง 2 → source[2]
      ]);

      assert.deepEqual(flat(applyBPS(toBig(source, segmentBytes), patch)), Array.from(target));
    });

    test('TargetCopy ที่ช่วงซ้อนทับกันใช้ทำ RLE ได้', () => {
      const source = bytes(0x00, 0x00, 0x00, 0x00);
      const target = bytes(0xaa, 0xaa, 0xaa, 0xaa);
      const patch = buildPatch(source, target, [
        ...action(1, 1), 0xaa,                 // เขียน 0xAA ตัวแรก
        ...action(3, 3), ...signedVarint(0),   // แล้วคัดทับตัวเองต่ออีก 3
      ]);

      assert.deepEqual(flat(applyBPS(toBig(source, segmentBytes), patch)), Array.from(target));
    });

    test('ปฏิเสธไฟล์ต้นฉบับผิดรุ่น (checksum ไม่ตรง)', () => {
      const source = bytes(0x10, 0x11, 0x12, 0x13);
      const patch = buildPatch(source, bytes(0x10, 0x11), [...action(0, 2)]);
      const wrongSource = bytes(0x10, 0x11, 0x12, 0xff);

      assert.throws(() => applyBPS(toBig(wrongSource, segmentBytes), patch), /ไม่ตรงรุ่น/);
    });

    test('ปฏิเสธไฟล์ต้นฉบับผิดขนาด', () => {
      const source = bytes(0x10, 0x11, 0x12, 0x13);
      const patch = buildPatch(source, bytes(0x10, 0x11), [...action(0, 2)]);

      assert.throws(() => applyBPS(toBig(bytes(0x10, 0x11), segmentBytes), patch), /ขนาดไฟล์ต้นฉบับไม่ตรง/);
    });

    test('จับได้เมื่อไฟล์ผลลัพธ์ออกมาไม่ตรง checksum ที่แพตช์ระบุ', () => {
      const source = bytes(0x10, 0x11, 0x12, 0x13);
      const patch = buildPatch(source, bytes(0x10, 0x11), [...action(0, 2)]);

      // แก้ checksum ของผลลัพธ์ให้เพี้ยน แล้วซ่อมเฉพาะ checksum ของตัวแพตช์เอง
      const tampered = new Uint8Array(patch);
      tampered[tampered.length - 5] ^= 0xff;
      const fixed = new Uint8Array(tampered);
      fixed.set(uint32LE(crc32(tampered.subarray(0, tampered.length - 4))), tampered.length - 4);

      assert.throws(() => applyBPS(toBig(source, segmentBytes), fixed), /ไฟล์ผลลัพธ์ผิดพลาด/);
    });
  });

  describe(`PPF${suffix}`, () => {
    const header = (magic, extra = []) => [
      ...ascii(magic),
      0x00,                          // encoding
      ...new Array(50).fill(0x20),   // description
      ...extra,
    ];
    const uint32LE = (n) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];

    test('PPF1.0 เขียนทับตามตำแหน่ง', () => {
      const source = bytes(0, 1, 2, 3);
      const patch = bytes(...header('PPF10'), ...uint32LE(1), 0x02, 0xde, 0xad);

      assert.deepEqual(flat(applyPPF(toBig(source, segmentBytes), patch)), [0, 0xde, 0xad, 3]);
    });

    test('PPF2.0 ตรวจขนาดไฟล์ต้นฉบับก่อนแปะ', () => {
      const source = bytes(0, 1, 2, 3);
      const blockCheck = new Array(1024).fill(0);
      const patch = bytes(
        ...header('PPF20', [...uint32LE(4), ...blockCheck]),
        ...uint32LE(2), 0x01, 0xff
      );

      assert.deepEqual(flat(applyPPF(toBig(source, segmentBytes), patch)), [0, 1, 0xff, 3]);
    });

    test('PPF2.0 ปฏิเสธไฟล์ต้นฉบับผิดขนาด', () => {
      const blockCheck = new Array(1024).fill(0);
      const patch = bytes(
        ...header('PPF20', [...uint32LE(999), ...blockCheck]),
        ...uint32LE(0), 0x01, 0xff
      );

      assert.throws(() => applyPPF(toBig(bytes(0, 1, 2, 3), segmentBytes), patch), /ขนาดไฟล์ต้นฉบับไม่ตรง/);
    });

    test('PPF3.0 อ่าน offset แบบ 8 ไบต์ และข้ามข้อมูล undo', () => {
      const source = bytes(0, 1, 2, 3);
      const offset64 = [...uint32LE(1), ...uint32LE(0)];
      const patch = bytes(
        ...header('PPF30', [0x00 /* imagetype */, 0x00 /* ไม่มี blockcheck */, 0x01 /* มี undo */, 0x00]),
        ...offset64,
        0x02,
        0xde, 0xad,   // ข้อมูลใหม่
        0x01, 0x02    // ข้อมูลเดิมสำหรับย้อนกลับ — ต้องถูกข้าม ไม่ใช่เอามาเขียนทับ
      );

      assert.deepEqual(flat(applyPPF(toBig(source, segmentBytes), patch)), [0, 0xde, 0xad, 3]);
    });

    test('PPF3.0 ไม่อ่านบล็อกคำอธิบายท้ายไฟล์เป็นข้อมูล', () => {
      const source = bytes(0, 1, 2, 3);
      const patch = bytes(
        ...header('PPF30', [0x00, 0x00, 0x00, 0x00]),
        ...uint32LE(1), ...uint32LE(0),
        0x01,
        0xff,
        ...ascii('@BEGIN_FILE_ID.DIZ'),
        ...ascii('ทดสอบ'.split('').map(() => 'x').join('')),
        ...ascii('@END_FILE_ID.DIZ')
      );

      assert.deepEqual(flat(applyPPF(toBig(source, segmentBytes), patch)), [0, 0xff, 2, 3]);
    });

    test('ปฏิเสธเมื่อแพตช์เขียนเลยท้ายไฟล์ต้นฉบับ', () => {
      const patch = bytes(...header('PPF10'), ...uint32LE(10), 0x02, 0xde, 0xad);

      assert.throws(() => applyPPF(toBig(bytes(0, 1, 2, 3), segmentBytes), patch), /เลยท้ายไฟล์ต้นฉบับ/);
    });

    test('ปฏิเสธไฟล์ที่ไม่ใช่ PPF', () => {
      assert.throws(() => applyPPF(toBig(bytes(0, 1), segmentBytes), bytes(...header('XXXXX'))), /ไม่ถูกต้อง/);
    });
  });

  describe(`ทะเบียนตัวแปะ${suffix}`, () => {
    test('applyPatch ส่งงานต่อให้ตัวแปะที่ถูกรูปแบบ', () => {
      const source = bytes(0, 1, 2, 3);
      const patch = bytes(...ascii('PATCH'), 0x00, 0x00, 0x00, 0x00, 0x01, 0x99, ...ascii('EOF'));

      assert.deepEqual(flat(applyPatch(toBig(source, segmentBytes), patch, 'ips')), [0x99, 1, 2, 3]);
    });
  });
}

describe('ทะเบียนตัวแปะ', () => {
  test('เดารูปแบบจากนามสกุลไฟล์', () => {
    assert.equal(detectFormat('HM_BTN_Thai.ppf'), 'ppf');
    assert.equal(detectFormat('golden-sun.BPS'), 'bps');
    assert.equal(detectFormat('เกมไทย.ips'), 'ips');
    assert.equal(detectFormat('patch.xdelta'), null);
    assert.equal(detectFormat('ไม่มีนามสกุล'), null);
  });

  test('บอกให้รู้เมื่อเจอรูปแบบที่ยังไม่รองรับ', () => {
    assert.throws(() => applyPatch(toBig(bytes(0), 1_000_000), bytes(0), 'xdelta'), /ยังไม่รองรับ/);
  });
});
