/**
 * ตัวกรองคลังเกม — ค้นหา / เลือกเครื่องเล่น / เรียงลำดับ
 *
 * เป็นฟังก์ชันล้วนไม่แตะ DOM เพราะใช้สองที่: ตอนเซิร์ฟเวอร์เรนเดอร์หน้า (ลิงก์ที่แชร์มา
 * อย่าง /?console=ps1 ต้องขึ้นผลที่กรองแล้วตั้งแต่แรก) และในเบราว์เซอร์ตอนผู้ใช้พิมพ์/กดปุ่ม
 * ทั้งสองที่ต้องได้ผลตรงกัน ไม่งั้นการ์ดจะกระพริบสลับลำดับตอนสคริปต์เริ่มทำงาน
 *
 * กรองในเครื่องผู้ใช้ทั้งหมด ไม่ถาม Supabase เพิ่ม — เกมไม่ถึงร้อยเกม ส่งมาทีเดียวกับหน้าเว็บได้สบาย
 */

export const SORTS = {
  latest: 'อัปเดตล่าสุด',
  popular: 'ยอดนิยม',
  title: 'ชื่อเกม A–Z',
};

export const DEFAULT_SORT = 'latest';

/** เกมที่อัปเดตแพตช์ภายในกี่วันถึงติดป้าย NEW */
export const NEW_DAYS = 30;

function normalize(text) {
  return String(text ?? '').toLocaleLowerCase('th').replace(/\s+/g, ' ').trim();
}

/** ข้อความที่ใช้ค้นของเกมหนึ่งเกม — ชื่อ ชื่อรอง และชื่อเครื่อง (พิมพ์ "ps2" หรือ "playstation" ก็เจอ) */
export function searchText(game) {
  return normalize(
    [game.title, game.subtitle, game.console?.name, game.console?.slug].filter(Boolean).join(' ')
  );
}

/**
 * อ่านตัวกรองจาก URL — ค่าแปลกๆ (sort ที่ไม่มีจริง) ตกกลับไปค่าตั้งต้นเงียบๆ
 * เพราะลิงก์อาจถูกพิมพ์เองหรือถูกตัดทอนตอนแชร์ใน Facebook
 */
export function readFilters(searchParams) {
  const sort = searchParams.get('sort');
  return {
    q: searchParams.get('q')?.trim() ?? '',
    console: searchParams.get('console')?.trim() ?? '',
    sort: sort && sort in SORTS ? sort : DEFAULT_SORT,
  };
}

/** ใส่ตัวกรองกลับลง URL — ค่าตั้งต้นไม่ต้องใส่ ลิงก์จะได้สั้นและสะอาด */
export function writeFilters(url, { q, console, sort }) {
  const next = new URL(url);
  const set = (key, value) => (value ? next.searchParams.set(key, value) : next.searchParams.delete(key));
  set('q', q?.trim());
  set('console', console);
  set('sort', sort === DEFAULT_SORT ? '' : sort);
  return next;
}

export function matchesGame(game, { q = '', console = '' } = {}) {
  if (console && game.console?.slug !== console) return false;
  const words = normalize(q).split(' ').filter(Boolean);
  if (words.length === 0) return true;
  const haystack = searchText(game);
  return words.every((word) => haystack.includes(word));
}

export function filterGames(games, filters) {
  return games.filter((game) => matchesGame(game, filters));
}

function byLatest(a, b) {
  // เกมที่ยังไม่มีวันอัปเดต (มักเป็นเกม WIP) ไปอยู่ท้ายเสมอ
  const ta = a.patch_updated_at ?? '';
  const tb = b.patch_updated_at ?? '';
  if (ta === tb) return 0;
  if (!ta) return 1;
  if (!tb) return -1;
  return ta < tb ? 1 : -1;
}

const COMPARE = {
  latest: byLatest,
  popular: (a, b) => (b.download_count ?? 0) - (a.download_count ?? 0) || byLatest(a, b),
  title: (a, b) => String(a.title).localeCompare(String(b.title), 'th'),
};

/** เรียงลำดับแบบไม่แก้ array เดิม */
export function sortGames(games, sort = DEFAULT_SORT) {
  return [...games].sort(COMPARE[sort] ?? COMPARE[DEFAULT_SORT]);
}

/** แพตช์อัปเดตภายใน NEW_DAYS วันที่ผ่านมา (patch_updated_at เป็นวันที่ YYYY-MM-DD) */
export function isNew(game, now = new Date()) {
  if (!game.patch_updated_at || game.status === 'wip') return false;
  const updated = new Date(`${game.patch_updated_at}T00:00:00Z`);
  if (Number.isNaN(updated.getTime())) return false;
  const days = (now.getTime() - updated.getTime()) / 86_400_000;
  return days >= 0 && days <= NEW_DAYS;
}
