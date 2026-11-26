// Sounds + tab badge. Uses WebAudio so no asset files are needed.
let ctx: AudioContext | null = null;
let muted = false;
try { muted = localStorage.getItem("gather-lite:muted") === "1"; } catch {}

export function setMuted(m: boolean) { muted = m; try { localStorage.setItem("gather-lite:muted", m ? "1" : "0"); } catch {} }
export const isMuted = () => muted;

export function beep(kind: "message" | "nearby" | "wave" | "summon" | "timer" = "message") {
  if (muted) return;
  try {
    ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    const notes: Record<string, number[]> = { message: [880], nearby: [523, 659], wave: [659, 784, 988], summon: [440, 554, 659, 880], timer: [988, 988, 988] };
    const seq = notes[kind];
    seq.forEach((f, i) => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.value = 0.0001;
      o.connect(g).connect(ctx!.destination);
      const t = ctx!.currentTime + i * 0.12;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.08, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
      o.start(t); o.stop(t + 0.12);
    });
  } catch {}
}

/** Short UI/game sound effects (synth, throttled). */
let lastStep = 0;
export function sfx(kind: "step" | "click" | "portal" | "join" | "open") {
  if (muted) return;
  const now = performance.now();
  if (kind === "step") { if (now - lastStep < 120) return; lastStep = now; }
  try {
    ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    const cfg: Record<string, [OscillatorType, number, number, number]> = { step: ["triangle", 180 + Math.random() * 40, 0.015, 0.06], click: ["square", 700, 0.03, 0.05], portal: ["sine", 520, 0.07, 0.35], join: ["sine", 660, 0.05, 0.2], open: ["sine", 440, 0.04, 0.12] };
    const [type, freq, vol, dur] = cfg[kind];
    o.type = type; o.frequency.value = freq;
    if (kind === "portal") o.frequency.exponentialRampToValueAtTime(1040, ctx.currentTime + dur);
    g.gain.setValueAtTime(vol, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + dur);
  } catch {}
}

let unread = 0;
const baseTitle = document.title;
export function setBadge(n: number) {
  unread = n;
  document.title = n ? `(${n}) ${baseTitle}` : baseTitle;
}
export const getBadge = () => unread;
document.addEventListener("visibilitychange", () => { if (!document.hidden) setBadge(0); });
