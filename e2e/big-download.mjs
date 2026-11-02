/**
 * ทดสอบทางแปะลง OPFS แล้วดาวน์โหลด (ADR-019) กับไฟล์เกมจริงขนาดหลาย GB ใน Chrome จริง
 * ไม่ได้อยู่ใน npm run test:e2e เพราะต้องมีไฟล์ ISO จริงในเครื่องและใช้เวลาหลายนาที
 *
 * วิธีรัน (เปิด dev server ที่มี .env.local ชี้ Supabase จริงไว้ก่อน — ต้องมีเกม gameId ในฐานข้อมูล):
 *   node e2e/big-download.mjs "<ISO ต้นฉบับ>" "<ไฟล์ .ppf>" <gameId>
 *   (ทดสอบกับเว็บจริง: ตั้ง BASE_URL=https://maepaew.com ไม่ต้องเปิด dev server)
 * ผ่านเมื่อบรรทัดสุดท้ายพิมพ์ SHA-1 ของไฟล์ที่ดาวน์โหลดได้ ตรงกับผลลัพธ์ที่ถูกต้องของแพตช์นั้น
 */
import { chromium } from 'playwright';
import { readFileSync, createReadStream, statSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const [, , iso, ppf, gameId] = process.argv;
const t0 = Date.now();
const log = (...a) => console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s`, ...a);

// โปรไฟล์ปกติ (ไม่ใช่โหมดไม่ระบุตัวตน) — OPFS ของโหมดไม่ระบุตัวตนเก็บในแรมและเล็กเกินไฟล์ระดับ GB
const profileDir = mkdtempSync(join(tmpdir(), 'webpatch-e2e-'));
const context = await chromium.launchPersistentContext(profileDir, {
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  viewport: { width: 1280, height: 900 },
  acceptDownloads: true,
});
await context.addInitScript(() => localStorage.setItem('webpatchGuideSeen', '1'));
await context.route('https://fonts.googleapis.com/**', (r) => r.abort());
await context.route('https://fonts.gstatic.com/**', (r) => r.abort());
await context.route('**/api/cover/**', (r) => r.abort());
const patch = readFileSync(ppf);
await context.route('**/api/patch-file/**', (r) =>
  r.fulfill({ status: 200, contentType: 'application/octet-stream', body: patch })
);

const page = context.pages()[0] ?? (await context.newPage());
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

await page.click('#apply-btn');
log('clicked patch');
// แปะลง OPFS จนเสร็จ ปุ่มจะเปลี่ยนเป็นปุ่มดาวน์โหลด (ADR-019)
const ready = page.locator('#apply-btn[data-phase="download"]').waitFor({ timeout: 3600000 }).then(() => 'ready');
const failed = page
  .locator('#patch-run-error:not([hidden])')
  .waitFor({ state: 'attached', timeout: 3600000 })
  .then(async () => `ERROR: ${await page.locator('#patch-run-error').textContent()}`);
const result = await Promise.race([ready, failed]);
log('patch result:', result);
if (result !== 'ready') process.exit(1);

const opfsInfo = () => page.evaluate(async () => { const f = await (await (await navigator.storage.getDirectory()).getFileHandle('patched-output.bin')).getFile(); return `${f.size} @ ${f.lastModified}`; }).catch((e) => e.message);
log('opfs file before download:', await opfsInfo());
const downloadEvent = page.waitForEvent('download', { timeout: 120000 });
await page.click('#apply-btn');
const download = await downloadEvent;
log('download started:', download.suggestedFilename());
await page.locator('#patch-done-modal.open').waitFor({ state: 'attached', timeout: 60000 });
log('done modal shown');

const path = await download.path();
log('download finished:', path, 'size:', statSync(path).size, 'failure:', await download.failure());
log('opfs file after download:', await opfsInfo());
const hash = createHash('sha1');
for await (const chunk of createReadStream(path)) hash.update(chunk);
log('sha1', hash.digest('hex'));

clearInterval(status);
await context.close();
// โปรไฟล์ทดสอบมีไฟล์ผลลัพธ์หลาย GB อยู่ใน OPFS — ลบทิ้งทุกครั้ง
rmSync(profileDir, { recursive: true, force: true });
