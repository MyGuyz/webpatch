import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'server',

  // ฝังเวลา build ไว้ในหน้าเว็บ เพื่อให้ดูออกว่าเว็บที่เปิดอยู่มาจากโค้ดชุดไหน
  // เวลาแก้อะไรแล้วสงสัยว่า deploy ขึ้นไปหรือยัง จะได้ไม่ต้องเดา
  vite: {
    define: {
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },
  },

  // ค่าเริ่มต้นของ adapter จะผูก Cloudflare Images ให้ ซึ่งบังคับให้ต้องมี IMAGES binding
  // เว็บนี้ไม่ได้ใช้ระบบ optimize รูปของ Astro เลย จึงปิดไปเพื่อให้ deploy ได้โดยไม่ต้องตั้งค่าอะไรเพิ่ม
  adapter: cloudflare({ imageService: 'compile' }),

  // เช่นเดียวกัน ค่าเริ่มต้นจะเปิด session ซึ่งบังคับให้ต้องสร้าง KV namespace
  // เว็บนี้ไม่มี session (ยังไม่มีระบบ login) จึงปิดไป
  session: false,
});
