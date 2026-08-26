import { getSupabase, showMessage, hideMessage } from '../lib/admin-client.js';

const el = (id) => document.getElementById(id);

const msg = el('requests-msg');
const list = el('requests-list');
const suggestForm = el('suggest-form');

const supabase = getSupabase();

/** จำไว้ในเครื่องว่าเคยกดโหวตอันไหนไปแล้ว เอาไว้ปิดปุ่มไม่ให้กดซ้ำ (เซิร์ฟเวอร์กันจริงอีกชั้นอยู่แล้ว) */
const votedIds = new Set(JSON.parse(localStorage.getItem('votedGameRequests') ?? '[]'));

if (supabase) {
  loadRequests();
}

async function loadRequests() {
  const { data, error } = await supabase
    .from('game_requests')
    .select('id, title, note, vote_count')
    .order('vote_count', { ascending: false })
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
  body.className = 'cart__body request-row';

  const text = document.createElement('div');
  const title = document.createElement('h3');
  title.className = 'request-row__title';
  title.textContent = item.title;
  text.appendChild(title);
  if (item.note) {
    const note = document.createElement('p');
    note.className = 'muted request-row__note';
    note.textContent = item.note;
    text.appendChild(note);
  }

  const voteBtn = document.createElement('button');
  voteBtn.type = 'button';
  voteBtn.className = 'vote-btn';
  const alreadyVoted = votedIds.has(item.id);
  voteBtn.disabled = alreadyVoted;
  voteBtn.innerHTML = `<span class="vote-btn__count">${alreadyVoted ? '✓' : '▲'} ${item.vote_count}</span><span class="vote-btn__label">โหวต</span>`;
  voteBtn.addEventListener('click', () => vote(item.id, voteBtn));

  body.append(text, voteBtn);
  row.appendChild(body);
  return row;
}

async function vote(requestId, button) {
  button.disabled = true;

  try {
    const response = await fetch('/api/vote-game-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: requestId }),
    });
    const result = await response.json();

    if (!result.ok) {
      if (!result.alreadyVoted) {
        showMessage(msg, result.message ?? 'โหวตไม่สำเร็จ ลองใหม่อีกครั้ง');
        button.disabled = false;
        return;
      }
    }

    votedIds.add(requestId);
    localStorage.setItem('votedGameRequests', JSON.stringify([...votedIds]));
    await loadRequests();
  } catch {
    showMessage(msg, 'โหวตไม่สำเร็จ เช็คอินเทอร์เน็ตแล้วลองใหม่');
    button.disabled = false;
  }
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
