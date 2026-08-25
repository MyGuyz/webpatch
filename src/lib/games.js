import { createClient } from '@supabase/supabase-js';
import { SEED_GAMES, SEED_CONSOLES, SEED_ANNOUNCEMENT } from './seed-games.js';

/**
 * ชั้นข้อมูลของเว็บ
 *
 * ถ้ายังไม่ได้ตั้งค่า Supabase จะใช้ข้อมูลตัวอย่างแทน เพื่อให้เว็บรันดูได้เลย
 * ตอนพัฒนาโดยไม่ต้องรอสมัครบัญชีให้เสร็จก่อน
 */

/**
 * Cloudflare มีช่องใส่ตัวแปร 2 ที่ คือตอน build กับตอนเว็บทำงาน (runtime)
 * และช่อง runtime หาเจอง่ายกว่ามาก คนจึงใส่ผิดช่องกันบ่อย
 *
 * เดิมโค้ดอ่านแค่ช่อง build ทำให้ถ้าใส่ผิดช่องเว็บจะขึ้นโหมดตัวอย่างตลอดไป
 * ตอนนี้อ่านทั้งสองที่ ใส่ช่องไหนก็ใช้ได้
 */
let runtimeEnv = null;
try {
  ({ env: runtimeEnv } = await import('cloudflare:workers'));
} catch {
  // ไม่ได้รันบน Cloudflare (เช่นตอนรัน unit test ด้วย node ตรงๆ) — ใช้ค่าจากตอน build แทน
}

let client = null;

function getClient() {
  const url = runtimeEnv?.PUBLIC_SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL;
  const key = runtimeEnv?.PUBLIC_SUPABASE_ANON_KEY || import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

  // ใส่มาแค่ตัวเดียวแปลว่าตั้งใจจะเชื่อมแต่ทำไม่ครบ
  // ถ้าปล่อยให้ตกไปใช้ข้อมูลตัวอย่างเงียบๆ จะหาสาเหตุไม่เจอเลย จึงต้องดังไว้ก่อน
  if (Boolean(url) !== Boolean(key)) {
    throw new Error(
      'ตั้งค่า Supabase ไม่ครบ — ต้องใส่ทั้ง PUBLIC_SUPABASE_URL และ PUBLIC_SUPABASE_ANON_KEY ' +
        `(ตอนนี้ขาด ${url ? 'PUBLIC_SUPABASE_ANON_KEY' : 'PUBLIC_SUPABASE_URL'})`
    );
  }

  if (!url || !key) return null;
  if (!client) client = createClient(url, key);
  return client;
}

export function isUsingSeedData() {
  return getClient() === null;
}

const GAME_FIELDS = `
  id, slug, title, subtitle, status, cover_url, description,
  patch_version, patch_format, patch_url, patch_updated_at,
  source_spec, source_sha1, progress_stage, progress_percent, download_count,
  console:consoles ( id, name, slug, sort_order )
`;

export async function getPublishedGames() {
  const supabase = getClient();
  if (!supabase) return SEED_GAMES;

  const { data, error } = await supabase
    .from('games')
    .select(GAME_FIELDS)
    .eq('is_published', true)
    .order('patch_updated_at', { ascending: false, nullsFirst: false });

  if (error) throw new Error(`อ่านรายการเกมไม่สำเร็จ: ${error.message}`);
  return data ?? [];
}

export async function getReadyGames() {
  const games = await getPublishedGames();
  return games.filter((game) => game.status === 'ready' || game.status === 'beta');
}

/**
 * เวอร์ชันแพตช์ที่เลือกได้ต่อเกม สำหรับฟอร์มแจ้งบั๊ก
 *
 * ยังไม่มีหน้า Admin ให้กรอก changelog เลย ตารางจึงมักว่างเปล่า
 * จึงรวม patch_version ปัจจุบันของเกมเข้าไปด้วยเสมอ กันเวอร์ชันไม่มีให้เลือก
 */
export async function getVersionsByGame(games) {
  const ids = games.map((g) => g.id);
  const byGame = Object.fromEntries(
    games.map((g) => [g.id, new Set(g.patch_version ? [g.patch_version] : [])])
  );

  const supabase = getClient();
  if (supabase && ids.length > 0) {
    const { data, error } = await supabase
      .from('changelogs')
      .select('game_id, version')
      .in('game_id', ids)
      .order('released_at', { ascending: false });

    if (error) throw new Error(`อ่านเวอร์ชันแพตช์ไม่สำเร็จ: ${error.message}`);
    for (const row of data ?? []) byGame[row.game_id]?.add(row.version);
  }

  return Object.fromEntries(Object.entries(byGame).map(([id, set]) => [id, [...set]]));
}

export async function getGameById(id) {
  const games = await getPublishedGames();
  return games.find((game) => String(game.id) === String(id)) ?? null;
}

export async function getConsoles() {
  const supabase = getClient();
  if (!supabase) return SEED_CONSOLES;

  const { data, error } = await supabase
    .from('consoles')
    .select('id, name, slug, sort_order')
    .order('sort_order');

  if (error) throw new Error(`อ่านรายการเครื่องเล่นไม่สำเร็จ: ${error.message}`);
  return data ?? [];
}

export async function getActiveAnnouncement() {
  const supabase = getClient();
  if (!supabase) return SEED_ANNOUNCEMENT;

  const { data, error } = await supabase
    .from('announcements')
    .select('body')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`อ่านประกาศไม่สำเร็จ: ${error.message}`);
  return data;
}

/** ป้ายสถานะที่ผู้ใช้เห็น — เก็บไว้ที่เดียวเพื่อไม่ให้แต่ละหน้าเขียนคำไม่ตรงกัน */
export const STATUS_LABELS = {
  ready: { text: 'พร้อมให้ Patch', className: 'tag--ready' },
  beta: { text: 'BETA', className: 'tag--beta' },
  wip: { text: 'กำลังทำอยู่', className: 'tag--wip' },
};

export const PROGRESS_STAGES = [
  'แกะรอม',
  'ดึงคำแปล',
  'แปลแล้ว',
  'ฝังคำแปล',
  'ตรวจสอบบัค',
];
