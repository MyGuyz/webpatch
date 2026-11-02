// Service worker — ไม่แคชอะไรเลย เพราะเว็บนี้ต้องได้ข้อมูลเกม/ประกาศสดจาก Supabase ทุกครั้ง
// แคชไว้แล้วจะเห็นข้อมูลเก่าค้าง ซึ่งแย่กว่าไม่มี service worker เลย
// มีไว้ 2 อย่าง: ให้เบราว์เซอร์อนุญาตให้ "ติดตั้งเป็นแอป" ได้ และดาวน์โหลดไฟล์เกมที่แปะแล้วแบบ
// สตรีม (ไฟล์ใหญ่หลาย GB — ฝั่งหน้าเว็บอยู่ที่ src/lib/download-stream.js, ดู ADR-019)

const DOWNLOAD_PREFIX = '/__download/';
const pendingDownloads = new Map();

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  const data = event.data;
  // 'webpatch-ping' ไม่ต้องทำอะไร แค่ได้รับข้อความก็พอให้เบราว์เซอร์ไม่ปิด service worker ทิ้ง
  if (data?.type !== 'webpatch-download') return;
  pendingDownloads.set(data.id, data);
  event.ports[0]?.postMessage('ready');
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(DOWNLOAD_PREFIX)) {
    return; // ไม่เรียก event.respondWith — ปล่อยให้เบราว์เซอร์ดึงจากเน็ตตามปกติ
  }

  const id = url.pathname.slice(DOWNLOAD_PREFIX.length);
  const download = pendingDownloads.get(id);
  if (!download) return;
  pendingDownloads.delete(id);

  event.respondWith(
    new Response(download.readable, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(download.filename)}`,
        'Content-Length': String(download.size),
        'X-Content-Type-Options': 'nosniff',
      },
    })
  );
});
