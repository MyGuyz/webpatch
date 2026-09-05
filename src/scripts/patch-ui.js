import { applyPatch } from '../patcher/index.js';
import { sha1HexOfBlob } from '../patcher/sha1.js';
import { BigBuffer } from '../patcher/big-buffer.js';
import { sfxConfirm, sfxSuccess, sfxSelect, sfxTick, sfxError, sfxCancel } from '../lib/sfx.js';

const el = (id) => document.getElementById(id);

/** ไฟล์ที่ใหญ่กว่านี้เสี่ยงแรมไม่พอบนมือถือ จึงเตือนก่อน */
const BIG_FILE_BYTES = 300 * 1024 * 1024;

/**
 * ไฟล์ที่ใหญ่กว่านี้ (ระดับแผ่น PS2 ขึ้นไป) ต้องถือทั้งไฟล์ต้นฉบับ + ไฟล์ผลลัพธ์ไว้ใน
 * หน่วยความจำพร้อมกัน — เตือนเรื่องแรมให้ชัดกว่าข้อความไฟล์ใหญ่ทั่วไป (ดู ADR-016)
 */
const VERY_BIG_FILE_BYTES = 1.5 * 1024 * 1024 * 1024;

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
  const infoCoverImg = el('info-cover-img');
  const infoCoverArt = gameInfo.querySelector('.info__cover-art');
  const stepFile = el('step-file');
  const fileInput = el('source-file');
  const fileSummary = el('file-summary');
  const fileMsgbox = el('file-msgbox');
  const msgboxRetry = el('msgbox-retry');
  const msgboxClose = el('msgbox-close');
  const fileMsgboxZip = el('file-msgbox-zip');
  const msgboxZipRetry = el('msgbox-zip-retry');
  const msgboxZipClose = el('msgbox-zip-close');
  const fileMsgboxOk = el('file-msgbox-ok');
  const msgboxOkClose = el('msgbox-ok-close');
  const bigFileNote = el('patch-big-file-note');
  const runError = el('patch-run-error');
  const applyBtn = el('apply-btn');
  const progressBox = el('patch-progress');
  const progressLabel = el('patch-progress-label');
  const progressBar = el('patch-progress-bar');
  const progressFill = el('patch-progress-fill');
  const patchDoneModal = el('patch-done-modal');
  const patchDoneClose = el('patch-done-close');
  const patchDoneDoneBtn = el('patch-done-done-btn');
  const patchDoneCoverImg = el('patch-done-cover-img');
  const patchDoneCoverArt = patchDoneModal.querySelector('.patch-done__cover-art');
  const patchDoneTitle = el('patch-done-title');
  const patchDoneFilename = el('patch-done-filename');

  if (resultUrl) {
    URL.revokeObjectURL(resultUrl);
    resultUrl = null;
  }

  let selectedGame = null;
  let sourceFile = null;
  let sourceName = '';
  let resultFilename = '';

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
      return;
    }

    const isBeta = game.status === 'beta';
    el('info-status').className = `tag ${isBeta ? 'tag--beta' : 'tag--ready'}`;
    el('info-status').textContent = isBeta ? '★ BETA' : '★ READY';
    el('info-console').textContent = game.console?.name ?? '—';
    if (game.cover_url) {
      infoCoverImg.src = game.cover_url;
      infoCoverImg.alt = `ปกเกม ${game.title}`;
      infoCoverImg.hidden = false;
      infoCoverArt.hidden = true;
    } else {
      infoCoverImg.hidden = true;
      infoCoverArt.hidden = false;
    }
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
    sourceFile = null;
    sourceName = '';
    fileInput.value = '';
    fileSummary.textContent = '';
    showFileStatus('none');
    setApplyPhase('patch');
    bigFileNote.hidden = true;
    runError.hidden = true;
    hideProgress();
    closePatchDoneModal();
  }

  /** สลับป๊อปอัปสถานะไฟล์ 3 แบบ (error/zip/ok) — โชว์ทีละอันตามผลตรวจไฟล์ล่าสุด */
  function showFileStatus(kind) {
    fileMsgbox.classList.toggle('open', kind === 'error');
    fileMsgboxZip.classList.toggle('open', kind === 'zip');
    fileMsgboxOk.classList.toggle('open', kind === 'ok');
  }

  /** ปุ่มเดียวในป๊อปอัป "ไฟล์นี้ใช้ได้" ทำหน้าที่ 2 อย่างสลับกัน:
     ก่อนแปะ = ปุ่มแปะ, แปะเสร็จ = ปุ่มดาวน์โหลด — ไม่ต้องมี 2 ปุ่มค้างพร้อมกัน */
  function setApplyPhase(phase) {
    applyBtn.dataset.phase = phase;
    if (phase === 'patch') {
      applyBtn.textContent = '✨ แปะแพตช์ภาษาไทย';
      applyBtn.disabled = false;
    } else if (phase === 'running') {
      applyBtn.textContent = '⏳ กำลังแปะ...';
      applyBtn.disabled = true;
    } else if (phase === 'download') {
      applyBtn.textContent = '↓ ดาวน์โหลดไฟล์ภาษาไทย';
      applyBtn.disabled = false;
    }
  }

  function closePatchDoneModal() {
    patchDoneModal.classList.remove('open');
    if (resultUrl) {
      URL.revokeObjectURL(resultUrl);
      resultUrl = null;
    }
  }

  // ── ตรวจไฟล์ต้นฉบับ ────────────────────────────────────────

  async function handleFileChosen() {
    closePatchDoneModal();
    showFileStatus('none');
    setApplyPhase('patch');
    runError.hidden = true;

    const file = fileInput.files?.[0];
    if (!file) {
      resetFileState();
      return;
    }

    sourceName = file.name;
    fileSummary.textContent = `${file.name} · ${formatSize(file.size)}`;

    // เช็คว่าเป็นไฟล์บีบอัดไหมด้วย magic bytes 4 ไบต์แรกพอ — ไม่ต้องอ่านทั้งไฟล์
    // (เดิมอ่านทั้งไฟล์เป็น ArrayBuffer เดียวตรงนี้เลย ซึ่งพังทันทีถ้าไฟล์ใหญ่กว่า ~2GB
    // ก่อนจะทันได้ตรวจอะไรเลยด้วยซ้ำ — ดู ADR-016)
    let header;
    try {
      header = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    } catch {
      sfxError();
      alert('อ่านไฟล์ไม่สำเร็จ — ลองปิดแท็บ/โปรแกรมอื่นเพื่อเคลียร์แรมแล้วลองใหม่');
      return;
    }

    if (isZipFile(header, file.name)) {
      sfxError();
      showFileStatus('zip');
      return;
    }

    if (selectedGame?.source_sha1) {
      fileSummary.textContent = `${file.name} · ${formatSize(file.size)} · กำลังตรวจไฟล์...`;

      let actual;
      try {
        actual = await sha1HexOfBlob(file, (loaded, total) => {
          if (loaded < total) {
            const percent = Math.round((loaded / total) * 100);
            fileSummary.textContent = `${file.name} · ${formatSize(file.size)} · กำลังตรวจไฟล์... ${percent}%`;
          }
        });
      } catch {
        sfxError();
        alert('อ่านไฟล์ไม่สำเร็จ — ลองปิดแท็บ/โปรแกรมอื่นเพื่อเคลียร์แรมแล้วลองใหม่');
        fileSummary.textContent = `${file.name} · ${formatSize(file.size)}`;
        return;
      }

      fileSummary.textContent = `${file.name} · ${formatSize(file.size)}`;

      if (actual.toLowerCase() !== selectedGame.source_sha1.toLowerCase()) {
        sfxError();
        showFileStatus('error');
        return;
      }
    }

    sourceFile = file;
    bigFileNote.hidden = file.size <= BIG_FILE_BYTES;
    bigFileNote.textContent =
      file.size > VERY_BIG_FILE_BYTES
        ? 'ไฟล์นี้ใหญ่มาก (ระดับแผ่น PS2 ขึ้นไป) ต้องใช้แรมค่อนข้างเยอะระหว่างแปะ แนะนำปิดแท็บ/โปรแกรมอื่นก่อน และใช้คอมพิวเตอร์ (ไม่ใช่มือถือ) อย่าเพิ่งปิดแท็บระหว่างแปะนะครับ'
        : 'ไฟล์นี้ค่อนข้างใหญ่ อาจใช้เวลาสักพัก อย่าเพิ่งปิดแท็บระหว่างแปะนะครับ';
    sfxConfirm();
    showFileStatus('ok');
  }

  // ── แปะแพตช์ ──────────────────────────────────────────────

  async function runPatch() {
    if (!selectedGame || !sourceFile) return;

    sfxConfirm();
    runError.hidden = true;
    setApplyPhase('running');
    showProgress('กำลังโหลดไฟล์แพตช์...', 0);

    try {
      const response = await fetch(`/api/patch-file/${selectedGame.id}`);

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || `โหลดแพตช์ไม่สำเร็จ (${response.status})`);
      }

      const patchBytes = await readResponseWithProgress(response, (loaded, total) => {
        updateProgress('กำลังโหลดไฟล์แพตช์...', total ? loaded / total : null);
      });

      // อ่านไฟล์ต้นฉบับทีละก้อนเข้า BigBuffer แทนที่จะอ่านทั้งไฟล์เป็น ArrayBuffer เดียว
      // (ตัวแปะแพตช์ทั้ง 3 รูปแบบรับ BigBuffer ตั้งแต่รองรับไฟล์เกิน ~2GB — ดู ADR-016)
      const sourceBig = await BigBuffer.fromBlob(sourceFile, undefined, (loaded, total) => {
        updateProgress('กำลังเตรียมไฟล์เกมต้นฉบับ...', total ? loaded / total : null);
      });

      // ขั้นตอนคำนวณแปะแพตช์เป็นการคำนวณก้อนเดียวจบในเบราว์เซอร์ ไม่มีจุดให้รายงาน %
      // ระหว่างทางได้ (ต่างจากขั้นโหลดไฟล์ที่รู้ความคืบหน้าจาก stream) จึงโชว์เป็นแถบวิ่งแทน
      updateProgress('กำลังแปะแพตช์...', null);
      await nextFrame();

      const result = applyPatch(sourceBig, patchBytes, selectedGame.patch_format);

      updateProgress('กำลังเตรียมไฟล์ให้ดาวน์โหลด...', null);
      await nextFrame();

      if (resultUrl) URL.revokeObjectURL(resultUrl);
      resultUrl = URL.createObjectURL(result.toBlob());
      resultFilename = thaiFileName(sourceName);

      hideProgress();
      sfxSuccess();
      setApplyPhase('download');
    } catch (error) {
      hideProgress();
      sfxError();
      runError.hidden = false;
      runError.textContent = `${error.message} — ถ้าติดปัญหาซ้ำๆ ช่วยแจ้งบั๊กมาได้ที่หน้าแจ้งบั๊กนะ`;
      setApplyPhase('patch');
    }
  }

  // ── แถบความคืบหน้า ────────────────────────────────────────

  function showProgress(label, ratio) {
    progressBox.hidden = false;
    updateProgress(label, ratio);
  }

  function updateProgress(label, ratio) {
    const known = typeof ratio === 'number' && Number.isFinite(ratio);
    progressBar.classList.toggle('patch-progress__bar--indeterminate', !known);
    progressFill.style.width = known ? `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%` : '';
    progressLabel.textContent = known ? `${label} ${Math.round(ratio * 100)}%` : label;
  }

  function hideProgress() {
    progressBox.hidden = true;
  }

  /**
   * อ่านไฟล์แพตช์จาก response ทีละก้อนพร้อมรายงานความคืบหน้า แทนการรอ response.arrayBuffer()
   * เฉยๆ ที่ไม่มีจุดให้รู้ % ระหว่างทางเลย — เบราว์เซอร์ที่ไม่รองรับ streaming body (หายากมาก)
   * จะได้ผลลัพธ์เหมือนเดิมแค่ไม่มี % ระหว่างทาง
   */
  async function readResponseWithProgress(response, onProgress) {
    const total = Number(response.headers.get('content-length')) || 0;

    if (!response.body) {
      const buffer = await response.arrayBuffer();
      onProgress(buffer.byteLength, total || buffer.byteLength);
      return new Uint8Array(buffer);
    }

    const reader = response.body.getReader();
    const chunks = [];
    let loaded = 0;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      onProgress(loaded, total);
    }

    const result = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result;
  }

  /** ดาวน์โหลดไฟล์ผลลัพธ์ ปิดป๊อปอัป "ไฟล์นี้ใช้ได้" แล้วเด้งป๊อปอัปคู่มือเปิดเล่นต่อทันที */
  function downloadAndShowGuide() {
    if (!resultUrl || !selectedGame) return;
    sfxTick();

    const link = document.createElement('a');
    link.href = resultUrl;
    link.download = resultFilename;
    link.click();

    showFileStatus('none');

    patchDoneTitle.textContent = selectedGame.title;
    patchDoneFilename.textContent = resultFilename;
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
  msgboxClose.addEventListener('click', () => {
    sfxCancel();
    showFileStatus('none');
  });
  msgboxZipRetry.addEventListener('click', () => {
    sfxTick();
    resetFileState();
    fileInput.click();
  });
  msgboxZipClose.addEventListener('click', () => {
    sfxCancel();
    showFileStatus('none');
  });
  msgboxOkClose.addEventListener('click', () => {
    sfxCancel();
    showFileStatus('none');
  });
  applyBtn.addEventListener('click', () => {
    if (applyBtn.dataset.phase === 'download') {
      downloadAndShowGuide();
    } else {
      runPatch();
    }
  });
  patchDoneClose.addEventListener('click', () => {
    sfxCancel();
    closePatchDoneModal();
  });
  patchDoneDoneBtn.addEventListener('click', () => {
    sfxTick();
    closePatchDoneModal();
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
