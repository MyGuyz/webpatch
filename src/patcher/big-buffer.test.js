import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { BigBuffer } from './big-buffer.js';

const arr = (n) => Array.from({ length: n }, (_, i) => i & 0xff);

describe('BigBuffer — สร้างและอ่าน/เขียนพื้นฐาน', () => {
  test('สร้างว่างเปล่าแล้วอ่านคืนเป็นศูนย์ทั้งหมด', () => {
    const big = new BigBuffer(10, 3);
    assert.equal(big.length, 10);
    assert.deepEqual(Array.from(big.read(0, 10)), new Array(10).fill(0));
  });

  test('จำนวน/ขนาด segment ถูกต้องตาม segmentBytes ที่กำหนด', () => {
    const big = new BigBuffer(10, 3);
    assert.equal(big.segments.length, 4); // 3+3+3+1
    assert.deepEqual(
      big.segments.map((s) => s.length),
      [3, 3, 3, 1]
    );
  });

  test('fromUint8Array แบ่ง segment ถูกต้องและอ่านคืนตรงกับต้นฉบับ', () => {
    const source = new Uint8Array(arr(10));
    for (const segmentBytes of [1, 2, 3, 4, 100]) {
      const big = BigBuffer.fromUint8Array(source, segmentBytes);
      assert.equal(big.length, 10, `segmentBytes=${segmentBytes}`);
      assert.deepEqual(Array.from(big.read(0, 10)), arr(10), `segmentBytes=${segmentBytes}`);
    }
  });

  test('fromUint8Array กับ array ว่างได้ length 0 ไม่มี segment', () => {
    const big = BigBuffer.fromUint8Array(new Uint8Array(0), 5);
    assert.equal(big.length, 0);
    assert.equal(big.segments.length, 0);
  });

  test('readByte/writeByte อ่านเขียนถูกจุดข้าม segment', () => {
    const big = new BigBuffer(10, 3);
    for (let i = 0; i < 10; i++) big.writeByte(i, i + 1);
    for (let i = 0; i < 10; i++) assert.equal(big.readByte(i), i + 1, `ตำแหน่ง ${i}`);
  });

  test('read ข้าม segment หลายรอบให้ผลลัพธ์ต่อเนื่องถูกต้อง', () => {
    const big = BigBuffer.fromUint8Array(new Uint8Array(arr(20)), 3);
    assert.deepEqual(Array.from(big.read(0, 20)), arr(20));
    assert.deepEqual(Array.from(big.read(2, 5)), arr(20).slice(2, 7));
    assert.deepEqual(Array.from(big.read(17, 3)), arr(20).slice(17, 20));
    // อ่านเริ่ม/จบตรง "รอยต่อ" ของ segment (3, 6, 9, ...) พอดี
    assert.deepEqual(Array.from(big.read(3, 3)), arr(20).slice(3, 6));
    assert.deepEqual(Array.from(big.read(6, 1)), arr(20).slice(6, 7));
  });

  test('write ข้าม segment หลายรอบเขียนถูกจุดทุกไบต์', () => {
    const big = new BigBuffer(20, 3);
    const payload = new Uint8Array(arr(20).map((n) => n + 100));
    big.write(0, payload);
    assert.deepEqual(Array.from(big.read(0, 20)), Array.from(payload));
  });

  test('write บางส่วนกลาง buffer ไม่กระทบไบต์อื่นที่ไม่ได้เขียน', () => {
    const big = BigBuffer.fromUint8Array(new Uint8Array(arr(10)), 3);
    big.write(4, new Uint8Array([0xaa, 0xbb, 0xcc]));
    assert.deepEqual(Array.from(big.read(0, 10)), [0, 1, 2, 3, 0xaa, 0xbb, 0xcc, 7, 8, 9]);
  });
});

describe('BigBuffer — fill', () => {
  test('เติมค่าเดียวกันข้าม segment ได้ครบทุกไบต์ในช่วงที่กำหนด', () => {
    const big = new BigBuffer(10, 3);
    big.fill(0xff, 2, 8);
    assert.deepEqual(Array.from(big.read(0, 10)), [0, 0, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0, 0]);
  });

  test('fill ทั้งก้อนพอดี', () => {
    const big = new BigBuffer(7, 2);
    big.fill(9, 0, 7);
    assert.deepEqual(Array.from(big.read(0, 7)), new Array(7).fill(9));
  });
});

describe('BigBuffer — copyWithinSelf (ใช้ทำ RLE แบบ BPS TargetCopy)', () => {
  test('คัดลอกช่วงไม่ซ้อนทับ ข้าม segment ได้ถูกต้อง', () => {
    const big = BigBuffer.fromUint8Array(new Uint8Array(arr(10)), 3);
    big.copyWithinSelf(0, 5, 5); // เอาไบต์ 5..9 ไปวางที่ 0..4
    assert.deepEqual(Array.from(big.read(0, 10)), [5, 6, 7, 8, 9, 5, 6, 7, 8, 9]);
  });

  test('คัดลอกช่วงซ้อนทับ (dst > src ติดกัน) ทำ RLE ได้เหมือนไล่ทีละไบต์', () => {
    const big = new BigBuffer(6, 2);
    big.writeByte(0, 0xaa);
    big.copyWithinSelf(1, 0, 5); // เขียน 0xAA ซ้ำต่อไปเรื่อยๆ จากตัวก่อนหน้าตัวเอง
    assert.deepEqual(Array.from(big.read(0, 6)), [0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa]);
  });

  test('ตรงกับผลลัพธ์ของการไล่ทีละไบต์ด้วยมือ (อ้างอิง) ที่ segment ต่างกัน', () => {
    const reference = new Uint8Array(arr(12));
    // จำลอง target[dst++] = target[src++] ทีละไบต์แบบ bps.js เดิม
    let src = 1;
    let dst = 4;
    for (let i = 0; i < 6; i++) reference[dst + i] = reference[src + i];

    for (const segmentBytes of [1, 2, 3, 4, 100]) {
      const big = BigBuffer.fromUint8Array(new Uint8Array(arr(12)), segmentBytes);
      big.copyWithinSelf(4, 1, 6);
      assert.deepEqual(Array.from(big.read(0, 12)), Array.from(reference), `segmentBytes=${segmentBytes}`);
    }
  });
});

describe('BigBuffer — grow', () => {
  test('ขยายภายใน segment สุดท้ายที่ยังไม่เต็มก่อน แล้วค่อยเพิ่ม segment ใหม่', () => {
    const big = new BigBuffer(4, 3); // segment: [3, 1] — ตัวสุดท้ายมีที่ว่างอีก 2
    big.write(0, new Uint8Array([1, 2, 3, 4]));
    big.grow(9); // ต้องขยาย segment สุดท้ายให้เต็ม (3) แล้วเพิ่ม segment ใหม่อีก 1 ก้อน (3)
    assert.equal(big.length, 9);
    assert.deepEqual(Array.from(big.read(0, 9)), [1, 2, 3, 4, 0, 0, 0, 0, 0]);
    assert.deepEqual(
      big.segments.map((s) => s.length),
      [3, 3, 3]
    );
  });

  test('grow ให้เท่าเดิมหรือเล็กกว่าเดิมไม่ทำอะไร', () => {
    const big = BigBuffer.fromUint8Array(new Uint8Array(arr(5)), 2);
    big.grow(5);
    big.grow(2);
    assert.equal(big.length, 5);
    assert.deepEqual(Array.from(big.read(0, 5)), arr(5));
  });

  test('เขียนได้ถูกต้องหลัง grow ในทุกตำแหน่งรวมถึงส่วนที่ขยายใหม่', () => {
    const big = new BigBuffer(2, 4);
    big.write(0, new Uint8Array([9, 9]));
    big.grow(10);
    big.write(2, new Uint8Array(arr(8)));
    assert.deepEqual(Array.from(big.read(0, 10)), [9, 9, ...arr(8)]);
  });
});

describe('BigBuffer — truncate', () => {
  test('ตัดสั้นลงภายใน segment เดียวกัน', () => {
    const big = BigBuffer.fromUint8Array(new Uint8Array(arr(10)), 100);
    big.truncate(4);
    assert.equal(big.length, 4);
    assert.deepEqual(Array.from(big.read(0, 4)), arr(4));
  });

  test('ตัดสั้นลงข้าม segment ตัดทั้ง segment ที่เกินทิ้งไป', () => {
    const big = BigBuffer.fromUint8Array(new Uint8Array(arr(10)), 3);
    big.truncate(4);
    assert.equal(big.length, 4);
    assert.deepEqual(Array.from(big.read(0, 4)), arr(4));
    assert.deepEqual(
      big.segments.map((s) => s.length),
      [3, 1]
    );
  });

  test('ตัดที่ 0 ได้ length 0', () => {
    const big = BigBuffer.fromUint8Array(new Uint8Array(arr(5)), 2);
    big.truncate(0);
    assert.equal(big.length, 0);
  });
});

describe('BigBuffer — clone', () => {
  test('แก้ไข clone แล้วไม่กระทบต้นฉบับ', () => {
    const original = BigBuffer.fromUint8Array(new Uint8Array(arr(10)), 3);
    const clone = original.clone();

    clone.write(0, new Uint8Array([0xff, 0xff, 0xff]));

    assert.deepEqual(Array.from(original.read(0, 10)), arr(10));
    assert.deepEqual(Array.from(clone.read(0, 10)), [0xff, 0xff, 0xff, 3, 4, 5, 6, 7, 8, 9]);
  });
});

describe('BigBuffer — fromBlob / toBlob (Blob ของ Node รองรับ .slice()/.arrayBuffer() เหมือนเบราว์เซอร์)', () => {
  test('fromBlob อ่านทีละก้อนแล้วได้ข้อมูลตรงกับต้นฉบับ', async () => {
    const source = new Uint8Array(arr(23));
    const blob = new Blob([source]);

    for (const segmentBytes of [1, 4, 5, 100]) {
      const big = await BigBuffer.fromBlob(blob, segmentBytes);
      assert.equal(big.length, 23, `segmentBytes=${segmentBytes}`);
      assert.deepEqual(Array.from(big.read(0, 23)), arr(23), `segmentBytes=${segmentBytes}`);
    }
  });

  test('fromBlob เรียก onProgress ครบและค่าสุดท้ายเท่ากับขนาดไฟล์', async () => {
    const blob = new Blob([new Uint8Array(arr(10))]);
    const calls = [];
    await BigBuffer.fromBlob(blob, 3, (loaded, total) => calls.push([loaded, total]));
    assert.deepEqual(calls, [
      [3, 10],
      [6, 10],
      [9, 10],
      [10, 10],
    ]);
  });

  test('toBlob แล้วอ่านกลับได้ข้อมูลตรงกับต้นฉบับ (round-trip ผ่าน Blob จริง)', async () => {
    const source = new Uint8Array(arr(17));
    const big = BigBuffer.fromUint8Array(source, 4);
    const blob = big.toBlob();
    assert.equal(blob.size, 17);
    const roundTrip = new Uint8Array(await blob.arrayBuffer());
    assert.deepEqual(Array.from(roundTrip), Array.from(source));
  });
});
