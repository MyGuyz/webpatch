import { applyPatch } from '../patcher/index.js';
import { sha1Hex } from '../patcher/sha1.js';
import { sfxConfirm, sfxSuccess, sfxSelect, sfxTick, sfxError, sfxCancel } from '../lib/sfx.js';

const el = (id) => document.getElementById(id);

/** ไฟล์ที่ใหญ่กว่านี้เสี่ยงแรมไม่พอบนมือถือ จึงเตือนก่อน */
const BIG_FILE_BYTES = 300 * 1024 * 1024;

/**
 * URL ของไฟล์ผลลัพธ์ (blob) อยู่นอก init() เพราะเว็บนี้เปลี่ยนหน้าแบบ SPA
 * (ดู astro:page-load ด้านล่าง) เอกสารเดิมไม่ได้ถูกทิ้งตอนเปลี่ยนหน้า
 * ถ้าไม่ปล่อยตรงนี้ตอนกลับมาหน้านี้ใหม่ blob เก่าจะค้างกินแรมไปตลอด session
 */
let resultUrl = null;

document.addEventListener('astro:page-load', init);

function init() {
  const consoleSelect = el('console-select');
  if (!consoleSelect) return; // หน้านี้ยังไม่มีเกมพร้อมให้แปะ เลยไม่มีฟอร์มให้ผูก

  // อ่านจาก JSON data island แทน window global ตัวแปรธรรมดา — เพราะเว็บนี้เปลี่ยนหน้า
  // แบบ SPA และ window.__GAMES__ ถูกใช้ชื่อซ้ำกันหลายหน้าโดยรูปร่างข้อมูลไม่เหมือนกัน
  // (เช่นหน้านี้ console เป็น object แต่หน้าแจ้งบั๊กเป็น string) ถ้าตั้งค่าผ่าน
  // <script> ธรรมดา บางจังหวะเบราว์เซอร์จะข้ามไม่รันสคริปต์ซ้ำ (เนื้อหาเหมือนที่เคยรันไปแล้ว
  // ในเซสชันนี้) ทำให้ข้อมูลจากอีกหน้าค้างอยู่ — data island เป็นแค่ข้อมูลในหน้า
  // ไม่ใช่สคริปต์ที่ต้อง "รัน" จึงไม่มีปัญหานี้ อ่านค่าปัจจุบันตรงๆ ได้เสมอ
  const data = JSON.parse(el('patch-data')?.textContent ?? '{}');
  const games = data.games ?? [];
  const preselectId = data.preselectId;

  const gameSelect = el('game-select');
  const gameInfo = el('game-info');
  const stepFile = el('step-file');
  const stepRun = el('step-run');
  const fileInput = el('source-file');
  const fileSummary = el('file-summary');
  const fileMsgbox = el('file-msgbox');
  const msgboxRetry = el('msgbox-retry');
  const fileMsgboxZip = el('file-msgbox-zip');
  const msgboxZipRetry = el('msgbox-zip-retry');
  const fileMsgboxOk = el('file-msgbox-ok');
  const applyBtn = el('apply-btn');
  const downloadBtn = el('download-btn');
  const patchDoneModal = el('patch-done-modal');
  const patchDoneClose = el('patch-done-close');
  const patchDoneDoneBtn = el('patch-done-done-btn');
  const patchDoneCoverImg = el('patch-done-cover-img');
  const patchDoneCoverArt = patchDoneModal.querySelector('.patch-done__cover-art');
  const patchDoneTitle = el('patch-done-title');
  const patchDoneFilename = el('patch-done-filename');
  const logBox = el('log');

  if (resultUrl) {
    URL.revokeObjectURL(resultUrl);
    resultUrl = null;
  }

  let selectedGame = null;
  let sourceBytes = null;
  let sourceName = '';

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

    if (game) sfxSelect();

    if (!game) {
      gameInfo.hidden = true;
      stepFile.hidden = true;
      stepRun.hidden = true;
      return;
    }

    const isBeta = game.status === 'beta';
    el('info-status').className = `tag ${isBeta ? 'tag--beta' : 'tag--ready'}`;
    el('info-status').textContent = isBeta ? '★ BETA' : '★ READY';
    el('info-console').textContent = game.console?.name ?? '—';
    el('info-title').textContent = game.title;
    el('info-desc').textContent = game.description ?? '';

    const parts = [];
    if (game.patch_version) parts.push(`แพตช์ ${game.patch_version}`);
    if (game.patch_format) parts.push(`.${game.patch_format}`);
    if (game.patch_updated_at) parts.push(`อัปเดต ${game.patch_updated_at}`);
    if (game.download_count) parts.push(`📥 แปะไปแล้ว ${game.download_count.toLocaleString('th-TH')} ครั้ง`);
    el('info-version').textContent = parts.join(' · ');

    el('info-spec').textContent = game.source_spec ?? 'ไม่ได้ระบุ';

    renderChangelog(game.changelog ?? []);

    gameInfo.hidden = false;
    stepFile.hidden = false;
    stepRun.hidden = false;

    clearLog();
    log(`เลือกเกม ${game.title} แล้ว`);
    log('รอเลือกไฟล์เกมต้นฉบับของคุณ');
  }

  function renderChangelog(entries) {
    const box = el('info-changelog');
    const list = el('info-changelog-list');

    if (entries.length === 0) {
      box.hidden = true;
      return;
    }

    list.innerHTML = '';
    for (const entry of entries) {
      const item = document.createElement('div');
      item.className = 'changelog-entry';

      const head = document.createElement('p');
      head.className = 'changelog-entry__head';
      head.textContent = entry.released_at ? `${entry.version} · ${entry.released_at}` : entry.version;

      const body = document.createElement('p');
      body.className = 'changelog-entry__body';
      body.textContent = entry.body;

      item.append(head, body);
      list.appendChild(item);
    }

    box.hidden = false;
  }

  function resetFileState() {
    sourceBytes = null;
    sourceName = '';
    fileInput.value = '';
    fileSummary.textContent = '';
    showFileStatus('none');
    applyBtn.disabled = true;
    hideDownload();
  }

  /** สลับกล่องสถานะไฟล์ 3 แบบ (error/zip/ok) แบบฝังอยู่ในหน้าเลย ไม่ใช่ป๊อปอัป
     ให้เห็นทีละกล่องตามผลตรวจไฟล์ล่าสุด — ตรงกับ mockup ที่ร่างไว้ */
  function showFileStatus(kind) {
    fileMsgbox.hidden = kind !== 'error';
    fileMsgboxZip.hidden = kind !== 'zip';
    fileMsgboxOk.hidden = kind !== 'ok';
  }

  function hideDownload() {
    patchDoneModal.classList.remove('open');
    if (resultUrl) {
      URL.revokeObjectURL(resultUrl);
      resultUrl = null;
    }
  }

  // ── ตรวจไฟล์ต้นฉบับ ────────────────────────────────────────

  async function handleFileChosen() {
    hideDownload();
    showFileStatus('none');
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

    if (isZipFile(sourceBytes, file.name)) {
      sfxError();
      log('ไฟล์นี้เป็นไฟล์บีบอัด (.zip) ยังไม่ใช่ไฟล์เกม', 'error');
      showFileStatus('zip');
      sourceBytes = null;
      return;
    }

    if (selectedGame?.source_sha1) {
      log('กำลังตรวจว่าไฟล์ตรงรุ่นไหม...');
      const actual = await sha1Hex(sourceBytes);

      if (actual.toLowerCase() !== selectedGame.source_sha1.toLowerCase()) {
        sfxError();
        log('ไฟล์นี้ไม่ตรงรุ่นที่แพตช์รองรับ', 'error');
        log(`ที่ต้องการ: ${selectedGame.source_sha1}`, 'error');
        log(`ไฟล์ของคุณ: ${actual}`, 'error');
        showFileStatus('error');
        sourceBytes = null;
        return;
      }
      log('ไฟล์ตรงรุ่นที่แพตช์รองรับ', 'ok');
      showFileStatus('ok');
    } else {
      log('แพตช์นี้ไม่ได้ระบุลายนิ้วมือไฟล์ไว้ จึงข้ามการตรวจรุ่น');
    }

    applyBtn.disabled = false;
    sfxConfirm();
    log('พร้อมแปะแล้ว กดปุ่มด้านบนได้เลย', 'ok');
  }

  // ── แปะแพตช์ ──────────────────────────────────────────────

  async function runPatch() {
    if (!selectedGame || !sourceBytes) return;

    sfxConfirm();
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
      downloadBtn.dataset.filename = thaiFileName(sourceName);

      patchDoneTitle.textContent = selectedGame.title;
      patchDoneFilename.textContent = thaiFileName(sourceName);
      if (selectedGame.cover_url) {
        patchDoneCoverImg.src = selectedGame.cover_url;
        patchDoneCoverImg.alt = `ปกเกม ${selectedGame.title}`;
        patchDoneCoverImg.hidden = false;
        patchDoneCoverArt.hidden = true;
      } else {
        patchDoneCoverImg.hidden = true;
        patchDoneCoverArt.hidden = false;
      }
      patchDoneModal.classList.add('open');

      sfxSuccess();
      log('แปะเสร็จแล้ว! กดปุ่มดาวน์โหลดในป๊อปอัปได้เลย', 'ok');
    } catch (error) {
      sfxError();
      log(error.message, 'error');
      log('ถ้าติดปัญหาซ้ำๆ ช่วยแจ้งบั๊กมาได้ที่หน้าแจ้งบั๊กนะ', 'error');
    } finally {
      applyBtn.textContent = originalLabel;
      applyBtn.disabled = false;
    }
  }

  function downloadResult() {
    if (!resultUrl) return;
    sfxTick();
    const link = document.createElement('a');
    link.href = resultUrl;
    link.download = downloadBtn.dataset.filename ?? 'patched.bin';
    link.click();
  }

  // ── เริ่มทำงาน ────────────────────────────────────────────

  consoleSelect.addEventListener('change', () => {
    fillGameOptions();
    showGame(null);
  });

  gameSelect.addEventListener('change', () => {
    showGame(games.find((g) => String(g.id) === gameSelect.value) ?? null);
  });

  fileInput.addEventListener('change', handleFileChosen);
  msgboxRetry.addEventListener('click', () => {
    sfxTick();
    resetFileState();
    fileInput.click();
  });
  msgboxZipRetry.addEventListener('click', () => {
    sfxTick();
    resetFileState();
    fileInput.click();
  });
  applyBtn.addEventListener('click', runPatch);
  downloadBtn.addEventListener('click', downloadResult);
  patchDoneClose.addEventListener('click', () => {
    sfxCancel();
    patchDoneModal.classList.remove('open');
  });
  patchDoneDoneBtn.addEventListener('click', () => {
    sfxTick();
    patchDoneModal.classList.remove('open');
  });

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
}

// ── ตัวช่วย (ไม่ผูกกับ DOM ต่อหน้า ไม่ต้องอยู่ใน init) ──────────

/** ตรวจไฟล์บีบอัด (.zip/.rar/.7z) — ดักด้วย magic bytes ก่อน (กันกรณีถูกเปลี่ยนนามสกุลไฟล์)
   แล้วเสริมด้วยนามสกุลไฟล์ เพราะ .rar/.7z ตรวจ magic bytes ยากกว่า zip */
function isZipFile(bytes, name) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.zip') || lower.endsWith('.rar') || lower.endsWith('.7z')) return true;

  // ลายเซ็นไฟล์ zip: "PK" ตามด้วย 0x03/0x05/0x07 (local file / empty archive / spanned archive)
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07)
  );
}

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
