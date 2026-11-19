let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (Ctx) {
      audioCtx = new Ctx();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export type ChimeKind =
  | "beep"
  | "confirm"
  | "warning"
  | "critical"
  | "departure"
  | "return";

export function playDtsChime(kind: ChimeKind, enabled = true): void {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const playTone = (freq: number, startOffset: number, duration: number, gainVal = 0.12) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now + startOffset);
    gain.gain.setValueAtTime(gainVal, now + startOffset);
    gain.gain.exponentialRampToValueAtTime(0.001, now + startOffset + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + startOffset);
    osc.stop(now + startOffset + duration);
  };

  switch (kind) {
    case "beep":
      playTone(1760, 0, 0.055, 0.08);
      break;
    case "confirm":
      playTone(1568, 0, 0.07, 0.1);
      playTone(2093, 0.08, 0.12, 0.1);
      break;
    case "warning":
      playTone(1318, 0, 0.12, 0.14);
      playTone(987, 0.14, 0.18, 0.14);
      break;
    case "critical":
      playTone(2093, 0, 0.1, 0.18);
      playTone(1568, 0.11, 0.1, 0.18);
      playTone(2093, 0.22, 0.1, 0.18);
      playTone(1568, 0.33, 0.16, 0.18);
      break;
    case "departure":
      playTone(1046.5, 0, 0.1, 0.12);
      playTone(1318.5, 0.11, 0.1, 0.12);
      playTone(1568.0, 0.22, 0.2, 0.12);
      break;
    case "return":
      playTone(1568.0, 0, 0.12, 0.12);
      playTone(1318.5, 0.13, 0.12, 0.12);
      playTone(1046.5, 0.26, 0.22, 0.12);
      break;
  }
}

export function speakJapanese(text: string, enabled = true): void {
  if (!enabled || !text.trim()) return;
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "ja-JP";
    utter.rate = 1.05;
    utter.pitch = 1.0;
    utter.volume = 0.9;
    window.speechSynthesis.speak(utter);
  } catch {
    // Ignore speech synthesis errors on headless/unsupported hosts
  }
}
