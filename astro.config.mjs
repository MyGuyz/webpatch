import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'server',

  // ค่าเริ่มต้นของ adapter จะผูก Cloudflare Images ให้ ซึ่งบังคับให้ต้องมี IMAGES binding
  // เว็บนี้ไม่ได้ใช้ระบบ optimize รูปของ Astro เลย จึงปิดไปเพื่อให้ deploy ได้โดยไม่ต้องตั้งค่าอะไรเพิ่ม
  adapter: cloudflare({ imageService: 'compile' }),

  // เช่นเดียวกัน ค่าเริ่มต้นจะเปิด session ซึ่งบังคับให้ต้องสร้าง KV namespace
  // เว็บนี้ไม่มี session (ยังไม่มีระบบ login) จึงปิดไป
  session: false,
});
