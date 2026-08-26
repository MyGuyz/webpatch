import { getSupabase, showMessage, hideMessage } from '../lib/admin-client.js';

const el = (id) => document.getElementById(id);

const signinSection = el('signin');
const workspace = el('workspace');
const signinForm = el('signin-form');
const signinBtn = el('signin-btn');
const signinMsg = el('signin-msg');
const pageMsg = el('page-msg');
const listMsg = el('list-msg');
const listBox = el('request-list');
const rowTemplate = el('request-row');

const STATUS_LABELS = {
  open: { text: 'เปิดรับโหวต', className: 'tag--wip' },
  planned: { text: 'วางแผนจะทำ', className: 'tag--beta' },
  declined: { text: 'ไม่ทำ', className: 'tag--console' },
};

const supabase = getSupabase();

if (!supabase) {
  showMessage(pageMsg, 'ยังไม่ได้ตั้งค่า Supabase — หน้านี้ยังใช้ไม่ได้');
} else {
  start();
}

async function start() {
  const { data } = await supabase.auth.getSession();
  await render(data.session);

  supabase.auth.onAuthStateChange((_event, session) => render(session));
}

async function render(session) {
  const signedIn = Boolean(session);
  signinSection.hidden = signedIn;
  workspace.hidden = !signedIn;

  if (!signedIn) return;

  el('whoami-text').textContent = `เข้าสู่ระบบเป็น ${session.user.email}`;
  await loadRequests();
}

// ── เข้า/ออกระบบ ──────────────────────────────────────────

signinForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideMessage(signinMsg);
  signinBtn.disabled = true;
  signinBtn.textContent = 'กำลังเข้าสู่ระบบ...';

  const { error } = await supabase.auth.signInWithPassword({
    email: el('email').value,
    password: el('password').value,
  });

  signinBtn.disabled = false;
  signinBtn.textContent = 'เข้าสู่ระบบ';

  if (error) {
    showMessage(signinMsg, 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
  }
});

el('signout').addEventListener('click', async () => {
  await supabase.auth.signOut();
});

// ── รายการคำขอเกม ────────────────────────────────────────

async function loadRequests() {
  hideMessage(listMsg);
  listBox.textContent = 'กำลังโหลด...';

  const { data, error } = await supabase
    .from('game_requests')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    listBox.textContent = '';
    showMessage(
      listMsg,
      error.code === '42501' || error.message.includes('row-level security')
        ? 'บัญชีนี้ยังไม่มีสิทธิ์ — ต้องเพิ่ม user id ลงตาราง admins ใน Supabase ก่อน'
        : `โหลดรายการไม่สำเร็จ: ${error.message}`
    );
    return;
  }

  listBox.textContent = '';

  if (!data || data.length === 0) {
    listBox.innerHTML = '<p class="muted">ยังไม่มีใครแนะนำเกมเลยครับ</p>';
    return;
  }

  for (const request of data) listBox.appendChild(buildRow(request));
}

function buildRow(request) {
  const node = rowTemplate.content.cloneNode(true);
  const status = STATUS_LABELS[request.status] ?? STATUS_LABELS.open;

  const statusEl = node.querySelector('[data-status]');
  statusEl.className = `tag ${status.className}`;
  statusEl.textContent = status.text;

  node.querySelector('[data-title]').textContent = request.title;

  if (request.note) {
    const note = node.querySelector('[data-note]');
    note.hidden = false;
    note.textContent = request.note;
  }

  const statusSelect = node.querySelector('[data-status-select]');
  statusSelect.value = request.status;
  statusSelect.addEventListener('change', () => updateStatus(request, statusSelect));

  const deleteBtn = node.querySelector('[data-delete]');
  deleteBtn.addEventListener('click', () => deleteRequest(request, deleteBtn));

  return node;
}

async function updateStatus(request, select) {
  select.disabled = true;
  const { error } = await supabase
    .from('game_requests')
    .update({ status: select.value })
    .eq('id', request.id);
  select.disabled = false;

  if (error) {
    showMessage(listMsg, `เปลี่ยนสถานะไม่สำเร็จ: ${error.message}`);
    select.value = request.status;
    return;
  }
  request.status = select.value;
  await loadRequests();
}

async function deleteRequest(request, button) {
  const ok = confirm(`ลบคำขอ "${request.title}" ทิ้งถาวร?`);
  if (!ok) return;

  button.disabled = true;
  button.textContent = 'กำลังลบ...';

  const { error } = await supabase.from('game_requests').delete().eq('id', request.id);

  if (error) {
    showMessage(listMsg, `ลบไม่สำเร็จ: ${error.message}`);
    button.disabled = false;
    button.textContent = 'ลบ';
    return;
  }

  await loadRequests();
}
