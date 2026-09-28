/* Tiny WebAudio sound kit — no assets, generated tones. Client-only. */

let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(v: boolean) {
  enabled = v;
}

function ac(): AudioContext | null {
  if (typeof window === "undefined" || !enabled) return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(
  freq: number,
  dur = 0.08,
  type: OscillatorType = "sine",
  vol = 0.12,
  when = 0,
  slideTo?: number
) {
  const c = ac();
  if (!c) return;
  try {
    const t0 = c.currentTime + when;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  } catch {
    // audio is decorative — never break the game
  }
}

export const chessSounds = {
  select() {
    tone(520, 0.05, "sine", 0.06);
  },
  move() {
    tone(440, 0.07, "triangle", 0.1);
    tone(660, 0.06, "sine", 0.05, 0.02);
  },
  capture() {
    tone(320, 0.1, "triangle", 0.14, 0, 140);
    tone(180, 0.09, "sine", 0.08, 0.03);
  },
  check() {
    tone(880, 0.09, "sine", 0.1);
    tone(660, 0.12, "sine", 0.1, 0.1);
  },
  castle() {
    tone(440, 0.06, "triangle", 0.09);
    tone(550, 0.07, "triangle", 0.09, 0.07);
  },
  illegal() {
    tone(160, 0.12, "sawtooth", 0.05);
  },
  notify() {
    tone(720, 0.08, "sine", 0.08);
    tone(960, 0.1, "sine", 0.07, 0.09);
  },
  win() {
    tone(523, 0.12, "sine", 0.1);
    tone(659, 0.12, "sine", 0.1, 0.12);
    tone(784, 0.2, "sine", 0.11, 0.24);
  },
  lose() {
    tone(392, 0.14, "sine", 0.1);
    tone(311, 0.16, "sine", 0.1, 0.14);
    tone(233, 0.24, "sine", 0.09, 0.3);
  },
  draw() {
    tone(440, 0.12, "sine", 0.09);
    tone(440, 0.12, "sine", 0.09, 0.15);
  },
};
