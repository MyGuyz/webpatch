/**
 * ตรวจและแปลงค่าที่กรอกในฟอร์มแจ้งบั๊กให้เป็นข้อมูลพร้อมบันทึก
 *
 * แยกออกมาจากหน้าเว็บด้วยเหตุผลเดียวกับ game-form.js — เป็นส่วนที่มีตรรกะ
 * พอจะทดสอบได้จริง ฐานข้อมูลมีกฎของตัวเองคุมอีกชั้น (ดู supabase/migrations/)
 */

export const MAX_FILE_BYTES = 30 * 1024 * 1024;

export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
];

const blank = (value) => (typeof value === 'string' ? value.trim() : value ?? '') === '';
const text = (value) => (blank(value) ? null : String(value).trim());

export function buildBugReportPayload(form, files) {
  const errors = {};

  const gameId = Number(form.game_id);
  if (!Number.isInteger(gameId) || gameId <= 0) errors.game_id = 'ต้องเลือกเกม';

  const patchVersion = text(form.patch_version);
  if (!patchVersion) errors.patch_version = 'ต้องเลือกเวอร์ชันแพตช์';

  const description = text(form.description);
  if (!description) errors.description = 'ต้องอธิบายปัญหาที่เจอ';

  const mediaError = validateFiles(files);
  if (mediaError) errors.media = mediaError;

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    payload: {
      game_id: gameId,
      patch_version: patchVersion,
      description,
      where_in_game: text(form.where_in_game),
      emulator: text(form.emulator),
      wrong_text: text(form.wrong_text),
      contact: text(form.contact),
    },
  };
}

/** บังคับแนบรูปหรือวิดีโออย่างน้อย 1 ไฟล์ ไฟล์ละไม่เกิน 30MB (ดู ADR-009) */
export function validateFiles(files) {
  if (!files || files.length === 0) {
    return 'ต้องแนบรูปหรือวิดีโออย่างน้อย 1 ไฟล์';
  }
  for (const file of files) {
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return `"${file.name}" ไม่ใช่รูปหรือวิดีโอที่รองรับ`;
    }
    if (file.size > MAX_FILE_BYTES) {
      return `"${file.name}" ใหญ่เกิน 30MB (${formatSize(file.size)}) — ลองบีบอัดหรือตัดคลิปให้สั้นลง`;
    }
  }
  return null;
}

export function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** แปลง error ของ Supabase ให้เป็นภาษาที่คนอ่านรู้เรื่อง */
export function explainBugReportError(error) {
  const message = error?.message ?? '';

  if (message.includes('exceeded the maximum allowed size')) {
    return 'ไฟล์ใหญ่เกิน 30MB ที่ระบบอนุญาต ลองบีบอัดหรือตัดคลิปให้สั้นลง';
  }
  if (message.includes('mime type') || message.includes('not supported')) {
    return 'ชนิดไฟล์นี้ไม่รองรับ ใช้ได้แค่รูปภาพหรือวิดีโอทั่วไป';
  }
  return message || 'ส่งรายงานไม่สำเร็จ ลองใหม่อีกครั้ง';
}
