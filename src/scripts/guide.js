import { sfxChime, sfxCancel, sfxSuccess } from '../lib/sfx.js';

const el = (id) => document.getElementById(id);
const guide = el('guide-modal');
const helpBtn = el('help-btn');
if (guide && helpBtn) start();

function start() {
  helpBtn.addEventListener('click', () => {
    sfxChime();
    openGuide();
  });

  el('guide-close').addEventListener('click', () => {
    sfxCancel();
    closeGuide();
  });

  el('guide-done').addEventListener('click', () => {
    sfxSuccess();
    closeGuide();
  });

  const gate = el('browser-gate');
  if (!localStorage.getItem('webpatchGuideSeen') && !gate?.classList.contains('open')) {
    setTimeout(openGuide, 500);
  }
}

function openGuide() {
  guide.classList.add('open');
}

function closeGuide() {
  guide.classList.remove('open');
  localStorage.setItem('webpatchGuideSeen', '1');
}
