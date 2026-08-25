import { getSupabase, showMessage, hideMessage } from '../lib/admin-client.js';
import { buildBugReportPayload, explainBugReportError, formatSize } from '../lib/bug-report-form.js';
import { compressImageIfNeeded } from '../lib/compress-image.js';

const games = window.__GAMES__ ?? [];

const el = (id) => document.getElementById(id);

const form = el('bug-form');
if (form) start();

function start() {
  const msg = el('msg');
  const gameSelect = el('game-select');
  const versionSelect = el('version-select');
  const mediaInput = el('media-input');
  const mediaSummary = el('media-summary');
  const submitBtn = el('submit-btn');

  const supabase = getSupabase();

  if (!supabase) {
    form.hidden = true;
    showMessage(msg, 'ยังไม่ได้ตั้งค่า Supabase — หน้านี้ยังส่งรายงานไม่ได้');
    return;
  }

  fillGameOptions();

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
    gameSelect.innerHTML = '<option value="">— เลือกเกม —</option>';
    for (const game of games) {
      const option = document.createElement('option');
      option.value = String(game.id);
      option.textContent = game.console ? `${game.title} (${game.console})` : game.title;
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
    hideMessage(msg);
    clearFieldErrors();

    // กับดักสแปมง่ายๆ — ช่องนี้ซ่อนไว้ คนจริงไม่มีทางกรอก บอทที่กรอกทุกช่องจะติด
    // เนียนไว้ว่าส่งสำเร็จ จะได้ไม่รู้ตัวว่าโดนกัน
    if (form.elements.note_extra.value.trim() !== '') {
      form.reset();
      showMessage(msg, 'ส่งรายงานแล้ว ขอบคุณครับ', 'ok');
      return;
    }

    const values = Object.fromEntries(new FormData(form));
    const files = [...mediaInput.files];

    const result = buildBugReportPayload(values, files);
    if (!result.ok) {
      showFieldErrors(result.errors);
      showMessage(msg, 'ยังกรอกไม่ครบ — ดูข้อความสีแดงใต้ช่องที่มีปัญหา');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'กำลังส่ง...';

    try {
      const guard = await checkRateLimit();
      if (!guard.allowed) {
        showMessage(msg, guard.message);
        return;
      }

      submitBtn.textContent = 'กำลังย่อรูป...';
      const filesToUpload = await Promise.all(files.map(compressImageIfNeeded));

      submitBtn.textContent = 'กำลังส่ง...';
      const mediaPaths = await uploadFiles(filesToUpload);

      const { error } = await supabase
        .from('bug_reports')
        .insert({ ...result.payload, media_paths: mediaPaths });

      if (error) throw error;

      form.reset();
      mediaSummary.textContent = '';
      fillGameOptions();
      showMessage(msg, 'ส่งรายงานแล้ว ขอบคุณที่ช่วยแจ้งครับ 🙏', 'ok');
    } catch (error) {
      showMessage(msg, explainBugReportError(error));
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'ส่งรายงาน';
    }
  }

  async function checkRateLimit() {
    try {
      const response = await fetch('/api/bug-report-guard', { method: 'POST' });
      return await response.json();
    } catch {
      // เช็คไม่สำเร็จ (เช่นออฟไลน์) — ปล่อยผ่าน อย่าบล็อกคนแจ้งบั๊กจริงเพราะปัญหาที่ไม่เกี่ยวกับเขา
      return { allowed: true };
    }
  }

  async function uploadFiles(files) {
    const folder = crypto.randomUUID();
    const paths = [];

    for (const [index, file] of files.entries()) {
      const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const path = `${folder}/${index}-${safeName}`;

      const { error } = await supabase.storage
        .from('bug-reports')
        .upload(path, file, { contentType: file.type });

      if (error) throw error;
      paths.push(path);
    }

    return paths;
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
