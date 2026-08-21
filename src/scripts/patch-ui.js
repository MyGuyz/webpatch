import { applyPatch } from '../patcher/index.js';
import { sha1Hex } from '../patcher/sha1.js';

const games = window.__GAMES__ ?? [];
const preselectId = window.__PRESELECT__;

const el = (id) => document.getElementById(id);

const consoleSelect = el('console-select');
const gameSelect = el('game-select');
const gameInfo = el('game-info');
const stepFile = el('step-file');
const stepRun = el('step-run');
const fileInput = el('source-file');
const fileSummary = el('file-summary');
const applyBtn = el('apply-btn');
const downloadBtn = el('download-btn');
const logBox = el('log');

/** ไฟล์ที่ใหญ่กว่านี้เสี่ยงแรมไม่พอบนมือถือ จึงเตือนก่อน */
const BIG_FILE_BYTES = 300 * 1024 * 1024;

let selectedGame = null;
let sourceBytes = null;
let sourceName = '';
let resultUrl = null;

// ── กล่อง log ─────────────────────────────────────────────

let logCount = 0;

function log(message, kind = '') {
  logCount += 1;
  const line = document.createElement('span');
  line.className = kind ? `log__line--${kind}` : '';
  line.textContent = `${String(logCount).padStart(2, '0')}  ${message}\n`;
  logBox.appendChild(line);
  logBox.scrollTop = logBox.scrollHeight;
}

function clearLog() {
  logBox.textContent = '';
  logCount = 0;
}

// ── เลือกเกม ──────────────────────────────────────────────

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
}

function showGame(game) {
  selectedGame = game;
  resetFileState();

  if (!game) {
    gameInfo.hidden = true;
    stepFile.hidden = true;
    stepRun.hidden = true;
    return;
  }

  const isBeta = game.status === 'beta';
  el('info-status').className = `tag ${isBeta ? 'tag--beta' : 'tag--ready'}`;
  el('info-status').textContent = isBeta ? 'BETA' : 'พร้อมให้ Patch';
  el('info-console').textContent = game.console?.name ?? '—';
  el('info-title').textContent = game.title;
  el('info-desc').textContent = game.description ?? '';

  const parts = [];
  if (game.patch_version) parts.push(`แพตช์ ${game.patch_version}`);
  if (game.patch_format) parts.push(`.${game.patch_format}`);
  if (game.patch_updated_at) parts.push(`อัปเดต ${game.patch_updated_at}`);
  el('info-version').textContent = parts.join(' · ');

  el('info-spec').textContent = game.source_spec ?? 'ไม่ได้ระบุ';

  gameInfo.hidden = false;
  stepFile.hidden = false;
  stepRun.hidden = false;

  clearLog();
  log(`เลือกเกม ${game.title} แล้ว`);
  log('รอเลือกไฟล์เกมต้นฉบับของคุณ');
}

function resetFileState() {
  sourceBytes = null;
  sourceName = '';
  fileInput.value = '';
  fileSummary.textContent = '';
  applyBtn.disabled = true;
  hideDownload();
}

function hideDownload() {
  downloadBtn.hidden = true;
  if (resultUrl) {
    URL.revokeObjectURL(resultUrl);
    resultUrl = null;
  }
}

// ── ตรวจไฟล์ต้นฉบับ ────────────────────────────────────────

async function handleFileChosen() {
  hideDownload();
  const file = fileInput.files?.[0];
  if (!file) {
    resetFileState();
    return;
  }

  sourceName = file.name;
  fileSummary.textContent = `${file.name} · ${formatSize(file.size)}`;
  applyBtn.disabled = true;

  if (file.size > BIG_FILE_BYTES) {
    log(`ไฟล์ใหญ่ (${formatSize(file.size)}) อาจใช้เวลาสักพัก อย่าเพิ่งปิดแท็บนะ`);
  }

  try {
    log('กำลังอ่านไฟล์...');
    sourceBytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    log('อ่านไฟล์ไม่สำเร็จ — ไฟล์อาจใหญ่เกินกว่าที่เครื่องจะไหว ลองบนคอมพิวเตอร์ดูนะ', 'error');
    return;
  }

  if (selectedGame?.source_sha1) {
    log('กำลังตรวจว่าไฟล์ตรงรุ่นไหม...');
    const actual = await sha1Hex(sourceBytes);

    if (actual.toLowerCase() !== selectedGame.source_sha1.toLowerCase()) {
      log('ไฟล์นี้ไม่ตรงรุ่นที่แพตช์รองรับ', 'error');
      log(`ที่ต้องการ: ${selectedGame.source_sha1}`, 'error');
      log(`ไฟล์ของคุณ: ${actual}`, 'error');
      log('แปะไปจะได้ไฟล์เสีย จึงยังไม่ให้แปะ — ลองหาไฟล์ให้ตรงสเปกด้านบนก่อนนะ', 'error');
      sourceBytes = null;
      return;
    }
    log('ไฟล์ตรงรุ่นที่แพตช์รองรับ', 'ok');
  } else {
    log('แพตช์นี้ไม่ได้ระบุลายนิ้วมือไฟล์ไว้ จึงข้ามการตรวจรุ่น');
  }

  applyBtn.disabled = false;
  log('พร้อมแปะแล้ว กดปุ่มด้านบนได้เลย', 'ok');
}

// ── แปะแพตช์ ──────────────────────────────────────────────

async function runPatch() {
  if (!selectedGame || !sourceBytes) return;

  applyBtn.disabled = true;
  hideDownload();
  const originalLabel = applyBtn.textContent;
  applyBtn.textContent = '⏳ กำลังแปะ...';

  try {
    log('กำลังโหลดไฟล์แพตช์...');
    const response = await fetch(`/api/patch-file/${selectedGame.id}`);

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(detail || `โหลดแพตช์ไม่สำเร็จ (${response.status})`);
    }

    const patchBytes = new Uint8Array(await response.arrayBuffer());
    log(`โหลดแพตช์แล้ว (${formatSize(patchBytes.length)})`);

    // ยอมให้หน้าจอวาด log ก่อน เพราะขั้นถัดไปกินเวลาและบล็อกจอ
    await nextFrame();

    log('กำลังแปะ...');
    const result = applyPatch(sourceBytes, patchBytes, selectedGame.patch_format);

    resultUrl = URL.createObjectURL(new Blob([result], { type: 'application/octet-stream' }));
    downloadBtn.hidden = false;
    downloadBtn.dataset.filename = thaiFileName(sourceName);

    log('แปะเสร็จแล้ว! กดปุ่มดาวน์โหลดด้านล่างได้เลย', 'ok');
  } catch (error) {
    log(error.message, 'error');
    log('ถ้าติดปัญหาซ้ำๆ ช่วยแจ้งบั๊กมาได้ที่หน้าแจ้งบั๊กนะ', 'error');
  } finally {
    applyBtn.textContent = originalLabel;
    applyBtn.disabled = false;
  }
}

function downloadResult() {
  if (!resultUrl) return;
  const link = document.createElement('a');
  link.href = resultUrl;
  link.download = downloadBtn.dataset.filename ?? 'patched.bin';
  link.click();
}

// ── ตัวช่วย ───────────────────────────────────────────────

function thaiFileName(name) {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return `${name}_TH`;
  return `${name.slice(0, dot)}_TH${name.slice(dot)}`;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} ไบต์`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

// ── เริ่มทำงาน ────────────────────────────────────────────

consoleSelect.addEventListener('change', () => {
  fillGameOptions();
  showGame(null);
});

gameSelect.addEventListener('change', () => {
  showGame(games.find((g) => String(g.id) === gameSelect.value) ?? null);
});

fileInput.addEventListener('change', handleFileChosen);
applyBtn.addEventListener('click', runPatch);
downloadBtn.addEventListener('click', downloadResult);

fillGameOptions();

if (preselectId) {
  const game = games.find((g) => String(g.id) === String(preselectId));
  if (game) {
    if (game.console) consoleSelect.value = String(game.console.id);
    fillGameOptions();
    gameSelect.value = String(game.id);
    showGame(game);
  }
}
