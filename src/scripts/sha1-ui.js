import { sha1Hex } from '../patcher/sha1.js';

const fileInput = document.getElementById('file');
const status = document.getElementById('status');
const result = document.getElementById('result');
const meta = document.getElementById('meta');
const hash = document.getElementById('hash');
const copyBtn = document.getElementById('copy');

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) {
    result.hidden = true;
    status.textContent = 'ยังไม่ได้เลือกไฟล์';
    return;
  }

  result.hidden = true;
  status.textContent = `กำลังคำนวณ... (${formatSize(file.size)} — ไฟล์ใหญ่ใช้เวลาสักพัก)`;

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    hash.textContent = await sha1Hex(bytes);
    meta.textContent = `${file.name} · ${formatSize(file.size)} · ${file.size.toLocaleString()} ไบต์`;
    status.textContent = 'คำนวณเสร็จแล้ว';
    result.hidden = false;
  } catch {
    status.textContent = 'อ่านไฟล์ไม่สำเร็จ — ไฟล์อาจใหญ่เกินกว่าที่เครื่องจะไหว ลองบนคอมพิวเตอร์ดูนะ';
  }
});

copyBtn.addEventListener('click', async () => {
  const original = copyBtn.textContent;
  try {
    await navigator.clipboard.writeText(hash.textContent);
    copyBtn.textContent = '✅ คัดลอกแล้ว';
  } catch {
    // บางเบราว์เซอร์ห้ามเขียนคลิปบอร์ด ให้เลือกข้อความไว้ให้ผู้ใช้กดคัดลอกเอง
    selectText(hash);
    copyBtn.textContent = 'คัดลอกอัตโนมัติไม่ได้ — เลือกข้อความไว้ให้แล้ว กด Ctrl+C';
  }
  setTimeout(() => {
    copyBtn.textContent = original;
  }, 2500);
});

function selectText(node) {
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} ไบต์`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
