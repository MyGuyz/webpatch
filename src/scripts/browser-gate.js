import { sfxWarn, sfxConfirm, sfxCancel } from '../lib/sfx.js';

/**
 * เบราว์เซอร์ในแอป (Facebook/LINE/IG ฯลฯ) มักปิดกั้นการดาวน์โหลดไฟล์
 * คนที่กดลิงก์จากเพจ Facebook เข้ามาแล้วแปะเสร็จ ดาวน์โหลดไฟล์กลับไม่ได้บ่อยมาก
 * เลยเตือนไว้ก่อนเลยว่าให้ไปเปิดด้วยเบราว์เซอร์จริง
 */

const el = (id) => document.getElementById(id);
const gate = el('browser-gate');
if (gate) start();

function start() {
  const appName = detectInAppBrowser();
  if (!appName) return;
  if (sessionStorage.getItem('webpatchGateSkipped')) return;

  const platform = detectPlatform();

  el('gate-appname').textContent = appName;
  el('copy-url').value = location.href;
  switchTab(platform);
  sfxWarn();
  gate.classList.add('open');

  el('tab-ios').addEventListener('click', () => switchTab('ios'));
  el('tab-android').addEventListener('click', () => switchTab('android'));
  el('copy-btn').addEventListener('click', copyLink);
  el('gate-skip').addEventListener('click', () => {
    sfxCancel();
    sessionStorage.setItem('webpatchGateSkipped', '1');
    gate.classList.remove('open');
  });
}

function switchTab(platform) {
  el('steps-ios').hidden = platform !== 'ios';
  el('steps-android').hidden = platform !== 'android';
  el('tab-ios').classList.toggle('is-active', platform === 'ios');
  el('tab-android').classList.toggle('is-active', platform === 'android');
}

function copyLink() {
  sfxConfirm();
  const input = el('copy-url');
  const button = el('copy-btn');
  input.select();
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(input.value).catch(() => {});
  }
  const original = button.textContent;
  button.textContent = '✓ คัดลอกแล้ว';
  setTimeout(() => {
    button.textContent = original;
  }, 1600);
}

function detectInAppBrowser(ua = navigator.userAgent) {
  if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)) return 'Facebook';
  if (/Instagram/i.test(ua)) return 'Instagram';
  if (/Line\//i.test(ua)) return 'LINE';
  if (/MessengerForiOS/i.test(ua)) return 'Messenger';
  if (/musical_ly|TikTok/i.test(ua)) return 'TikTok';
  if (/MicroMessenger/i.test(ua)) return 'WeChat';
  return null;
}

function detectPlatform(ua = navigator.userAgent) {
  return /Android/i.test(ua) ? 'android' : 'ios';
}
