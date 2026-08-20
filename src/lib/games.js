import { createClient } from '@supabase/supabase-js';
import { SEED_GAMES, SEED_CONSOLES, SEED_ANNOUNCEMENT } from './seed-games.js';

/**
 * ชั้นข้อมูลของเว็บ
 *
 * ถ้ายังไม่ได้ตั้งค่า Supabase จะใช้ข้อมูลตัวอย่างแทน เพื่อให้เว็บรันดูได้เลย
 * ตอนพัฒนาโดยไม่ต้องรอสมัครบัญชีให้เสร็จก่อน
 */

let client = null;

function getClient() {
  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

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
  source_spec, source_sha1, progress_stage, progress_percent,
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
