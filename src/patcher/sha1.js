/**
 * หาลายนิ้วมือ (SHA-1) ของไฟล์
 *
 * ใช้สองที่: หน้าแปะแพตช์ (ตรวจว่าผู้ใช้เอาไฟล์ถูกรุ่นมาไหม)
 * และหน้า /tools/sha1 (ให้แอดมินหาค่าไปใส่ฐานข้อมูล)
 *
 * SHA-1 ถือว่าอ่อนเกินไปสำหรับงานความปลอดภัย แต่ตรงนี้ใช้ระบุ "รุ่นไฟล์"
 * ไม่ได้ใช้กันการปลอมแปลง และเป็นค่าที่วงการ ROM ใช้กันเป็นมาตรฐานอยู่แล้ว
 *
 * ทางหลักใช้ Web Crypto (`crypto.subtle.digest`) เพราะเป็นโค้ดเนทีฟเร็วกว่าเขียนเองมาก
 * แต่ตัว API นี้มีเพดานแอบแฝงที่ไม่มีเอกสารเตือนชัดๆ: เบราว์เซอร์ (ทั้ง Chrome และ Firefox)
 * ปฏิเสธ ArrayBuffer ที่ใหญ่กว่า ~2GB เสมอ ไม่ว่าเครื่องจะแรงหรือแรมเหลือแค่ไหนก็ตาม —
 * เกมที่เป็นแผ่นเดียวอย่าง PS1 ไม่เจอปัญหานี้ (ไม่เกิน ~700MB) แต่ไฟล์ ISO ของ PS2/DVD
 * มักใหญ่กว่า 2GB จึงต้องมีทางสำรองที่ไม่พึ่ง crypto.subtle เลยสำหรับไฟล์ขนาดนี้
 */

// เผื่อระยะห่างจากเพดานจริง (~2^31 ไบต์) ไว้พอสมควร กันกรณีขอบเขตชิดเกินไปในบางเบราว์เซอร์
const WEBCRYPTO_MAX_BYTES = 1_900_000_000;

export async function sha1Hex(bytes) {
  if (bytes.byteLength <= WEBCRYPTO_MAX_BYTES) {
    const digest = await crypto.subtle.digest('SHA-1', bytes);
    return bytesToHex(new Uint8Array(digest));
  }
  return sha1HexPureJs(bytes);
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── ทางสำรองสำหรับไฟล์เกิน ~2GB — เขียน SHA-1 เองตาม FIPS 180-4 ──────────
//
// ไม่มี API มาตรฐานไหนให้ป้อนข้อมูลทีละก้อน (streaming) กับ crypto.subtle.digest ได้
// จึงต้องเขียนเองเมื่อไฟล์ใหญ่เกินเพดานของมัน ประมวลผลทีละบล็อก 64 ไบต์จาก Uint8Array
// เดิม (ที่โหลดทั้งไฟล์ไว้ในหน่วยความจำอยู่แล้ว) ไม่คัดลอกข้อมูลซ้ำนอกจากบล็อกท้ายสุด
// และคั่นด้วย setTimeout เป็นระยะ กันแท็บค้างระหว่างคำนวณไฟล์หลาย GB

const YIELD_EVERY_BLOCKS = 1_000_000; // ~64MB ต่อรอบ

async function sha1HexPureJs(bytes) {
  const h = new Uint32Array([0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0]);
  const w = new Uint32Array(80);
  const len = bytes.length;
  const blockCount = Math.floor(len / 64);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  for (let i = 0; i < blockCount; i++) {
    processBlock(view, i * 64, w, h);
    if (i % YIELD_EVERY_BLOCKS === YIELD_EVERY_BLOCKS - 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  // บล็อกท้ายสุด: ไบต์ที่เหลือ + 0x80 + ศูนย์เติมเต็ม + ความยาวข้อความ (บิต) แบบ 64 บิต big-endian
  // ต้องใช้ 2 บล็อกถ้าที่เหลือไม่พอให้ใส่ทั้งตัวปิดท้ายและความยาวในบล็อกเดียว (ต้องการ 9 ไบต์)
  const remainder = len - blockCount * 64;
  const tailBlocks = remainder + 9 <= 64 ? 1 : 2;
  const tail = new Uint8Array(tailBlocks * 64);
  tail.set(bytes.subarray(blockCount * 64));
  tail[remainder] = 0x80;

  const bitLen = len * 8; // ปลอดภัยในช่วง integer ที่ float แทนได้พอดี (ไฟล์ต้องใหญ่เกิน 1,000TB ถึงจะพลาด)
  const tailView = new DataView(tail.buffer);
  tailView.setUint32(tail.length - 8, Math.floor(bitLen / 0x100000000) >>> 0);
  tailView.setUint32(tail.length - 4, bitLen >>> 0);

  for (let i = 0; i < tailBlocks; i++) {
    processBlock(tailView, i * 64, w, h);
  }

  return Array.from(h)
    .map((n) => n.toString(16).padStart(8, '0'))
    .join('');
}

function processBlock(view, offset, w, h) {
  for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
  for (let i = 16; i < 80; i++) {
    w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
  }

  let [a, b, c, d, e] = h;

  for (let i = 0; i < 80; i++) {
    let f;
    let k;
    if (i < 20) {
      f = (b & c) | (~b & d);
      k = 0x5a827999;
    } else if (i < 40) {
      f = b ^ c ^ d;
      k = 0x6ed9eba1;
    } else if (i < 60) {
      f = (b & c) | (b & d) | (c & d);
      k = 0x8f1bbcdc;
    } else {
      f = b ^ c ^ d;
      k = 0xca62c1d6;
    }

    const temp = (rotl(a, 5) + f + e + k + w[i]) >>> 0;
    e = d;
    d = c;
    c = rotl(b, 30);
    b = a;
    a = temp;
  }

  h[0] = (h[0] + a) >>> 0;
  h[1] = (h[1] + b) >>> 0;
  h[2] = (h[2] + c) >>> 0;
  h[3] = (h[3] + d) >>> 0;
  h[4] = (h[4] + e) >>> 0;
}

function rotl(x, n) {
  return ((x << n) | (x >>> (32 - n))) >>> 0;
}

// เปิดให้เทสเรียกทางสำรองตรงๆ ได้ โดยไม่ต้องสร้างไฟล์ทดสอบขนาด 2GB จริง
export const _internal = { sha1HexPureJs, WEBCRYPTO_MAX_BYTES };
