import { getSupabase, showMessage, hideMessage } from '../lib/admin-client.js';
import { STATUS_LABELS } from '../lib/games.js';

const el = (id) => document.getElementById(id);

/**
 * ตัวยกเลิกการติดตามสถานะล็อกอินของรอบก่อน อยู่นอก init() เพราะเว็บนี้เปลี่ยนหน้าแบบ SPA
 * ถ้าไม่ยกเลิกก่อนสมัครใหม่ทุกครั้งที่กลับมาหน้านี้ ตัวติดตามจะพอกพูนขึ้นเรื่อยๆ
 */
let unsubscribeAuth = null;

document.addEventListener('astro:page-load', init);

function init() {
  const signinSection = el('signin');
  if (!signinSection) return;

  const consoles = JSON.parse(el('admin-consoles-data')?.textContent ?? '[]');
  const consoleName = (id) => consoles.find((c) => c.id === id)?.name ?? '—';

  const workspace = el('workspace');
  const signinForm = el('signin-form');
  const signinBtn = el('signin-btn');
  const signinMsg = el('signin-msg');
  const pageMsg = el('page-msg');
  const listMsg = el('list-msg');
  const listBox = el('game-list');
  const rowTemplate = el('game-row');

  const quickUpdateModal = el('quick-update-modal');
  const quickUpdateTitle = el('quick-update-title');
  const quickUpdateForm = el('quick-update-form');
  const quickUpdateMsg = el('quick-update-msg');
  let quickUpdateGame = null;

  const supabase = getSupabase();

  unsubscribeAuth?.();
  unsubscribeAuth = null;

  if (!supabase) {
    // ไม่เปิดพื้นที่แอดมินให้เห็น เพราะกดอะไรก็ไม่ได้อยู่ดี
    // และไม่ควรโชว์เครื่องมือของแอดมินให้คนทั่วไปเห็นโดยไม่จำเป็น
    showMessage(pageMsg, 'ยังไม่ได้ตั้งค่า Supabase — หน้านี้ยังใช้ไม่ได้');
    return;
  }

  start();

  async function start() {
    const { data } = await supabase.auth.getSession();
    await render(data.session);

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => render(session));
    unsubscribeAuth = () => sub.subscription.unsubscribe();
  }

  async function render(session) {
    const signedIn = Boolean(session);
    signinSection.hidden = signedIn;
    workspace.hidden = !signedIn;

    if (!signedIn) return;

    el('whoami-text').textContent = `เข้าสู่ระบบเป็น ${session.user.email}`;
    await loadGames();
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
      // ไม่บอกว่า "ไม่มีบัญชีนี้" หรือ "รหัสผ่านผิด" แยกกัน เพราะจะกลายเป็น
      // เครื่องมือให้คนไล่เดาว่าอีเมลไหนมีบัญชีอยู่บ้าง
      showMessage(signinMsg, 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    }
  });

  el('signout').addEventListener('click', async () => {
    await supabase.auth.signOut();
  });

  // ── รายการเกม ─────────────────────────────────────────────

  async function loadGames() {
    hideMessage(listMsg);
    listBox.textContent = 'กำลังโหลด...';

    const { data, error } = await supabase
      .from('games')
      .select('*')
      .order('updated_at', { ascending: false });

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
      listBox.innerHTML = '<p class="muted">ยังไม่มีเกมในระบบ กด "เพิ่มเกมใหม่" เพื่อเริ่ม</p>';
      return;
    }

    for (const game of data) listBox.appendChild(buildRow(game));
  }

  function buildRow(game) {
    const node = rowTemplate.content.cloneNode(true);
    const status = STATUS_LABELS[game.status] ?? STATUS_LABELS.wip;

    const statusEl = node.querySelector('[data-status]');
    statusEl.className = `tag ${status.className}`;
    statusEl.textContent = status.text;

    node.querySelector('[data-console]').textContent = consoleName(game.console_id);
    node.querySelector('[data-title]').textContent = game.title;
    node.querySelector('[data-slug]').textContent = game.slug;

    const bits = [];
    if (game.patch_version) bits.push(game.patch_version);
    if (game.patch_format) bits.push(`.${game.patch_format}`);
    bits.push(game.is_published ? 'เผยแพร่แล้ว' : 'ยังไม่เผยแพร่');
    if (!game.source_sha1) bits.push('ไม่ได้ตรวจรุ่นไฟล์');
    node.querySelector('[data-meta]').textContent = bits.join(' · ');

    node.querySelector('[data-quick-update]').addEventListener('click', () => openQuickUpdate(game));

    node.querySelector('[data-edit]').addEventListener('click', () => {
      location.href = `/admin/game?id=${game.id}`;
    });

    const publishBtn = node.querySelector('[data-publish]');
    publishBtn.textContent = game.is_published ? 'ซ่อนจากเว็บ' : 'เผยแพร่';
    publishBtn.addEventListener('click', () => togglePublish(game, publishBtn));

    node
      .querySelector('[data-delete]')
      .addEventListener('click', () => removeGame(game));

    return node;
  }

  async function togglePublish(game, button) {
    button.disabled = true;
    const { error } = await supabase
      .from('games')
      .update({ is_published: !game.is_published })
      .eq('id', game.id);
    button.disabled = false;

    if (error) {
      showMessage(listMsg, `เปลี่ยนสถานะไม่สำเร็จ: ${error.message}`);
      return;
    }
    await loadGames();
  }

  async function removeGame(game) {
    // ลบแล้วกู้คืนไม่ได้ จึงให้พิมพ์ชื่อย่อยืนยัน ไม่ใช่แค่กด OK ผ่านๆ
    const typed = prompt(
      `ลบ "${game.title}" ถาวร — กู้คืนไม่ได้\n\nพิมพ์ชื่อย่อของเกมเพื่อยืนยัน:\n${game.slug}`
    );
    if (typed === null) return;

    if (typed.trim() !== game.slug) {
      showMessage(listMsg, 'ชื่อย่อไม่ตรง — ยังไม่ได้ลบอะไร');
      return;
    }

    const { error } = await supabase.from('games').delete().eq('id', game.id);
    if (error) {
      showMessage(listMsg, `ลบไม่สำเร็จ: ${error.message}`);
      return;
    }

    showMessage(listMsg, `ลบ "${game.title}" แล้ว`, 'ok');
    await loadGames();
  }

  // ── อัปเดตเวอร์ชันแพตช์แบบเร็ว ────────────────────────────
  //
  // ปกติแก้ patch_url/patch_version ต้องเปิดฟอร์มแก้เกมทั้งหน้า (มีหลายส่วนไม่เกี่ยวกัน
  // คั่นอยู่ก่อน) ทั้งที่เรื่องนี้เป็นงานที่ทำบ่อยที่สุดหลังเกมเผยแพร่ไปแล้ว —
  // ป๊อปอัปนี้เลยมีแค่ 3 ช่องที่เกี่ยวข้องจริง พร้อมเพิ่ม changelog ให้ในขั้นตอนเดียวกันเลย

  function openQuickUpdate(game) {
    quickUpdateGame = game;
    quickUpdateTitle.textContent = `${game.title} — ตอนนี้ ${game.patch_version ?? 'ยังไม่มีเวอร์ชัน'}`;
    quickUpdateForm.elements.patch_url.value = game.patch_url ?? '';
    quickUpdateForm.elements.patch_version.value = game.patch_version ?? '';
    quickUpdateForm.elements.changelog_body.value = '';
    hideMessage(quickUpdateMsg);
    quickUpdateModal.classList.add('open');
  }

  function closeQuickUpdate() {
    quickUpdateModal.classList.remove('open');
    quickUpdateGame = null;
  }

  el('quick-update-close').addEventListener('click', closeQuickUpdate);

  quickUpdateForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!quickUpdateGame) return;
    hideMessage(quickUpdateMsg);

    const values = Object.fromEntries(new FormData(quickUpdateForm));
    const patchUrl = values.patch_url.trim();
    const patchVersion = values.patch_version.trim();
    const changelogBody = values.changelog_body.trim();

    if (!patchUrl || !patchVersion) {
      showMessage(quickUpdateMsg, 'ต้องกรอกลิงก์ไฟล์แพตช์และเวอร์ชัน');
      return;
    }

    const saveBtn = el('quick-update-save');
    saveBtn.disabled = true;

    const today = new Date().toISOString().slice(0, 10);

    const { error: gameError } = await supabase
      .from('games')
      .update({ patch_url: patchUrl, patch_version: patchVersion, patch_updated_at: today })
      .eq('id', quickUpdateGame.id);

    if (gameError) {
      saveBtn.disabled = false;
      showMessage(quickUpdateMsg, `บันทึกไม่สำเร็จ: ${gameError.message}`);
      return;
    }

    if (changelogBody) {
      const { error: changelogError } = await supabase
        .from('changelogs')
        .insert({ game_id: quickUpdateGame.id, version: patchVersion, body: changelogBody, released_at: today });

      if (changelogError) {
        saveBtn.disabled = false;
        // ตัวเกมอัปเดตสำเร็จไปแล้ว แค่ changelog ที่พลาด บอกให้ชัดว่าไม่ใช่ทั้งก้อนล้มเหลว
        showMessage(quickUpdateMsg, `อัปเดตแพตช์สำเร็จ แต่เพิ่ม changelog ไม่สำเร็จ: ${changelogError.message}`);
        return;
      }
    }

    saveBtn.disabled = false;
    closeQuickUpdate();
    showMessage(listMsg, `อัปเดต "${quickUpdateGame.title}" เป็น ${patchVersion} แล้ว`, 'ok');
    await loadGames();
  });

  el('add-btn').addEventListener('click', () => {
    location.href = '/admin/game';
  });
}
