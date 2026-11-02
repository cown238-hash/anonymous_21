/**
 * ระบบเสียงในแอป WKSL
 * ใช้ Web Audio API สร้างเสียงโดยไม่ต้องมีไฟล์เสียงจริง
 * เรียกใช้ได้ทันทีทุกหน้าของแอป
 */

let soundEnabled = true;
let bgmEnabled = false;

export function setSoundEnabled(enabled: boolean) {
  soundEnabled = enabled;
  try {
    localStorage.setItem('nimbus.sound', String(enabled));
  } catch {
    // localStorage อาจใช้ไม่ได้ในบางกรณี
  }
}

export function isSoundEnabled(): boolean {
  return soundEnabled;
}

export function setBGMEnabled(enabled: boolean) {
  bgmEnabled = enabled;
  try {
    localStorage.setItem('nimbus.bgm', String(enabled));
  } catch {
    // localStorage อาจใช้ไม่ได้ในบางกรณี
  }
  if (enabled) {
    startBackgroundMusic();
  } else {
    stopBackgroundMusic();
  }
}

export function isBGMEnabled(): boolean {
  return bgmEnabled;
}

export function initSound() {
  try {
    const stored = localStorage.getItem('nimbus.sound');
    if (stored !== null) {
      soundEnabled = stored === 'true';
    }
    const bgmStored = localStorage.getItem('nimbus.bgm');
    if (bgmStored !== null) {
      bgmEnabled = bgmStored === 'true';
    }
  } catch {
    // ใช้ค่าเริ่มต้น (เปิดเสียง)
  }
}

let audioCtx: AudioContext | null = null;
let bgmGain: GainNode | null = null;
let bgmOscillators: OscillatorNode[] = [];
let bgmChordIndex = 0;
let bgmTimer: number | null = null;

// คอร์ดเพลงพื้นหลัง (ambient chord progression)
// แต่ละคอร์ดเป็นความถี่หลายตัวรวมกัน
const BG_CHORDS = [
  [261.63, 329.63, 392.00], // C major
  [349.23, 440.00, 523.25], // F major
  [392.00, 493.88, 587.33], // G major
  [220.00, 261.63, 329.63], // A minor
];

function playTone(frequency: number, duration: number, type: OscillatorType = 'sine', volume = 0.1) {
  if (!soundEnabled) return;
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {
    // เกิดข้อผิดพลาด เงียบ ๆ ไม่ต้องทำอะไร
  }
}

/** เสียงแจ้งเตือนทั่วไป (เช่น มีข้อความใหม่, มีการแจ้งเตือน) */
export function playNotify() {
  playTone(700, 0.12, 'sine', 0.12);
  setTimeout(() => playTone(1000, 0.18, 'sine', 0.12), 120);
}

/** เสียงคลิกปุ่มทั่วไป */
export function playClick() {
  playTone(500, 0.04, 'sine', 0.06);
}

/** เสียงทำสำเร็จ (เช่น บันทึกแล้ว, ส่งแล้ว) */
export function playSuccess() {
  playTone(600, 0.1, 'sine', 0.1);
  setTimeout(() => playTone(900, 0.12, 'sine', 0.1), 60);
}

/** เสียงผิดพลาด (เช่น บันทึกไม่สำเร็จ, Netzwerk ล่ม) */
export function playError() {
  playTone(180, 0.35, 'sawtooth', 0.12);
}

/** เริ่มเล่นเพลงพื้นหลัง (ต้องเรียกหลังจากผู้ใช้โต้ตอบแล้วเท่านั้น) */
export function startBackgroundMusic() {
  if (!soundEnabled || !bgmEnabled) return;
  if (audioCtx) return; // กำลังเล่นอยู่แล้ว

  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;

    audioCtx = new AudioContext();
    bgmGain = audioCtx.createGain();
    bgmGain.gain.setValueAtTime(0.05, audioCtx.currentTime); // เบา ๆ ไม่รบกวน
    bgmGain.connect(audioCtx.destination);

    function playNextChord() {
      if (!audioCtx || !bgmEnabled) return;
      const chord = BG_CHORDS[bgmChordIndex];
      bgmChordIndex = (bgmChordIndex + 1) % BG_CHORDS.length;

      const oscillators: OscillatorNode[] = [];
      chord.forEach((freq) => {
        const osc = audioCtx!.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, audioCtx!.currentTime);
        osc.connect(bgmGain!);
        osc.start();
        oscillators.push(osc);
      });
      bgmOscillators = oscillators;

      // เปลี่ยนคอร์ดทุก 4 วินาที
      bgmTimer = window.setTimeout(() => {
        oscillators.forEach((osc) => {
          try {
            osc.stop();
          } catch {
            // ignore
          }
        });
        playNextChord();
      }, 4000);
    }

    playNextChord();
  } catch {
    // เกิดข้อผิดพลาด เงียบ ๆ
  }
}

/** หยุดเพลงพื้นหลัง */
export function stopBackgroundMusic() {
  if (bgmTimer !== null) {
    window.clearTimeout(bgmTimer);
    bgmTimer = null;
  }
  bgmOscillators.forEach((osc) => {
    try {
      osc.stop();
    } catch {
      // ignore
    }
  });
  bgmOscillators = [];
  if (audioCtx) {
    try {
      audioCtx.close();
    } catch {
      // ignore
    }
    audioCtx = null;
  }
  bgmGain = null;
}

/**
 * เรียกเมื่อผู้ใช้โต้ตอบครั้งแรก (คลิก, กดแป้น) เพื่อปลดล็อกเสียง
 * เรียกได้หลายครั้งอย่างปลอดภัย
 */
export function unlockAudioOnInteraction() {
  if (soundEnabled && bgmEnabled && !audioCtx) {
    startBackgroundMusic();
  }
}
