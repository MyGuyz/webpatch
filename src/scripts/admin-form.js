import { getSupabase, showMessage, hideMessage } from '../lib/admin-client.js';
import { buildGamePayload, explainSaveError } from '../lib/game-form.js';

const form = document.getElementById('game-form');
const msg = document.getElementById('msg');
const saveBtn = document.getElementById('save');
const pageHead = document.getElementById('page-head');

const changelogSection = document.getElementById('changelog-section');
const changelogList = document.getElementById('changelog-list');
const changelogForm = document.getElementById('changelog-form');
const changelogMsg = document.getElementById('changelog-msg');

const gameId = new URLSearchParams(location.search).get('id');
const supabase = getSupabase();

if (!supabase) {
  showMessage(msg, 'ยังไม่ได้ตั้งค่า Supabase — หน้านี้ยังใช้ไม่ได้');
} else {
  start();
}

async function start() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    showMessage(msg, 'ต้องเข้าสู่ระบบก่อน กำลังพากลับไปหน้าเข้าสู่ระบบ...');
    setTimeout(() => location.replace('/admin'), 1500);
    return;
  }

  if (gameId) {
    pageHead.textContent = 'แก้ข้อมูลเกม';
    const loaded = await loadGame();
    if (!loaded) return;
    changelogSection.hidden = false;
    await loadChangelogs();
  }

  form.hidden = false;
}

async function loadGame() {
  const { data, error } = await supabase.from('games').select('*').eq('id', gameId).maybeSingle();

  if (error) {
    showMessage(msg, `โหลดข้อมูลเกมไม่สำเร็จ: ${error.message}`);
    return false;
  }
  if (!data) {
    showMessage(msg, 'ไม่พบเกมนี้ — อาจถูกลบไปแล้ว');
    return false;
  }

  for (const [name, value] of Object.entries(data)) {
    const field = form.elements[name];
    if (!field) continue;
    if (field.type === 'checkbox') field.checked = Boolean(value);
    else field.value = value ?? '';
  }
  return true;
}

// ── บันทึก ────────────────────────────────────────────────

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideMessage(msg);
  clearFieldErrors();

  const values = Object.fromEntries(new FormData(form));
  values.is_published = form.elements.is_published.checked;

  const result = buildGamePayload(values);
  if (!result.ok) {
    showFieldErrors(result.errors);
    showMessage(msg, 'ยังกรอกไม่ครบ — ดูข้อความสีแดงใต้ช่องที่มีปัญหา');
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = 'กำลังบันทึก...';

  const { error } = gameId
    ? await supabase.from('games').update(result.payload).eq('id', gameId)
    : await supabase.from('games').insert(result.payload);

  saveBtn.disabled = false;
  saveBtn.textContent = 'บันทึก';

  if (error) {
    showMessage(msg, explainSaveError(error));
    return;
  }

  location.href = '/admin';
});

// ── ประวัติการอัปเดต ──────────────────────────────────────

async function loadChangelogs() {
  const { data, error } = await supabase
    .from('changelogs')
    .select('id, version, body, released_at')
    .eq('game_id', gameId)
    .order('released_at', { ascending: false });

  if (error) {
    showMessage(changelogMsg, `โหลดประวัติไม่สำเร็จ: ${error.message}`);
    return;
  }

  changelogList.innerHTML = '';
  if (!data || data.length === 0) {
    changelogList.innerHTML = '<p class="muted">ยังไม่มีประวัติการอัปเดต</p>';
    return;
  }

  for (const entry of data) {
    const row = document.createElement('div');
    row.className = 'changelog-entry';

    const text = document.createElement('div');
    const head = document.createElement('p');
    head.className = 'changelog-entry__head';
    head.textContent = entry.released_at ? `${entry.version} · ${entry.released_at}` : entry.version;
    const body = document.createElement('p');
    body.className = 'changelog-entry__body';
    body.textContent = entry.body;
    text.append(head, body);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn btn--ghost btn--small btn--danger';
    deleteBtn.textContent = 'ลบ';
    deleteBtn.addEventListener('click', () => deleteChangelog(entry.id));

    row.append(text, deleteBtn);
    changelogList.appendChild(row);
  }
}

async function deleteChangelog(id) {
  if (!confirm('ลบรายการนี้ทิ้ง?')) return;

  const { error } = await supabase.from('changelogs').delete().eq('id', id);
  if (error) {
    showMessage(changelogMsg, `ลบไม่สำเร็จ: ${error.message}`);
    return;
  }
  await loadChangelogs();
}

changelogForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideMessage(changelogMsg);

  const values = Object.fromEntries(new FormData(changelogForm));
  const payload = {
    game_id: Number(gameId),
    version: values.version.trim(),
    body: values.body.trim(),
  };
  if (values.released_at) payload.released_at = values.released_at;

  if (!payload.version || !payload.body) {
    showMessage(changelogMsg, 'ต้องกรอกเวอร์ชันและรายละเอียด');
    return;
  }

  const { error } = await supabase.from('changelogs').insert(payload);
  if (error) {
    showMessage(changelogMsg, `เพิ่มไม่สำเร็จ: ${error.message}`);
    return;
  }

  changelogForm.reset();
  await loadChangelogs();
});

function clearFieldErrors() {
  for (const el of form.querySelectorAll('[data-err]')) el.textContent = '';
}

function showFieldErrors(errors) {
  for (const [field, text] of Object.entries(errors)) {
    const el = form.querySelector(`[data-err="${field}"]`);
    if (el) el.textContent = text;
  }

  // พาไปที่ช่องแรกที่มีปัญหา ไม่ให้ผู้ใช้ต้องไล่หาเองว่าแดงตรงไหน
  const first = form.querySelector('.err:not(:empty)');
  first?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
