import { SUPPORTED_FORMATS } from '../patcher/index.js';
import { isAllowedPatchHost } from './allowed-hosts.js';

/**
 * ตรวจและแปลงค่าที่กรอกในฟอร์มให้เป็นข้อมูลพร้อมบันทึก
 *
 * แยกออกมาจากหน้าเว็บเพราะเป็นส่วนที่พลาดแล้วข้อมูลเสียโดยไม่รู้ตัว
 * และเป็นส่วนเดียวในหน้า Admin ที่มีตรรกะพอจะทดสอบได้จริง
 *
 * ฐานข้อมูลมีกฎของตัวเองคุมอีกชั้น (ดู supabase/migrations/) ตรงนี้ทำหน้าที่
 * บอกผู้ใช้ก่อนว่าผิดตรงไหน แทนที่จะปล่อยให้ไปเจอ error ดิบๆ จาก Postgres
 */

const STATUSES = ['ready', 'beta', 'wip'];

const blank = (value) => (typeof value === 'string' ? value.trim() : value ?? '') === '';
const text = (value) => (blank(value) ? null : String(value).trim());

export function buildGamePayload(form) {
  const errors = {};

  const title = text(form.title);
  if (!title) errors.title = 'ต้องใส่ชื่อเกม';

  const slug = text(form.slug);
  if (!slug) {
    errors.slug = 'ต้องใส่ชื่อย่อ (ใช้เป็นที่อยู่ของเกมในเว็บ)';
  } else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    errors.slug = 'ชื่อย่อใช้ได้แค่ a-z, 0-9 และขีดกลาง เช่น harvest-moon-back-to-nature';
  }

  const consoleId = Number(form.console_id);
  if (!Number.isInteger(consoleId) || consoleId <= 0) {
    errors.console_id = 'ต้องเลือกเครื่องเล่น';
  }

  const status = text(form.status) ?? 'wip';
  if (!STATUSES.includes(status)) errors.status = 'สถานะไม่ถูกต้อง';

  const patchUrl = text(form.patch_url);
  if (patchUrl && !isAllowedPatchHost(patchUrl)) {
    errors.patch_url = 'ต้องเป็นลิงก์ GitHub แบบ https เท่านั้น (คัดลอกจากหน้า Releases)';
  }

  const patchFormat = text(form.patch_format)?.toLowerCase() ?? null;
  if (patchFormat && !SUPPORTED_FORMATS.includes(patchFormat)) {
    errors.patch_format = `ยังไม่รองรับ .${patchFormat} (รองรับ ${SUPPORTED_FORMATS.join(', ')})`;
  }

  // เกมที่บอกว่าพร้อมให้แปะ ต้องแปะได้จริง ไม่งั้นคนกดเข้ามาแล้วเจอทางตัน
  // (ฐานข้อมูลก็มีกฎข้อนี้อยู่ แต่ error จาก Postgres อ่านไม่รู้เรื่องสำหรับคนทั่วไป)
  if (status !== 'wip') {
    if (!patchUrl) errors.patch_url = 'เกมที่พร้อมให้แปะ ต้องมีลิงก์ไฟล์แพตช์';
    if (!patchFormat) errors.patch_format = 'เกมที่พร้อมให้แปะ ต้องระบุรูปแบบแพตช์';
  }

  const sha1 = text(form.source_sha1)?.toLowerCase() ?? null;
  if (sha1 && !/^[0-9a-f]{40}$/.test(sha1)) {
    errors.source_sha1 = 'SHA1 ต้องยาว 40 ตัวอักษร (a-f, 0-9) — หาค่าได้ที่หน้า /tools/sha1';
  }

  const stage = clampInt(form.progress_stage, 1, 5, 1);
  const percent = clampInt(form.progress_percent, 0, 100, 0);

  const updatedAt = text(form.patch_updated_at);
  if (updatedAt && !/^\d{4}-\d{2}-\d{2}$/.test(updatedAt)) {
    errors.patch_updated_at = 'วันที่ต้องเป็นรูปแบบ ปี-เดือน-วัน เช่น 2026-08-21';
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    payload: {
      console_id: consoleId,
      slug,
      title,
      subtitle: text(form.subtitle),
      cover_url: text(form.cover_url),
      description: text(form.description),
      status,
      patch_version: text(form.patch_version),
      patch_url: patchUrl,
      patch_format: patchFormat,
      patch_updated_at: updatedAt,
      source_spec: text(form.source_spec),
      source_sha1: sha1,
      progress_stage: stage,
      progress_percent: percent,
      is_published: Boolean(form.is_published),
    },
  };
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** แปลง error ของ Postgres ให้เป็นภาษาที่คนอ่านรู้เรื่อง */
export function explainSaveError(error) {
  const message = error?.message ?? '';

  if (message.includes('games_slug_key') || error?.code === '23505') {
    return 'ชื่อย่อนี้มีเกมอื่นใช้ไปแล้ว ลองเปลี่ยนเป็นชื่ออื่น';
  }
  if (message.includes('ready_games_need_a_patch')) {
    return 'เกมที่พร้อมให้แปะ ต้องมีทั้งลิงก์ไฟล์แพตช์และรูปแบบแพตช์';
  }
  if (message.includes('games_source_sha1_check')) {
    return 'ค่า SHA1 ไม่ถูกรูปแบบ ต้องยาว 40 ตัวอักษร';
  }
  if (error?.code === '42501' || message.includes('row-level security')) {
    return 'บัญชีนี้ไม่มีสิทธิ์แก้ข้อมูล — ต้องถูกเพิ่มในตาราง admins ก่อน';
  }
  return message || 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง';
}
