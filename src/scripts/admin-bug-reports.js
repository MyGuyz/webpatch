import { getSupabase, showMessage, hideMessage } from '../lib/admin-client.js';

const el = (id) => document.getElementById(id);

const signinSection = el('signin');
const workspace = el('workspace');
const signinForm = el('signin-form');
const signinBtn = el('signin-btn');
const signinMsg = el('signin-msg');
const pageMsg = el('page-msg');
const listMsg = el('list-msg');
const listBox = el('report-list');
const rowTemplate = el('report-row');

const STATUS_LABELS = {
  new: { text: 'ใหม่', className: 'tag--wip' },
  triaged: { text: 'รับเรื่องแล้ว', className: 'tag--beta' },
  fixed: { text: 'แก้แล้ว', className: 'tag--ready' },
  wontfix: { text: 'จะไม่แก้', className: 'tag--console' },
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
  await loadReports();
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

// ── รายการรายงานบั๊ก ──────────────────────────────────────

async function loadReports() {
  hideMessage(listMsg);
  listBox.textContent = 'กำลังโหลด...';

  const { data, error } = await supabase
    .from('bug_reports')
    .select('*, game:games(title)')
    .order('created_at', { ascending: false });

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

  if (data.length === 0) {
    listBox.innerHTML = '<p class="muted">ยังไม่มีรายงานบั๊กเข้ามาครับ</p>';
    return;
  }

  for (const report of data) listBox.appendChild(buildRow(report));
}

function buildRow(report) {
  const node = rowTemplate.content.cloneNode(true);
  const status = STATUS_LABELS[report.status] ?? STATUS_LABELS.new;

  const statusEl = node.querySelector('[data-status]');
  statusEl.className = `tag ${status.className}`;
  statusEl.textContent = status.text;

  node.querySelector('[data-date]').textContent = new Date(report.created_at).toLocaleString('th-TH');
  node.querySelector('[data-title]').textContent = report.game?.title ?? 'ไม่ระบุเกม (ถูกลบไปแล้ว)';

  const meta = [];
  if (report.patch_version) meta.push(`เวอร์ชัน ${report.patch_version}`);
  if (report.where_in_game) meta.push(`จุดที่เจอ: ${report.where_in_game}`);
  if (report.emulator) meta.push(`โปรแกรมจำลอง: ${report.emulator}`);
  node.querySelector('[data-meta]').textContent = meta.join(' · ');

  node.querySelector('[data-desc]').textContent = report.description;

  if (report.wrong_text) {
    const extra = node.querySelector('[data-extra]');
    extra.hidden = false;
    extra.textContent = `ข้อความที่แปลผิด: ${report.wrong_text}`;
  }

  if (report.contact) {
    const contact = node.querySelector('[data-contact]');
    contact.hidden = false;
    contact.textContent = `ติดต่อกลับได้ที่: ${report.contact}`;
  }

  const mediaBox = node.querySelector('[data-media]');
  for (const path of report.media_paths ?? []) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--ghost btn--small';
    btn.textContent = `📎 ${path.split('/').pop()}`;
    btn.addEventListener('click', () => openAttachment(path, btn));
    mediaBox.appendChild(btn);
  }

  const statusSelect = node.querySelector('[data-status-select]');
  statusSelect.value = report.status;
  statusSelect.addEventListener('change', () => updateStatus(report, statusSelect));

  return node;
}

async function openAttachment(path, button) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'กำลังเปิด...';

  const { data, error } = await supabase.storage.from('bug-reports').createSignedUrl(path, 60);

  button.disabled = false;
  button.textContent = original;

  if (error) {
    showMessage(listMsg, `เปิดไฟล์แนบไม่สำเร็จ: ${error.message}`);
    return;
  }

  window.open(data.signedUrl, '_blank', 'noopener');
}

async function updateStatus(report, select) {
  select.disabled = true;
  const { error } = await supabase
    .from('bug_reports')
    .update({ status: select.value })
    .eq('id', report.id);
  select.disabled = false;

  if (error) {
    showMessage(listMsg, `เปลี่ยนสถานะไม่สำเร็จ: ${error.message}`);
    select.value = report.status;
    return;
  }
  report.status = select.value;
}
