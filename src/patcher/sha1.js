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
 * แต่มีสองเพดานที่ไม่มีเอกสารเตือนชัดๆ ซ้อนกันอยู่ (ดู ADR-014/ADR-015):
 *
 *   1. `crypto.subtle.digest` เองปฏิเสธ ArrayBuffer ที่ใหญ่กว่า ~2GB
 *   2. ก่อนจะถึงขั้นนั้นด้วยซ้ำ — เบราว์เซอร์ (อย่างน้อย Chrome) จำกัด ArrayBuffer ทั่วไป
 *      (รวมถึงที่ได้จาก `Blob.arrayBuffer()`) ไว้ที่ ~2GB เท่ากันโดยประมาณ ไม่ว่าจะมีแรมเหลือ
 *      แค่ไหนก็ตาม — เรียก `file.arrayBuffer()` กับไฟล์ทั้งไฟล์ตรงๆ จึงพังตั้งแต่ก้าวแรก
 *      สำหรับไฟล์ใหญ่กว่านี้ ไม่ทันได้ไปถึง crypto.subtle เลยด้วยซ้ำ
 *
 * เกมที่เป็นแผ่นเดียวอย่าง PS1 ไม่เจอปัญหานี้ (ไม่เกิน ~700MB) แต่ไฟล์ ISO ของ PS2/DVD
 * มักใหญ่กว่า 2GB จึงต้องมีทางอ่านไฟล์ทีละก้อนเล็กๆ (`Blob.slice()`) แล้วป้อนเข้า SHA-1
 * แบบสะสมทีละก้อน (ไม่ใช่อ่านทั้งไฟล์เป็นก้อนเดียว) สำหรับไฟล์ขนาดนี้
 */

// เผื่อระยะห่างจากเพดานจริง (~2GB) ไว้พอสมควร กันกรณีขอบเขตชิดเกินไปในบางเบราว์เซอร์
const WEBCRYPTO_MAX_BYTES = 1_900_000_000;

// ขนาดที่อ่านทีละก้อนตอนไฟล์ใหญ่เกินเพดาน — เล็กพอที่จะไม่ชนเพดาน ArrayBuffer ของข้อ 2 ข้างบน
// แม้แต่ในเบราว์เซอร์ที่จำกัดไว้ต่ำกว่า 2GB เล็กน้อย
const BLOB_CHUNK_BYTES = 64 * 1024 * 1024; // 64MB ต่อก้อน

/** แฮช Uint8Array ที่โหลดอยู่ในหน่วยความจำทั้งก้อนแล้ว (ไฟล์เล็กที่โหลดสำเร็จมาแล้วที่อื่น) */
export async function sha1Hex(bytes) {
  if (bytes.byteLength <= WEBCRYPTO_MAX_BYTES) {
    const digest = await crypto.subtle.digest('SHA-1', bytes);
    return bytesToHex(new Uint8Array(digest));
  }
  const hasher = createSha1();
  hasher.update(bytes);
  return hasher.digestHex();
}

/**
 * แฮชไฟล์/Blob โดยอ่านทีละก้อนเล็กๆ ("BLOB_CHUNK_BYTES" ต่อครั้ง) แทนที่จะอ่านทั้งไฟล์
 * เป็น ArrayBuffer เดียว — ใช้ทางนี้แทน `sha1Hex(new Uint8Array(await file.arrayBuffer()))`
 * เสมอเมื่อยังไม่รู้ขนาดไฟล์ล่วงหน้า เพราะไฟล์ใหญ่กว่า ~2GB จะพังตั้งแต่ก้าว `arrayBuffer()`
 * ทั้งไฟล์ ก่อนจะรู้ด้วยซ้ำว่าต้องใช้ทางสำรองของ `sha1Hex`
 *
 * `onProgress(loaded, total)` เรียกหลังอ่านแต่ละก้อนเสร็จ ไว้โชว์เปอร์เซ็นต์ให้ผู้ใช้เห็น
 * ระหว่างรอไฟล์ใหญ่มากๆ
 */
export async function sha1HexOfBlob(blob, onProgress) {
  if (blob.size <= WEBCRYPTO_MAX_BYTES) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    onProgress?.(blob.size, blob.size);
    return sha1Hex(bytes);
  }

  const hasher = createSha1();
  for (let offset = 0; offset < blob.size; offset += BLOB_CHUNK_BYTES) {
    const chunk = blob.slice(offset, offset + BLOB_CHUNK_BYTES);
    hasher.update(new Uint8Array(await chunk.arrayBuffer()));
    const loaded = Math.min(offset + BLOB_CHUNK_BYTES, blob.size);
    onProgress?.(loaded, blob.size);
    await yieldToBrowser();
  }
  return hasher.digestHex();
}

function yieldToBrowser() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── ตัวแฮช SHA-1 แบบป้อนข้อมูลทีละก้อนได้ — เขียนเองตาม FIPS 180-4 ────────
//
// ไม่มี API มาตรฐานไหนให้ป้อนข้อมูลทีละก้อน (streaming) กับ crypto.subtle.digest ได้เลย
// จึงต้องเขียนเองสำหรับกรณีนี้ เก็บ state (h, ไบต์ที่เหลือไม่ครบ 64 ไบต์) ไว้ข้ามการเรียก
// update() แต่ละครั้ง ให้เรียกกี่ครั้งก็ได้ด้วยก้อนขนาดเท่าไหร่ก็ได้ก่อนปิดท้ายด้วย digestHex()

export function createSha1() {
  const h = new Uint32Array([0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0]);
  const w = new Uint32Array(80);
  let totalLength = 0;
  let pending = new Uint8Array(0);

  function update(bytes) {
    totalLength += bytes.length;

    let data = bytes;
    if (pending.length > 0) {
      data = new Uint8Array(pending.length + bytes.length);
      data.set(pending);
      data.set(bytes, pending.length);
    }

    const blockCount = Math.floor(data.length / 64);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    for (let i = 0; i < blockCount; i++) processBlock(view, i * 64, w, h);

    pending = data.slice(blockCount * 64);
  }

  function digestHex() {
    const remainder = pending.length;
    const tailBlocks = remainder + 9 <= 64 ? 1 : 2;
    const tail = new Uint8Array(tailBlocks * 64);
    tail.set(pending);
    tail[remainder] = 0x80;

    const bitLen = totalLength * 8; // ปลอดภัยในช่วง integer ที่ float แทนได้พอดี (ไฟล์ต้องใหญ่เกิน 1,000TB ถึงจะพลาด)
    const tailView = new DataView(tail.buffer);
    tailView.setUint32(tail.length - 8, Math.floor(bitLen / 0x100000000) >>> 0);
    tailView.setUint32(tail.length - 4, bitLen >>> 0);

    for (let i = 0; i < tailBlocks; i++) processBlock(tailView, i * 64, w, h);

    return Array.from(h)
      .map((n) => n.toString(16).padStart(8, '0'))
      .join('');
  }

  return { update, digestHex };
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

// เปิดให้เทสเรียกทางสำรองตรงๆ ได้ โดยไม่ต้องสร้างไฟล์ทดสอบขนาดหลาย GB จริง
export const _internal = { createSha1, WEBCRYPTO_MAX_BYTES, BLOB_CHUNK_BYTES };
