/** เสียงเอฟเฟกต์สไตล์เกมยุค 8-bit สังเคราะห์สดด้วย Web Audio ไม่ต้องโหลดไฟล์เสียง */

let audioCtx = null;

function beep(freqs, duration, type, peakGain) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(peakGain, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    // สุ่มระดับเสียงเพี้ยนไปเล็กน้อยทุกครั้ง กันเสียงซ้ำเป๊ะจนน่ารำคาญเวลากดรัวๆ
    const detune = 1 + (Math.random() * 2 - 1) * 0.05;
    const step = duration / freqs.length;
    freqs.forEach((f, i) => osc.frequency.setValueAtTime(f * detune, t + i * step));

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  } catch {
    // เบราว์เซอร์บางตัวบล็อก AudioContext จนกว่าจะมีการโต้ตอบ หรือไม่รองรับเลย — ไม่ใช่เรื่องคอขาดบาดตาย ปล่อยผ่านเงียบๆ
  }
}

export const sfxConfirm = () => beep([440, 660], 0.12, 'square', 0.06);
export const sfxSuccess = () => beep([392, 494, 659], 0.22, 'square', 0.06);
export const sfxSelect = () => beep([294, 392], 0.07, 'triangle', 0.04);
export const sfxTick = () => beep([320], 0.045, 'square', 0.035);
export const sfxCancel = () => beep([300, 210], 0.09, 'triangle', 0.045);
export const sfxError = () => beep([220, 130], 0.16, 'square', 0.05);
export const sfxWarn = () => beep([380], 0.09, 'square', 0.045);
export const sfxChime = () => beep([523, 784], 0.16, 'square', 0.05);
