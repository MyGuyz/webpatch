/**
 * ดาวน์โหลดไฟล์ผลลัพธ์แบบสตรีมผ่าน service worker (public/sw.js) — ส่งเนื้อไฟล์ทีละก้อนเข้าตัว
 * จัดการดาวน์โหลดของเบราว์เซอร์โดยตรง ไม่ต้องรวมเป็น Blob เดียวในแรม และไม่ต้องผ่าน
 * showSaveFilePicker() (ดู ADR-019)
 *
 * มีไว้เพราะทาง showSaveFilePicker() พังจริงกับไฟล์ 8GB บน Chrome Windows: เขียนครบทุกไบต์แล้ว
 * แต่ close() ย้ายไฟล์ชั่วคราว .crswap ไปเป็นไฟล์จริงไม่สำเร็จ (InvalidStateError) — ตัวจัดการ
 * ดาวน์โหลดของเบราว์เซอร์ถูกออกแบบมาสำหรับไฟล์หลาย GB อยู่แล้ว
 *
 * ทำงานแบบนี้: หน้าเว็บสร้าง TransformStream ส่งฝั่งอ่านให้ service worker → เปิด iframe ซ่อน
 * ไปที่ /__download/<id> → service worker ตอบคำขอนั้นด้วยฝั่งอ่านเป็นไฟล์แนบ → เบราว์เซอร์เริ่ม
 * ดาวน์โหลด แล้วหน้าเว็บเขียนผลลัพธ์ลงฝั่งเขียนทีละก้อน (มี backpressure — เขียนเร็วไม่เกินที่
 * ดาวน์โหลดรับไหว แรมจึงใช้แค่ไม่กี่ก้อน)
 */

const HANDSHAKE_TIMEOUT_MS = 1500;
// service worker ถูกเบราว์เซอร์ปิดทิ้งได้ถ้าไม่มี event เข้าไปสัก 30 วินาที — ระหว่างแปะไฟล์ใหญ่
// (หลายนาที) ส่งข้อความไปเรื่อยๆ ให้มันตื่นอยู่ ไม่งั้นสตรีมที่วิ่งผ่านมันจะขาดกลางทาง
const KEEPALIVE_MS = 10_000;

/** เบราว์เซอร์นี้ส่ง ReadableStream ข้าม postMessage ได้ไหม (Chrome/Edge 87+, Firefox 103+) */
function supportsTransferableStreams() {
  try {
    const { readable } = new TransformStream();
    const channel = new MessageChannel();
    channel.port1.postMessage(readable, [readable]);
    channel.port1.close();
    return true;
  } catch {
    return false;
  }
}

export function supportsDownloadStream() {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    navigator.serviceWorker.controller != null &&
    typeof TransformStream === 'function' &&
    supportsTransferableStreams()
  );
}

/**
 * เริ่มดาวน์โหลดไฟล์ชื่อ filename ขนาด size ไบต์ (ต้องรู้ขนาดล่วงหน้า — เบราว์เซอร์จะได้โชว์
 * ความคืบหน้าและรู้ว่าไฟล์ครบหรือไม่) แล้วคืน { name, writable } ที่ใช้กับ streamApplyPPF ได้ตรงๆ
 *
 * โยน error ถ้า service worker ไม่ตอบ (เช่นยังเป็นตัวเก่าที่ไม่รู้จักข้อความนี้) — ผู้เรียกควรถอย
 * ไปใช้ทางอื่นแทน
 */
export async function createDownloadStream(filename, size) {
  const controller = navigator.serviceWorker.controller;
  if (!controller) throw new Error('service worker ยังไม่พร้อม');

  const id = crypto.randomUUID();
  const { readable, writable } = new TransformStream();
  const channel = new MessageChannel();

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('service worker ไม่ตอบ')), HANDSHAKE_TIMEOUT_MS);
    channel.port1.onmessage = () => {
      clearTimeout(timer);
      resolve();
    };
    controller.postMessage({ type: 'webpatch-download', id, filename, size, readable }, [
      channel.port2,
      readable,
    ]);
  });

  const iframe = document.createElement('iframe');
  iframe.hidden = true;
  iframe.src = `/__download/${id}`;
  document.body.append(iframe);

  const keepAlive = setInterval(() => controller.postMessage({ type: 'webpatch-ping' }), KEEPALIVE_MS);
  const writer = writable.getWriter();

  return {
    name: filename,
    writable: {
      async write(chunk) {
        // ผู้ใช้กดยกเลิกในแถบดาวน์โหลด (หรือเบราว์เซอร์ยกเลิกเอง) → สตรีมถูก cancel แล้ว
        // writer จะ reject ด้วยค่า undefined เปล่าๆ — แปลงเป็นข้อความที่ผู้ใช้อ่านรู้เรื่อง
        try {
          await writer.ready;
          await writer.write(chunk);
        } catch {
          clearInterval(keepAlive);
          throw new Error('การดาวน์โหลดไฟล์ถูกยกเลิกกลางทาง ลองกดแปะใหม่อีกครั้ง');
        }
      },
      async close() {
        clearInterval(keepAlive);
        await writer.close();
      },
      async abort(reason) {
        clearInterval(keepAlive);
        await writer.abort(reason);
      },
    },
  };
}
