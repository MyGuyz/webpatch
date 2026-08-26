import { getSupabase, showMessage, hideMessage } from '../lib/admin-client.js';

const el = (id) => document.getElementById(id);

const msg = el('requests-msg');
const list = el('requests-list');
const suggestForm = el('suggest-form');

const supabase = getSupabase();

if (supabase) {
  loadRequests();
}

async function loadRequests() {
  const { data, error } = await supabase
    .from('game_requests')
    .select('id, title, note')
    .order('created_at', { ascending: true });

  if (error) {
    showMessage(msg, `โหลดรายการไม่สำเร็จ: ${error.message}`);
    return;
  }

  list.innerHTML = '';
  if (!data || data.length === 0) {
    list.innerHTML = '<p class="muted">ยังไม่มีใครแนะนำเกมเลย เป็นคนแรกได้เลยครับ</p>';
    return;
  }

  for (const item of data) list.appendChild(buildRow(item));
}

function buildRow(item) {
  const row = document.createElement('article');
  row.className = 'cart';

  const body = document.createElement('div');
  body.className = 'cart__body';

  const title = document.createElement('h3');
  title.className = 'request-row__title';
  title.textContent = item.title;
  body.appendChild(title);

  if (item.note) {
    const note = document.createElement('p');
    note.className = 'muted request-row__note';
    note.textContent = item.note;
    body.appendChild(note);
  }

  row.appendChild(body);
  return row;
}

// ── แนะนำเกมใหม่ ──────────────────────────────────────────

if (suggestForm) {
  suggestForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideMessage(msg);

    // กับดักสแปมแบบเดียวกับฟอร์มแจ้งบั๊ก
    if (suggestForm.elements.note_extra.value.trim() !== '') {
      suggestForm.reset();
      showMessage(msg, 'ส่งคำแนะนำแล้ว ขอบคุณครับ', 'ok');
      return;
    }

    const title = suggestForm.elements.title.value.trim();
    if (!title) return;

    const submitBtn = el('suggest-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'กำลังส่ง...';

    const { error } = await supabase.from('game_requests').insert({
      title,
      note: suggestForm.elements.note.value.trim() || null,
    });

    submitBtn.disabled = false;
    submitBtn.textContent = '+ แนะนำเกมนี้';

    if (error) {
      showMessage(msg, `แนะนำไม่สำเร็จ: ${error.message}`);
      return;
    }

    suggestForm.reset();
    showMessage(msg, 'แนะนำเกมแล้ว ขอบคุณครับ 🙏', 'ok');
    await loadRequests();
  });
}
