/**
 * แปะไฟล์ใหญ่มากบนคอมพิวเตอร์: แปะลงไฟล์ใน OPFS (พื้นที่เก็บไฟล์ส่วนตัวของเว็บ) ให้เสร็จทั้งไฟล์
 * ก่อน แล้วค่อยให้ผู้ใช้กดดาวน์โหลดไฟล์ที่เสร็จแล้วนั้นแบบดาวน์โหลดปกติ (ดู ADR-019)
 *
 * ไฟล์ใน OPFS อยู่บนดิสก์ ไม่ได้อยู่ในแรม Blob URL ของมันจึงดาวน์โหลดได้แม้ไฟล์ใหญ่หลาย GB
 * และเป็นการดาวน์โหลดปกติที่เบราว์เซอร์อ่านซ้ำได้ — Chrome ที่ตั้ง "ถามที่บันทึกไฟล์ทุกครั้ง"
 * จึงเลือกที่เก็บได้ตามปกติ
 */

const OUTPUT_NAME = 'patched-output.bin';
// ไฟล์ผลลัพธ์รอบก่อนที่เก่ากว่านี้ ถือว่าดาวน์โหลดไปเสร็จนานแล้ว ลบทิ้งได้
const STALE_MS = 30 * 60 * 1000;

// createSyncAccessHandle() มีให้เห็นเฉพาะใน worker เช็คจากหน้าเว็บไม่ได้ — เบราว์เซอร์ที่มี
// navigator.storage.getDirectory() มีมันใน worker ด้วยแทบทั้งหมด ถ้าไม่มีจริง worker จะโยน
// error กลับมาตอนแปะ
export function supportsOpfsPatch() {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.storage?.getDirectory === 'function' &&
    typeof Worker === 'function'
  );
}

/** มีที่ว่างใน OPFS พอใส่ไฟล์ขนาดนี้ไหม (ไม่รู้ก็ถือว่าพอ แล้วไปเจอ error ตอนเขียนแทน) */
export async function opfsHasRoomFor(bytes) {
  try {
    const { quota, usage } = await navigator.storage.estimate();
    if (!quota) return true;
    return quota - (usage ?? 0) > bytes * 1.02;
  } catch {
    return true;
  }
}

/** ลบไฟล์ผลลัพธ์รอบก่อนทิ้ง — ไฟล์ละหลาย GB ไม่ควรค้างอยู่ในเครื่องผู้ใช้
   onlyIfStale: ลบเฉพาะไฟล์ที่เก่าเกิน STALE_MS (ตอนเปิดหน้า เผื่อยังดาวน์โหลดรอบก่อนอยู่) */
export async function clearOpfsOutput({ onlyIfStale = false } = {}) {
  try {
    const root = await navigator.storage.getDirectory();
    if (onlyIfStale) {
      const file = await (await root.getFileHandle(OUTPUT_NAME)).getFile();
      if (Date.now() - file.lastModified < STALE_MS) return;
    }
    await root.removeEntry(OUTPUT_NAME);
  } catch {
    // ไม่มีไฟล์ หรือเบราว์เซอร์ไม่รองรับ — ไม่เป็นไร
  }
}

/** แปะแพตช์ PPF ลงไฟล์ใน OPFS แล้วคืน File ของผลลัพธ์ (อยู่บนดิสก์ ใช้ทำ Blob URL ดาวน์โหลดได้) */
export function patchIntoOpfs(sourceFile, patchBytes, onProgress) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./opfs-patch-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = async ({ data }) => {
      if (data.type === 'progress') {
        onProgress?.(data.written, data.total);
        return;
      }
      worker.terminate();
      if (data.type === 'error') {
        const error = new Error(data.message);
        error.name = data.name ?? 'Error';
        reject(error);
        return;
      }
      try {
        const root = await navigator.storage.getDirectory();
        resolve(await (await root.getFileHandle(OUTPUT_NAME)).getFile());
      } catch (error) {
        reject(error);
      }
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || 'ตัวแปะแพตช์ทำงานผิดพลาด'));
    };
    worker.postMessage({ sourceFile, patchBytes, fileName: OUTPUT_NAME });
  });
}
