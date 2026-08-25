/**
 * ย่อรูปภาพในเบราว์เซอร์ก่อนอัปโหลด ใช้ Canvas วาดใหม่แล้ว re-encode เป็น JPEG
 * ลดขนาดไฟล์เก็บใน Supabase Storage และให้คนเน็ตช้าอัปโหลดได้เร็วขึ้น
 * ไม่แตะไฟล์วิดีโอ — บีบอัดวิดีโอในเบราว์เซอร์ยังไม่คุ้มทำ
 */

const TARGET_BYTES = 1.5 * 1024 * 1024;
const MAX_DIMENSION = 2000;
const MIN_QUALITY = 0.5;

export async function compressImageIfNeeded(file) {
  if (!file.type.startsWith('image/') || file.size <= TARGET_BYTES) {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);

    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    let quality = 0.85;
    let blob = await toBlob(canvas, quality);

    while (blob && blob.size > TARGET_BYTES && quality > MIN_QUALITY) {
      quality -= 0.1;
      blob = await toBlob(canvas, quality);
    }

    if (!blob) return file;

    const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], newName, { type: 'image/jpeg' });
  } catch {
    // เบราว์เซอร์เก่าหรือไฟล์แปลก ๆ ที่วาดลง canvas ไม่ได้ — ส่งไฟล์เดิมไปแทนดีกว่าบล็อกผู้ใช้
    return file;
  }
}

function toBlob(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}
