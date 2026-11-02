/**
 * แปะไฟล์ใหญ่มากบนคอมพิวเตอร์: ให้ผู้ใช้เลือกโฟลเดอร์ที่จะเก็บไฟล์ก่อน แล้วเขียนผลลัพธ์ลงไฟล์ใน
 * โฟลเดอร์นั้นตรงๆ ระหว่างแปะ (ดู ADR-020)
 *
 * Chrome เขียนข้อมูลลงไฟล์ชั่วคราว "<ชื่อ>.crswap" ก่อน แล้วค่อยตรวจไฟล์และเปลี่ยนชื่อเป็นไฟล์จริง
 * ตอน close() — ทดสอบแล้วว่าไฟล์ใหญ่กว่า 4GB ที่ชื่อลงท้าย .iso ขั้นนี้พังเกือบทุกครั้ง แต่ชื่อลงท้าย
 * .bin ผ่าน จึงเขียนเป็น .bin ก่อน แล้วค่อยเปลี่ยนชื่อเป็นชื่อที่ต้องการ (.iso) ทีหลัง — เปลี่ยนชื่อ
 * ไม่ผ่านก็ยังได้ไฟล์ .bin ที่ครบและเปิดในอีมูเลเตอร์ได้เหมือนกัน
 *
 * ต้องถือ handle ของโฟลเดอร์ (ไม่ใช่ไฟล์เดียวจากกล่อง Save As) ถึงจะเปลี่ยนชื่อไฟล์เองได้
 * รองรับเฉพาะ Chrome/Edge บนคอมพิวเตอร์ — เช็ค supportsFolderSave() ก่อนเรียกใช้เสมอ
 */

const WRITE_EXT = '.bin';
const SWAP_RENAME_ATTEMPTS = 6;
const FINAL_RENAME_ATTEMPTS = 1;
const RENAME_RETRY_MS = 5000;

export function supportsFolderSave() {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

/** เปิดกล่องเลือกโฟลเดอร์ — โยน AbortError ถ้าผู้ใช้กดยกเลิก (ผู้เรียกต้องดักไว้เอง) */
export function pickSaveFolder() {
  return window.showDirectoryPicker({ id: 'maepaew-save', mode: 'readwrite', startIn: 'downloads' });
}

/**
 * จองชื่อไฟล์ในโฟลเดอร์ (ชื่อซ้ำไฟล์เดิมก็เติม " (2)", " (3)"... ไม่เขียนทับของเก่า) แล้วเปิด writable
 * ของไฟล์ "<ชื่อ>.bin" ไว้เขียน — finalName คือชื่อที่จะเปลี่ยนให้หลังเขียนเสร็จ
 */
export async function createFolderSaveStream(dir, wantedName) {
  const { base, ext } = splitName(wantedName);
  for (let n = 1; ; n++) {
    const stem = n === 1 ? base : `${base} (${n})`;
    const finalName = stem + ext;
    const writeName = stem + WRITE_EXT;
    if ((await exists(dir, finalName)) || (await exists(dir, writeName))) continue;
    const handle = await dir.getFileHandle(writeName, { create: true });
    const writable = await handle.createWritable();
    return { dir, writeName, finalName, writable };
  }
}

/**
 * ปิดไฟล์ให้เสร็จแล้วเปลี่ยนชื่อเป็น finalName — คืนชื่อไฟล์ที่ได้จริง (finalName หรือ writeName
 * ถ้าเปลี่ยนชื่อไม่ผ่าน) หลังเช็คแล้วว่าขนาดเท่า expectedSize
 * onStatus(kind, attempt) แจ้งความคืบหน้าไว้อัปเดตข้อความบนหน้าจอ: 'swap-retry' | 'rename'
 */
export async function finishFolderSave(stream, expectedSize, onStatus, wait = sleep) {
  const { dir, writeName, finalName, writable } = stream;
  try {
    await writable.close();
  } catch (closeError) {
    await renameSwapWithRetry(dir, writeName, expectedSize, closeError, onStatus, wait);
  }
  await expectSize(dir, writeName, expectedSize);

  if (finalName === writeName) return writeName;
  for (let attempt = 1; attempt <= FINAL_RENAME_ATTEMPTS; attempt++) {
    onStatus?.('rename', attempt);
    try {
      await (await dir.getFileHandle(writeName)).move(finalName);
      await expectSize(dir, finalName, expectedSize);
      return finalName;
    } catch {
      if (attempt < FINAL_RENAME_ATTEMPTS) await wait(RENAME_RETRY_MS);
    }
  }
  // เปลี่ยนชื่อไม่ผ่าน แต่ไฟล์ .bin ครบแล้ว — ถ้า Chrome ทิ้ง .crswap ไว้ระหว่างลองก็ย้ายกลับมาเป็น .bin
  if (!(await exists(dir, writeName))) {
    const swap = await findSwapFile(dir, finalName, expectedSize);
    if (swap) await swap.move(writeName);
  }
  await expectSize(dir, writeName, expectedSize);
  return writeName;
}

async function renameSwapWithRetry(dir, name, expectedSize, closeError, onStatus, wait) {
  let lastError = closeError;
  for (let attempt = 1; attempt <= SWAP_RENAME_ATTEMPTS; attempt++) {
    await wait(RENAME_RETRY_MS);
    const swap = await findSwapFile(dir, name, expectedSize);
    // ไม่มี .crswap ขนาดครบ = ข้อมูลไม่ได้ถูกเขียนครบตั้งแต่แรก ลองต่อก็ไม่มีประโยชน์
    if (!swap) throw closeError;
    onStatus?.('swap-retry', attempt);
    try {
      // ไฟล์ชื่อจริงที่ Chrome สร้างไว้ตั้งแต่ต้น (ขนาด 0) ต้องลบก่อน ไม่งั้นเปลี่ยนชื่อทับไม่ได้
      await dir.removeEntry(name).catch(() => {});
      await swap.move(name);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/** หาไฟล์ "<name>.crswap" / "<name>.1.crswap" ... ที่ขนาดครบ เอาอันใหม่สุด (รอบก่อนอาจค้างอยู่) */
async function findSwapFile(dir, name, expectedSize) {
  let best = null;
  let bestTime = -1;
  for await (const [entryName, entry] of dir.entries()) {
    if (entry.kind !== 'file' || !entryName.startsWith(`${name}.`) || !entryName.endsWith('.crswap')) continue;
    const file = await entry.getFile();
    if (file.size === expectedSize && file.lastModified > bestTime) {
      best = entry;
      bestTime = file.lastModified;
    }
  }
  return best;
}

async function expectSize(dir, name, expectedSize) {
  const file = await (await dir.getFileHandle(name)).getFile();
  if (file.size !== expectedSize) {
    throw new Error(`ไฟล์ที่บันทึกได้ขนาดไม่ครบ (${file.size} จาก ${expectedSize} ไบต์)`);
  }
}

async function exists(dir, name) {
  try {
    await dir.getFileHandle(name);
    return true;
  } catch (error) {
    if (error?.name === 'NotFoundError') return false;
    throw error;
  }
}

function splitName(name) {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? { base: name.slice(0, dot), ext: name.slice(dot) } : { base: name, ext: '' };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
