/**
 * ทดสอบทางดาวน์โหลดสตรีมผ่าน service worker (ADR-019) กับไฟล์เกมจริงขนาดหลาย GB ใน Chrome จริง
 * ไม่ได้อยู่ใน npm run test:e2e เพราะต้องมีไฟล์ ISO จริงในเครื่องและใช้เวลาหลายนาที
 *
 * วิธีรัน (เปิด dev server ที่มี .env.local ชี้ Supabase จริงไว้ก่อน — ต้องมีเกม gameId ในฐานข้อมูล):
 *   node e2e/big-download.mjs "<ISO ต้นฉบับ>" "<ไฟล์ .ppf>" <gameId>
 *   (ทดสอบกับเว็บจริง: ตั้ง BASE_URL=https://maepaew.com ไม่ต้องเปิด dev server)
 * ผ่านเมื่อบรรทัดสุดท้ายพิมพ์ SHA-1 ของไฟล์ที่ดาวน์โหลดได้ ตรงกับผลลัพธ์ที่ถูกต้องของแพตช์นั้น
 */
import { chromium } from 'playwright';
import { readFileSync, createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';

const [, , iso, ppf, gameId] = process.argv;
const t0 = Date.now();
const log = (...a) => console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s`, ...a);

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
await context.addInitScript(() => localStorage.setItem('webpatchGuideSeen', '1'));
await context.route('https://fonts.googleapis.com/**', (r) => r.abort());
await context.route('https://fonts.gstatic.com/**', (r) => r.abort());
await context.route('**/api/cover/**', (r) => r.abort());
const patch = readFileSync(ppf);
await context.route('**/api/patch-file/**', (r) =>
  r.fulfill({ status: 200, contentType: 'application/octet-stream', body: patch })
);

const page = await context.newPage();
page.on('pageerror', (e) => log('PAGE ERROR', e.message));
page.on('response', (r) => r.status() >= 500 && log('HTTP', r.status(), r.url()));

const status = setInterval(async () => {
  const s = await page
    .evaluate(() =>
      [
        document.getElementById('file-summary')?.textContent,
        ['file-msgbox', 'file-msgbox-mobile', 'file-msgbox-ok']
          .filter((i) => document.getElementById(i)?.classList.contains('open'))
          .join(','),
        document.getElementById('patch-progress-label')?.textContent,
      ].join(' | ')
    )
    .catch((e) => e.message);
  log('status', s);
}, 30000);

await page.goto(`${process.env.BASE_URL ?? 'http://localhost:4321'}/patch?game=${gameId}`);
await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 30000 });
log('sw controlled');

await page.setInputFiles('#source-file', iso);
log('file set');
await page
  .locator('#file-msgbox-ok.open, #file-msgbox.open, #file-msgbox-mobile.open')
  .first()
  .waitFor({ state: 'attached', timeout: 1800000 });
if (!(await page.locator('#file-msgbox-ok.open').count())) {
  log('FILE NOT OK');
  process.exit(1);
}
log('file ok, note:', await page.locator('#patch-big-file-note').textContent());

const downloadEvent = page.waitForEvent('download', { timeout: 120000 });
await page.click('#apply-btn');
const download = await downloadEvent;
log('download started:', download.suggestedFilename());

// ปุ่มเปลี่ยนเป็น "เลือกที่เก็บไฟล์แล้ว เริ่มแปะ" — ข้อมูลยังไม่ไหลจนกว่าจะกดยืนยัน
await page.locator('#apply-btn[data-phase="confirm-save"]').waitFor();
await page.click('#apply-btn');

const done = page.locator('#patch-done-modal.open').waitFor({ state: 'attached', timeout: 1800000 }).then(() => 'done modal');
const failed = page
  .locator('#patch-run-error:not([hidden])')
  .waitFor({ state: 'attached', timeout: 1800000 })
  .then(async () => `ERROR: ${await page.locator('#patch-run-error').textContent()}`);
log('page result:', await Promise.race([done, failed]));
log('stage1 text:', await page.locator('#patch-done-stage1-text').textContent());

const path = await download.path();
log('download finished:', path, 'failure:', await download.failure());
const hash = createHash('sha1');
for await (const chunk of createReadStream(path)) hash.update(chunk);
log('sha1', hash.digest('hex'));

clearInterval(status);
await browser.close();
