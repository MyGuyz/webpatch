/**
 * Worker ที่แปะแพตช์ PPF แบบสตรีมลงไฟล์ใน OPFS (พื้นที่เก็บไฟล์ส่วนตัวของเว็บในเครื่องผู้ใช้)
 * ผ่าน createSyncAccessHandle() — เขียนลงไฟล์ตรงตำแหน่งเลย ไม่มีไฟล์ชั่วคราว .crswap และไม่มี
 * ขั้น "ย้ายไฟล์ตอนปิด" แบบ showSaveFilePicker() ที่พังกับไฟล์ 8GB (ดู ADR-019)
 *
 * createSyncAccessHandle() ใช้ได้เฉพาะใน dedicated worker เท่านั้น ถึงต้องแยกไฟล์นี้ออกมา
 */

import { streamApplyPPF } from './stream-ppf.js';

self.onmessage = async ({ data: { sourceFile, patchBytes, fileName } }) => {
  let access = null;
  try {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle(fileName, { create: true });
    access = await handle.createSyncAccessHandle();
    access.truncate(0);

    let offset = 0;
    const writable = {
      async write(chunk) {
        let done = 0;
        while (done < chunk.length) {
          done += access.write(chunk.subarray(done), { at: offset + done });
        }
        offset += chunk.length;
      },
    };

    await streamApplyPPF(sourceFile, patchBytes, writable, (written, total) => {
      self.postMessage({ type: 'progress', written, total });
    });
    access.flush();
    access.close();
    access = null;
    self.postMessage({ type: 'done' });
  } catch (error) {
    access?.close();
    self.postMessage({ type: 'error', name: error?.name, message: error?.message ?? String(error) });
  }
};
