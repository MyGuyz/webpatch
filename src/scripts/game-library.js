import { readFilters, writeFilters, matchesGame, sortGames, DEFAULT_SORT } from '../lib/game-filter.js';

/**
 * คลังเกมหน้าแรก — กรอง/เรียงการ์ดในเครื่องผู้ใช้ทันทีที่พิมพ์หรือกดปุ่ม
 *
 * เซิร์ฟเวอร์เรนเดอร์การ์ดครบทุกใบไว้แล้ว (ตามตัวกรองในลิงก์) สคริปต์นี้แค่ซ่อน/สลับลำดับ
 * แล้วเขียนตัวกรองกลับลง URL ด้วย replaceState ให้กดย้อนกลับจากหน้าแปะแล้วยังเห็นผลเดิม
 * และคัดลอกลิงก์ไปแชร์ต่อได้
 */
document.addEventListener('astro:page-load', init);

function init() {
  const root = document.querySelector('[data-filters]');
  const dataEl = document.getElementById('library-data');
  if (!root || !dataEl) return; // ไม่ใช่หน้าแรก หรือยังไม่มีเกม

  const games = JSON.parse(dataEl.textContent ?? '[]');
  const byId = new Map(games.map((g) => [String(g.id), g]));

  const qInput = root.querySelector('[data-filter-q]');
  const chips = [...root.querySelectorAll('[data-filter-console]')];
  const sortSelect = root.querySelector('[data-filter-sort]');
  const grids = [...document.querySelectorAll('[data-library-grid]')];
  const wipSection = document.querySelector('[data-library-section="wip"]');
  const empty = document.querySelector('[data-library-empty]');
  const count = document.querySelector('[data-library-count]');

  const state = readFilters(new URL(location.href).searchParams);

  function render() {
    for (const chip of chips) {
      chip.setAttribute('aria-pressed', String(chip.dataset.filterConsole === state.console));
    }

    let readyTotal = 0;
    let readyShown = 0;
    let wipShown = 0;

    for (const grid of grids) {
      const cells = [...grid.querySelectorAll(':scope > [data-game-id]')];
      const order = sortGames(
        cells.map((cell) => byId.get(cell.dataset.gameId)).filter(Boolean),
        state.sort
      ).map((g) => String(g.id));
      cells.sort((a, b) => order.indexOf(a.dataset.gameId) - order.indexOf(b.dataset.gameId));

      for (const cell of cells) {
        const show = matchesGame(byId.get(cell.dataset.gameId), state);
        cell.hidden = !show;
        grid.appendChild(cell); // appendChild ของที่มีอยู่แล้ว = ย้ายไปท้าย ได้ลำดับใหม่ตาม order
        if (grid.dataset.libraryGrid === 'ready') {
          readyTotal += 1;
          if (show) readyShown += 1;
        } else if (show) {
          wipShown += 1;
        }
      }
    }

    if (wipSection) wipSection.hidden = wipShown === 0;
    if (empty) empty.hidden = readyTotal === 0 || readyShown > 0;
    if (count) {
      count.textContent =
        readyShown === readyTotal ? `${readyTotal} เกม` : `พบ ${readyShown} จาก ${readyTotal} เกม`;
    }

    history.replaceState(history.state, '', writeFilters(location.href, state));
  }

  qInput?.addEventListener('input', () => {
    state.q = qInput.value;
    render();
  });

  for (const chip of chips) {
    chip.addEventListener('click', () => {
      state.console = chip.dataset.filterConsole ?? '';
      render();
    });
  }

  sortSelect?.addEventListener('change', () => {
    state.sort = sortSelect.value;
    render();
  });

  document.querySelector('[data-filter-clear]')?.addEventListener('click', () => {
    state.q = '';
    state.console = '';
    state.sort = DEFAULT_SORT;
    if (qInput) qInput.value = '';
    if (sortSelect) sortSelect.value = DEFAULT_SORT;
    render();
    qInput?.focus();
  });

  // เบราว์เซอร์บางตัวเติมค่าช่องค้นหาเดิมกลับมาเองตอนกดย้อนกลับ — ให้ยึดตามช่องค้นหาจริง
  if (qInput && qInput.value !== state.q) {
    state.q = qInput.value;
    render();
  }
}
