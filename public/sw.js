// Service worker ขั้นต่ำสุด — มีไว้แค่ให้เบราว์เซอร์อนุญาตให้ "ติดตั้งเป็นแอป" ได้เท่านั้น
// ไม่แคชอะไรเลย เพราะเว็บนี้ต้องได้ข้อมูลเกม/ประกาศสดจาก Supabase ทุกครั้ง
// แคชไว้แล้วจะเห็นข้อมูลเก่าค้าง ซึ่งแย่กว่าไม่มี service worker เลย

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // ไม่เรียก event.respondWith — ปล่อยให้เบราว์เซอร์ดึงจากเน็ตตามปกติ
});
