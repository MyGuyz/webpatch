import { showMessage, hideMessage } from '../lib/admin-client.js';
import { buildBugReportPayload, formatSize } from '../lib/bug-report-form.js';
import { compressImageIfNeeded } from '../lib/compress-image.js';
import { sfxSuccess, sfxError, sfxWarn, sfxConfirm } from '../lib/sfx.js';

const el = (id) => document.getElementById(id);

document.addEventListener('astro:page-load', init);

function init() {
  const form = el('bug-form');
  if (!form) return;

  // อ่านจาก JSON data island แทน window.__GAMES__ — กันข้อมูลจากหน้าอื่นที่ใช้ชื่อ
  // ตัวแปรเดียวกันแต่รูปร่างไม่เหมือนกันค้างอยู่ (ดูคำอธิบายเดียวกันใน patch-ui.js)
  const games = JSON.parse(el('report-bug-data')?.textContent ?? '[]');

  const msg = el('msg');
  const consoleSelect = el('console-select');
  const gameSelect = el('game-select');
  const versionSelect = el('version-select');
  const mediaInput = el('media-input');
  const mediaSummary = el('media-summary');
  const submitBtn = el('submit-btn');

  fillGameOptions();

  consoleSelect.addEventListener('change', () => {
    fillGameOptions();
  });

  gameSelect.addEventListener('change', () => {
    fillVersionOptions();
  });

  mediaInput.addEventListener('change', () => {
    const files = [...mediaInput.files];
    mediaSummary.textContent = files.length
      ? files.map((f) => `${f.name} (${formatSize(f.size)})`).join(', ')
      : '';
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    handleSubmit();
  });

  function fillGameOptions() {
    const consoleId = consoleSelect.value;
    const list = consoleId
      ? games.filter((g) => String(g.console?.id) === consoleId)
      : games;

    gameSelect.innerHTML = '<option value="">— เลือกเกม —</option>';
    for (const game of list) {
      const option = document.createElement('option');
      option.value = String(game.id);
      option.textContent = game.console ? `${game.title} (${game.console.name})` : game.title;
      gameSelect.appendChild(option);
    }
    fillVersionOptions();
  }

  function fillVersionOptions() {
    const game = games.find((g) => String(g.id) === gameSelect.value);
    versionSelect.innerHTML = '';

    if (!game || game.versions.length === 0) {
      versionSelect.innerHTML = '<option value="">— เลือกเกมก่อน —</option>';
      versionSelect.disabled = true;
      return;
    }

    versionSelect.disabled = false;
    versionSelect.innerHTML = '<option value="">— เลือกเวอร์ชัน —</option>';
    for (const version of game.versions) {
      const option = document.createElement('option');
      option.value = version;
      option.textContent = version;
      versionSelect.appendChild(option);
    }
  }

  async function handleSubmit() {
    sfxConfirm();
    hideMessage(msg);
    clearFieldErrors();

    // กับดักสแปมง่ายๆ — ช่องนี้ซ่อนไว้ คนจริงไม่มีทางกรอกทัน เนียนไว้ว่าส่งสำเร็จ จะได้ไม่รู้ตัวว่าโดนกัน
    // (เซิร์ฟเวอร์เช็คซ้ำอีกชั้นเสมอ อันนี้แค่กันไม่ให้บอทที่ติดกับดักยิงคำขอออกไปโดยเปล่าประโยชน์)
    if (form.elements.note_extra.value.trim() !== '') {
      form.reset();
      showMessage(msg, 'ส่งรายงานแล้ว ขอบคุณครับ', 'ok');
      return;
    }

    const values = Object.fromEntries(new FormData(form));
    const files = [...mediaInput.files];

    // ตรวจฝั่งเบราว์เซอร์ก่อนเพื่อบอกผู้ใช้ได้ทันทีโดยไม่ต้องรอเซิร์ฟเวอร์ —
    // เซิร์ฟเวอร์ (/api/bug-report-submit) ยังตรวจซ้ำแบบเดียวกันอีกชั้นเสมอ เป็นด่านจริง
    const result = buildBugReportPayload(values, files);
    if (!result.ok) {
      sfxWarn();
      showFieldErrors(result.errors);
      showMessage(msg, 'ยังกรอกไม่ครบ — ดูข้อความสีแดงใต้ช่องที่มีปัญหา');
      return;
    }

    submitBtn.disabled = true;

    try {
      submitBtn.textContent = 'กำลังย่อรูป...';
      const filesToUpload = await Promise.all(files.map(compressImageIfNeeded));

      submitBtn.textContent = 'กำลังส่ง...';
      const body = new FormData();
      for (const [key, value] of Object.entries(values)) body.append(key, value);
      for (const file of filesToUpload) body.append('media', file, file.name);

      const response = await fetch('/api/bug-report-submit', { method: 'POST', body });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok) {
        if (data?.errors) showFieldErrors(data.errors);
        throw new Error(data?.message || 'ส่งรายงานไม่สำเร็จ ลองใหม่อีกครั้ง');
      }

      form.reset();
      mediaSummary.textContent = '';
      fillGameOptions();
      sfxSuccess();
      showMessage(msg, 'ส่งรายงานแล้ว ขอบคุณที่ช่วยแจ้งครับ 🙏', 'ok');
    } catch (error) {
      sfxError();
      showMessage(msg, error.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'ส่งรายงาน';
    }
  }

  function clearFieldErrors() {
    for (const e of form.querySelectorAll('[data-err]')) e.textContent = '';
  }

  function showFieldErrors(errors) {
    for (const [field, text] of Object.entries(errors)) {
      const target = field === 'media' ? 'media' : field;
      const e = form.querySelector(`[data-err="${target}"]`);
      if (e) e.textContent = text;
    }
    const first = form.querySelector('.err:not(:empty)');
    first?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}
