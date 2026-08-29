/**
 * ทดสอบหน้าเว็บจริงในเบราว์เซอร์
 *
 * ครอบคลุมสิ่งที่ unit test พิสูจน์ไม่ได้: หน้าเว็บ render ถูกไหม
 * ผู้ใช้กดตามลำดับแล้วไปต่อได้ไหม การอ่านไฟล์/คำนวณ SHA1/แปะแพตช์
 * ในเบราว์เซอร์จริงทำงานไหม และไฟล์ผลลัพธ์ออกมาถูกต้องหรือเปล่า
 *
 * ตัวกลางที่ดึงแพตช์จาก GitHub ถูกดักไว้ตรงนี้ เพื่อให้ทดสอบได้โดยไม่ต้องพึ่งเน็ต
 * (ตรรกะของตัวกลางเองมี unit test แยกที่ src/pages/api/patch-file/proxy.test.js)
 */

import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const BASE = process.env.BASE_URL ?? 'http://localhost:4321';
const ascii = (text) => Array.from(text, (c) => c.charCodeAt(0));

const SOURCE = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

// แพตช์ IPS: เขียนทับ 3 ไบต์ที่ตำแหน่ง 2 ด้วย AA BB CC
const PATCH = Buffer.from([
  ...ascii('PATCH'),
  0x00, 0x00, 0x02,
  0x00, 0x03,
  0xaa, 0xbb, 0xcc,
  ...ascii('EOF'),
]);

const EXPECTED = Buffer.from([0, 1, 0xaa, 0xbb, 0xcc, 5, 6, 7, 8, 9]);

const results = [];
function check(name, fn) {
  return fn().then(
    () => { results.push(`  ✓ ${name}`); },
    (error) => { results.push(`  ✗ ${name}\n      ${error.message}`); process.exitCode = 1; }
  );
}

const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
);
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });

// ข้ามคู่มือมือใหม่ที่เด้งขึ้นอัตโนมัติ 500ms หลังโหลดหน้า ไม่งั้นมันจะมาบังปุ่มต่างๆ
// ระหว่างเทสต์วิ่งเร็วกว่าคนจริงกดเยอะ
await context.addInitScript(() => localStorage.setItem('webpatchGuideSeen', '1'));

// เน็ตในเครื่องทดสอบเข้า Google Fonts ไม่ได้ ตัดทิ้งไปเลยจะได้ไม่ค้างรอ
await context.route('https://fonts.googleapis.com/**', (route) => route.abort());
await context.route('https://fonts.gstatic.com/**', (route) => route.abort());

// ดักคำขอไฟล์แพตช์ แล้วตอบด้วยแพตช์ทดสอบข้างบน
await context.route('**/api/patch-file/**', (route) =>
  route.fulfill({ status: 200, contentType: 'application/octet-stream', body: PATCH })
);

const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

console.log('\nหน้าแรก');

await check('โหลดหน้าแรกได้และแสดงชื่อเว็บ', async () => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  assert.match(await page.locator('h1').first().textContent(), /เกมไทย/);
});

await check('แสดงเกมที่พร้อมให้แปะ', async () => {
  assert.ok(await page.getByText('Bahamut Lagoon').first().isVisible());
});

await check('บอกผู้ใช้ว่าไฟล์เกมไม่ถูกอัปโหลด', async () => {
  assert.ok(await page.getByText(/ไม่ถูกส่งออกจากเครื่อง/).first().isVisible());
});

await check('เมนูล่างพาไปหน้าอื่นได้ครบ ไม่มีลิงก์ตาย', async () => {
  for (const path of ['/patch', '/progress', '/report-bug', '/']) {
    const response = await page.goto(`${BASE}${path}`);
    assert.equal(response.status(), 200, `${path} ตอบ ${response.status()}`);
  }
});

console.log('หน้าแปะแพตช์');

await page.goto(`${BASE}/patch`, { waitUntil: 'domcontentloaded' });

await check('ตอนแรกยังไม่โชว์ขั้นตอนถัดไป จนกว่าจะเลือกเกม', async () => {
  assert.ok(await page.locator('#step-file').isHidden());
});

await check('เลือกเกมแล้วขั้นตอนถัดไปโผล่ขึ้นมา', async () => {
  await page.selectOption('#game-select', { label: 'Bahamut Lagoon (Super Famicom)' });
  await page.waitForSelector('#step-file:not([hidden])');
  assert.match(await page.locator('#info-title').textContent(), /Bahamut Lagoon/);
});

await check('กรองเกมตามเครื่องเล่นที่เลือก', async () => {
  await page.selectOption('#console-select', { label: 'Game Boy Advance' });
  const options = await page.locator('#game-select option').allTextContents();
  assert.ok(options.some((o) => o.includes('Golden Sun')), 'ควรมี Golden Sun');
  assert.ok(!options.some((o) => o.includes('Bahamut')), 'ไม่ควรมีเกมของเครื่องอื่น');
});

await check('ปฏิเสธไฟล์ผิดรุ่น ขึ้นป๊อปอัปแจ้งเตือน และไม่มีปุ่มแปะให้กด', async () => {
  await page.selectOption('#console-select', '');
  await page.selectOption('#game-select', { label: 'Bahamut Lagoon (Super Famicom)' });
  await page.setInputFiles('#source-file', {
    name: 'wrong.sfc',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from([9, 9, 9, 9]),
  });
  await page.locator('#file-msgbox.open').waitFor({ state: 'attached' });
  assert.equal(await page.locator('#file-msgbox-ok.open').count(), 0, 'ป๊อปอัปไฟล์ใช้ได้ต้องไม่ขึ้น');
});

await check('เลือกไฟล์บีบอัด (.zip) ถูกปฏิเสธด้วยป๊อปอัปข้อความเฉพาะ', async () => {
  await page.setInputFiles('#source-file', {
    name: 'archive.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]),
  });
  await page.locator('#file-msgbox-zip.open').waitFor({ state: 'attached' });
  assert.equal(await page.locator('#file-msgbox.open').count(), 0, 'ป๊อปอัปไฟล์ผิดรุ่นต้องปิดอยู่');
});

await check('รับไฟล์ที่ตรงรุ่น เด้งป๊อปอัปไฟล์ใช้ได้ พร้อมปุ่มแปะ', async () => {
  await page.setInputFiles('#source-file', {
    name: 'bahamut.sfc',
    mimeType: 'application/octet-stream',
    buffer: SOURCE,
  });
  await page.locator('#file-msgbox-ok.open').waitFor({ state: 'attached' });
  assert.equal(await page.locator('#file-msgbox-zip.open').count(), 0, 'ป๊อปอัปไฟล์บีบอัดต้องปิดอยู่');
  assert.match(await page.locator('#apply-btn').textContent(), /แปะแพตช์ภาษาไทย/);
  assert.ok(await page.locator('#apply-btn').isEnabled());
});

await check('แปะแพตช์แล้วปุ่มเปลี่ยนเป็นปุ่มดาวน์โหลดในป๊อปอัปเดิม (ยังไม่เด้งป๊อปอัปคู่มือ)', async () => {
  await page.click('#apply-btn');
  await page.waitForFunction(
    () => document.getElementById('apply-btn').dataset.phase === 'download',
    null,
    { timeout: 15000 }
  );
  assert.match(await page.locator('#apply-btn').textContent(), /ดาวน์โหลดไฟล์ภาษาไทย/);
  assert.ok(await page.locator('#file-msgbox-ok').evaluate((e) => e.classList.contains('open')), 'ป๊อปอัปไฟล์ใช้ได้ต้องยังเปิดอยู่');
  assert.equal(await page.locator('#patch-done-modal.open').count(), 0, 'ป๊อปอัปคู่มือยังไม่ควรเด้งตอนนี้');
});

await check('กดปุ่มดาวน์โหลด: ไฟล์ถูกต้องทุกไบต์ ตั้งชื่อลงท้าย _TH แล้วเด้งป๊อปอัปคู่มือเปิดเล่น', async () => {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#apply-btn'),
  ]);

  assert.equal(download.suggestedFilename(), 'bahamut_TH.sfc');

  const path = await download.path();
  const actual = await import('node:fs/promises').then((fs) => fs.readFile(path));

  assert.equal(
    createHash('sha1').update(actual).digest('hex'),
    createHash('sha1').update(EXPECTED).digest('hex'),
    `ไฟล์ผลลัพธ์ไม่ตรง: ได้ [${[...actual]}] ควรเป็น [${[...EXPECTED]}]`
  );

  await page.locator('#patch-done-modal.open').waitFor({ state: 'attached' });
  assert.equal(await page.locator('#file-msgbox-ok.open').count(), 0, 'ป๊อปอัปไฟล์ใช้ได้ต้องปิดไปแล้ว');
  assert.match(await page.locator('#patch-done-title').textContent(), /Bahamut Lagoon/);
  assert.match(await page.locator('#patch-done-filename').textContent(), /bahamut_TH\.sfc/);
  assert.ok(await page.getByText('เปิดเล่นยังไง?').isVisible());
});

await check('ไม่มีปุ่มแชร์อีกต่อไป', async () => {
  assert.equal(await page.locator('#share-btn').count(), 0);
});

await check('ไม่มีปุ่มดาวน์โหลดไฟล์เกมซ้ำในป๊อปอัปคู่มือ (โหลดไปแล้วในป๊อปอัปก่อนหน้า)', async () => {
  assert.equal(await page.locator('#download-btn').count(), 0);
});

await check('ไม่มีปุ่มดาวน์โหลดภาพปกในป๊อปอัปแปะเสร็จอีกต่อไป', async () => {
  assert.equal(await page.locator('#patch-done-cover-dl').count(), 0);
});

await check('ปิดป๊อปอัปแปะเสร็จได้ด้วยปุ่ม "เข้าใจแล้ว เล่นได้เลย"', async () => {
  await page.click('#patch-done-done-btn');
  await page.locator('#patch-done-modal:not(.open)').waitFor({ state: 'attached' });
});

console.log('เครื่องมือหาค่า SHA1');

await check('คำนวณ SHA1 ตรงกับที่ sha1sum คำนวณได้', async () => {
  await page.goto(`${BASE}/tools/sha1`, { waitUntil: 'domcontentloaded' });
  await page.setInputFiles('#file', {
    name: 'harvest-moon.bin',
    mimeType: 'application/octet-stream',
    buffer: SOURCE,
  });
  await page.locator('#result').waitFor({ state: 'visible', timeout: 10000 });

  const expected = createHash('sha1').update(SOURCE).digest('hex');
  assert.equal((await page.locator('#hash').textContent()).trim(), expected);
});

await check('ยังไม่โชว์ผลลัพธ์ก่อนเลือกไฟล์', async () => {
  await page.goto(`${BASE}/tools/sha1`, { waitUntil: 'domcontentloaded' });
  assert.equal(await page.locator('#result').isVisible(), false);
});

console.log('หน้า Admin');

await check('หน้า Admin เปิดได้ ไม่ 404', async () => {
  const response = await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
  assert.equal(response.status(), 200);
});

await check('ไม่มีเครื่องมือแอดมินโผล่ให้คนที่ยังไม่ล็อกอิน', async () => {
  await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  assert.equal(await page.locator('#game-list').isVisible(), false, 'รายการเกมต้องไม่โผล่');
  assert.equal(await page.locator('#add-btn').isVisible(), false, 'ปุ่มเพิ่มเกมต้องไม่โผล่');
  assert.equal(await page.locator('#signout').isVisible(), false, 'ปุ่มออกจากระบบต้องไม่โผล่');
});

await check('หน้าฟอร์มไม่โชว์ช่องกรอกให้คนที่ยังไม่ล็อกอิน', async () => {
  await page.goto(`${BASE}/admin/game`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  assert.equal(await page.locator('#game-form').isVisible(), false, 'ฟอร์มต้องยังไม่โผล่');
});

console.log('หน้ากำลังทำอยู่');

await check('แสดงแถบความคืบหน้าของเกมที่ยังไม่เสร็จ', async () => {
  await page.goto(`${BASE}/progress`, { waitUntil: 'domcontentloaded' });
  assert.ok(await page.getByText('Harvest Moon: Back to Nature').first().isVisible());
  assert.match(await page.locator('.bar__fill').first().getAttribute('style'), /82%/);
});

await check('ไม่มี error หลุดออกมาจากหน้าเว็บเลย', async () => {
  assert.deepEqual(pageErrors, []);
});

await page.screenshot({ path: 'e2e/screenshot-progress.png' });
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.screenshot({ path: 'e2e/screenshot-home.png', fullPage: true });
await page.goto(`${BASE}/patch`, { waitUntil: 'domcontentloaded' });
await page.screenshot({ path: 'e2e/screenshot-patch.png', fullPage: true });

await browser.close();

console.log('\n' + results.join('\n'));
console.log(
  process.exitCode ? '\nมีข้อที่ไม่ผ่าน\n' : `\nผ่านทั้งหมด ${results.length} ข้อ\n`
);
