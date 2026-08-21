import { getSupabase, showMessage, hideMessage } from '../lib/admin-client.js';
import { buildGamePayload, explainSaveError } from '../lib/game-form.js';

const form = document.getElementById('game-form');
const msg = document.getElementById('msg');
const saveBtn = document.getElementById('save');
const pageHead = document.getElementById('page-head');

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
