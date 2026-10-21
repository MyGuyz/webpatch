import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { filterGames, sortGames, isNew, readFilters, writeFilters } from './game-filter.js';

const ps2 = { id: 6, name: 'PlayStation 2', slug: 'ps2' };
const gba = { id: 2, name: 'Game Boy Advance', slug: 'gba' };

const games = [
  { id: 1, title: 'Resident Evil 4', status: 'ready', console: ps2, patch_updated_at: '2026-09-12', download_count: 1269 },
  { id: 2, title: 'The Legend of Zelda: The Minish Cap', status: 'ready', console: gba, patch_updated_at: '2026-10-10', download_count: 44 },
  { id: 3, title: 'Onimusha: Warlords', subtitle: 'โอนิมูฉะ', status: 'ready', console: ps2, patch_updated_at: '2026-10-03', download_count: 234 },
  { id: 4, title: 'Advance Wars', status: 'wip', console: gba, patch_updated_at: null, download_count: 0 },
];

const ids = (list) => list.map((g) => g.id);

describe('ค้นหาเกม', () => {
  test('ไม่ใส่ตัวกรองได้ทุกเกม', () => {
    assert.deepEqual(ids(filterGames(games, {})), [1, 2, 3, 4]);
  });

  test('ค้นชื่อไม่สนตัวพิมพ์เล็กใหญ่ และหลายคำต้องเจอครบทุกคำ', () => {
    assert.deepEqual(ids(filterGames(games, { q: 'ZELDA' })), [2]);
    assert.deepEqual(ids(filterGames(games, { q: 'minish zelda' })), [2]);
    assert.deepEqual(ids(filterGames(games, { q: 'zelda wars' })), []);
  });

  test('ค้นเจอจากชื่อรองภาษาไทยและชื่อเครื่อง', () => {
    assert.deepEqual(ids(filterGames(games, { q: 'โอนิ' })), [3]);
    assert.deepEqual(ids(filterGames(games, { q: 'playstation' })), [1, 3]);
  });

  test('กรองตามเครื่องเล่นด้วย slug', () => {
    assert.deepEqual(ids(filterGames(games, { console: 'gba' })), [2, 4]);
    assert.deepEqual(ids(filterGames(games, { console: 'gba', q: 'zelda' })), [2]);
  });
});

describe('เรียงลำดับ', () => {
  test('อัปเดตล่าสุดก่อน เกมที่ไม่มีวันที่อยู่ท้าย', () => {
    assert.deepEqual(ids(sortGames(games, 'latest')), [2, 3, 1, 4]);
  });

  test('ยอดนิยม = แปะเยอะสุดก่อน', () => {
    assert.deepEqual(ids(sortGames(games, 'popular')), [1, 3, 2, 4]);
  });

  test('ชื่อ A–Z', () => {
    assert.deepEqual(ids(sortGames(games, 'title')), [4, 3, 1, 2]);
  });

  test('ค่าแปลกๆ ใช้ค่าตั้งต้น และไม่แก้ array เดิม', () => {
    const before = ids(games);
    assert.deepEqual(ids(sortGames(games, 'hack')), [2, 3, 1, 4]);
    assert.deepEqual(ids(games), before);
  });
});

describe('ป้าย NEW', () => {
  const now = new Date('2026-10-21T12:00:00Z');

  test('อัปเดตภายใน 30 วันได้ป้าย เก่ากว่านั้นไม่ได้', () => {
    assert.equal(isNew(games[1], now), true);
    assert.equal(isNew({ ...games[0], patch_updated_at: '2026-09-20' }, now), false);
  });

  test('เกม WIP หรือไม่มีวันที่ ไม่ได้ป้าย', () => {
    assert.equal(isNew(games[3], now), false);
    assert.equal(isNew({ ...games[3], patch_updated_at: '2026-10-20' }, now), false);
  });
});

describe('ตัวกรองใน URL', () => {
  test('อ่านค่าจาก URL และ sort ที่ไม่มีจริงกลับเป็นค่าตั้งต้น', () => {
    const params = new URL('https://maepaew.com/?q=%20zelda%20&console=gba&sort=hack').searchParams;
    assert.deepEqual(readFilters(params), { q: 'zelda', console: 'gba', sort: 'latest' });
  });

  test('ค่าตั้งต้นไม่ถูกใส่ลงลิงก์', () => {
    const url = writeFilters('https://maepaew.com/?q=old', { q: '', console: 'ps2', sort: 'latest' });
    assert.equal(url.search, '?console=ps2');
  });
});
