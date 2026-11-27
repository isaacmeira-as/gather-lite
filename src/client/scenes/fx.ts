// Lighting, weather and small effects for the office scene. Everything is generated at runtime.
import Phaser from "phaser";
import { TILE, F, O } from "../../shared/tiles";
import type { MapData } from "../../shared/map";
import { idx } from "../../shared/map";

export interface WeatherView { kind: string; temp: number; isDay: boolean; sunrise: string; sunset: string; timezone: string; city: string; source: string; humidity?: number; wind?: number }

const OUTDOOR = new Set<number>([F.GRASS, F.PATH, F.WATER]);

export function ensureFxTextures(scene: Phaser.Scene) {
  const tex = scene.textures;
  const mk = (key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) => {
    if (tex.exists(key)) return;
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    draw(cv.getContext("2d")!);
    tex.addCanvas(key, cv);
  };
  mk("fx-rain", 2, 10, (c) => { const g = c.createLinearGradient(0, 0, 0, 10); g.addColorStop(0, "rgba(200,225,255,0)"); g.addColorStop(1, "rgba(200,225,255,0.9)"); c.fillStyle = g; c.fillRect(0, 0, 2, 10); });
  mk("fx-snow", 4, 4, (c) => { c.fillStyle = "#fff"; c.beginPath(); c.arc(2, 2, 2, 0, Math.PI * 2); c.fill(); });
  mk("fx-dot", 6, 6, (c) => { c.fillStyle = "#fff"; c.beginPath(); c.arc(3, 3, 3, 0, Math.PI * 2); c.fill(); });
  mk("fx-light", 128, 128, (c) => { const g = c.createRadialGradient(64, 64, 4, 64, 64, 64); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.5, "rgba(255,255,255,0.45)"); g.addColorStop(1, "rgba(255,255,255,0)"); c.fillStyle = g; c.fillRect(0, 0, 128, 128); });
  mk("fx-cloud", 256, 128, (c) => { c.fillStyle = "rgba(0,0,0,1)"; for (const [x, y, r] of [[80, 70, 50], [130, 60, 60], [180, 75, 45], [110, 85, 40], [60, 85, 35]]) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); } });
  mk("fx-fog", 256, 256, (c) => { const g = c.createRadialGradient(128, 128, 20, 128, 128, 128); g.addColorStop(0, "rgba(255,255,255,0.35)"); g.addColorStop(1, "rgba(255,255,255,0)"); c.fillStyle = g; c.fillRect(0, 0, 256, 256); });
}

/** 0 = full day, 1 = deep night, from the space's local time and sunrise/sunset. */
export function darknessFor(w: WeatherView | null, timeMode: string, now = new Date()): number {
  if (timeMode === "day") return 0;
  if (timeMode === "night") return 1;
  if (!w) return 0;
  let hour = now.getHours() + now.getMinutes() / 60;
  try { const parts = new Intl.DateTimeFormat("en-GB", { timeZone: w.timezone, hour: "numeric", minute: "numeric", hour12: false }).formatToParts(now); hour = Number(parts.find((p) => p.type === "hour")!.value) + Number(parts.find((p) => p.type === "minute")!.value) / 60; } catch {}
  const t = (s: string) => { const [h, m] = s.split(":").map(Number); return h + m / 60; };
  const rise = t(w.sunrise), set = t(w.sunset);
  const ramp = 1.0; // hours of dawn/dusk
  if (hour < rise - ramp || hour > set + ramp) return 1;
  if (hour < rise) return 1 - (hour - (rise - ramp)) / ramp;
  if (hour > set) return (hour - set) / ramp;
  return 0;
}

export class Lighting {
  /** Viewport-sized overlay (scrollFactor 0): much cheaper than a map-sized texture. */
  rt: Phaser.GameObjects.RenderTexture;
  lights: { x: number; y: number; r: number; color?: number }[] = [];
  darkness = 0;
  private light: Phaser.GameObjects.Image;
  constructor(private scene: Phaser.Scene, private map: MapData) {
    this.rt = scene.add.renderTexture(0, 0, scene.scale.width, scene.scale.height).setOrigin(0).setDepth(9000).setScrollFactor(0);
    this.rt.setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.light = scene.make.image({ key: "fx-light", add: false });
    scene.scale.on("resize", (g: any) => this.rt.setSize(g.width, g.height));
    this.collectStatic();
  }
  collectStatic() {
    this.lights = [];
    for (let y = 0; y < this.map.height; y++) for (let x = 0; x < this.map.width; x++) {
      const o = this.map.objects[idx(this.map, x, y)];
      const cx = x * TILE + TILE / 2, cy = y * TILE + TILE / 2;
      if (o === O.LAMP) this.lights.push({ x: cx, y: cy, r: 110, color: 0xffe9a8 });
      if (o === O.COMPUTER || o === O.TV || o === O.ARCADE) this.lights.push({ x: cx, y: cy, r: 40, color: 0xbfe8ff });
      if (o === O.WINDOW) this.lights.push({ x: cx, y: cy + 16, r: 60, color: 0xcfe3ff });
      if (o === O.SPOTLIGHT) this.lights.push({ x: cx, y: cy, r: 80, color: 0xfff1b0 });
      if (o === O.FOUNTAIN) this.lights.push({ x: cx, y: cy, r: 50, color: 0xbfe8ff });
    }
  }
  draw(darkness: number, players: { x: number; y: number }[], tint = 0xffffff) {
    this.darkness = darkness;
    const rt = this.rt;
    if (darkness <= 0.02 && tint === 0xffffff) { rt.setVisible(false); return; }
    rt.setVisible(true);
    const cam = this.scene.cameras.main;
    const w = this.scene.scale.width, h = this.scene.scale.height;
    if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
    rt.clear();
    const night = Phaser.Display.Color.ValueToColor(0x2a3560);
    const day = Phaser.Display.Color.ValueToColor(tint);
    const amb = Phaser.Display.Color.Interpolate.ColorWithColor(day, night, 100, Math.round(darkness * 100));
    rt.fill(Phaser.Display.Color.GetColor(amb.r, amb.g, amb.b), 1);
    if (darkness > 0.05) {
      const a = Math.min(1, darkness * 1.1);
      const z = cam.zoom;
      const view = cam.worldView;
      const toScreen = (x: number, y: number) => ({ x: (x - view.x) * z, y: (y - view.y) * z });
      const put = (x: number, y: number, r: number, color: number, alpha: number) => {
        if (x < view.x - r || x > view.right + r || y < view.y - r || y > view.bottom + r) return;
        const s = toScreen(x, y);
        this.light.setDisplaySize(r * 2 * z, r * 2 * z).setTint(color).setAlpha(alpha);
        rt.draw(this.light, s.x, s.y);
      };
      for (const l of this.lights) put(l.x, l.y, l.r, l.color ?? 0xffffff, a);
      for (const p of players) put(p.x, p.y, 45, 0xffffff, a * 0.8);
    }
  }
}

export class Weather {
  kind = "";
  emitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  clouds: Phaser.GameObjects.Image[] = [];
  fogs: Phaser.GameObjects.Image[] = [];
  flashTimer: Phaser.Time.TimerEvent | null = null;
  outdoor: Phaser.Geom.Point[] = [];
  constructor(private scene: Phaser.Scene, private map: MapData) { this.collectOutdoor(); }
  collectOutdoor() {
    this.outdoor = [];
    for (let y = 0; y < this.map.height; y++) for (let x = 0; x < this.map.width; x++) if (OUTDOOR.has(this.map.floor[idx(this.map, x, y)])) this.outdoor.push(new Phaser.Geom.Point(x * TILE + TILE / 2, y * TILE + TILE / 2));
  }
  tintFor(kind: string, darkness: number) {
    if (darkness > 0.6) return 0xffffff;
    return { rain: 0xcfd8e6, storm: 0xb8c2d6, fog: 0xe8e8ec, cloudy: 0xe6e8ee, snow: 0xe9eef7 }[kind] ?? 0xffffff;
  }
  set(kind: string) {
    if (kind === this.kind) return;
    this.kind = kind;
    this.clear();
    if (!this.outdoor.length) return;
    const zone = { getRandomPoint: (p: Phaser.Types.Math.Vector2Like) => { const o = this.outdoor[Math.floor(Math.random() * this.outdoor.length)]; p.x = o.x + (Math.random() - 0.5) * TILE; p.y = o.y - 140 + (Math.random() - 0.5) * TILE; return p; } } as any;
    const w = this.map.width * TILE, h = this.map.height * TILE;
    if (kind === "rain" || kind === "storm") {
      this.emitter = this.scene.add.particles(0, 0, "fx-rain", { emitZone: { type: "random", source: zone } as any, speedY: { min: 420, max: 560 }, speedX: kind === "storm" ? { min: -140, max: -90 } : { min: -40, max: -20 }, lifespan: 420, frequency: kind === "storm" ? 3 : 5, quantity: 4, alpha: { start: 1, end: 0.3 }, scaleY: kind === "storm" ? 2 : 1.6, scaleX: 1.3, rotate: kind === "storm" ? 16 : 4 }).setDepth(8500);
      if (kind === "storm") this.flashTimer = this.scene.time.addEvent({ delay: 6000, loop: true, callback: () => { if (Math.random() < 0.7) this.scene.cameras.main.flash(140, 255, 255, 255, true); } });
    } else if (kind === "snow") {
      this.emitter = this.scene.add.particles(0, 0, "fx-snow", { emitZone: { type: "random", source: zone } as any, speedY: { min: 35, max: 70 }, speedX: { min: -25, max: 25 }, lifespan: 4200, frequency: 16, quantity: 1, alpha: { start: 0.95, end: 0.3 }, scale: { min: 0.5, max: 1.1 } }).setDepth(8500);
    } else if (kind === "cloudy") {
      for (let i = 0; i < 5; i++) {
        const c = this.scene.add.image(Math.random() * w, Math.random() * h, "fx-cloud").setAlpha(0.13).setDepth(8400).setScale(1.6 + Math.random());
        this.scene.tweens.add({ targets: c, x: c.x + w + 400, duration: 60000 + Math.random() * 40000, repeat: -1, onRepeat: () => { c.x = -300; c.y = Math.random() * h; } });
        this.clouds.push(c);
      }
    } else if (kind === "fog") {
      for (let i = 0; i < 10; i++) {
        const o = this.outdoor[Math.floor(Math.random() * this.outdoor.length)];
        const f = this.scene.add.image(o.x, o.y, "fx-fog").setAlpha(0.6).setDepth(8400).setScale(1.5 + Math.random());
        this.scene.tweens.add({ targets: f, x: f.x + 60, alpha: 0.35, duration: 8000 + Math.random() * 4000, yoyo: true, repeat: -1, ease: "Sine.InOut" });
        this.fogs.push(f);
      }
    }
  }
  clear() {
    this.emitter?.destroy(); this.emitter = null;
    this.clouds.forEach((c) => c.destroy()); this.clouds = [];
    this.fogs.forEach((f) => f.destroy()); this.fogs = [];
    this.flashTimer?.remove(); this.flashTimer = null;
  }
}

export function poof(scene: Phaser.Scene, x: number, y: number, color = 0xffffff) {
  const e = scene.add.particles(x, y, "fx-dot", { speed: { min: 40, max: 120 }, lifespan: 450, quantity: 14, scale: { start: 0.8, end: 0 }, alpha: { start: 0.9, end: 0 }, tint: color, emitting: false }).setDepth(9500);
  e.explode(14);
  scene.time.delayedCall(600, () => e.destroy());
}

export function dust(scene: Phaser.Scene, x: number, y: number) {
  const e = scene.add.particles(x, y, "fx-dot", { speed: { min: 10, max: 30 }, lifespan: 300, quantity: 3, scale: { start: 0.35, end: 0 }, alpha: { start: 0.5, end: 0 }, tint: 0xd9c7a0, emitting: false, gravityY: -20 }).setDepth(2);
  e.explode(3);
  scene.time.delayedCall(400, () => e.destroy());
}

/** Reaction effects broadcast by the server (confetti, hearts, fire, clap, balloons). */
export function reactionFx(scene: Phaser.Scene, id: string, x: number, y: number) {
  if (id === "confetti") {
    const e = scene.add.particles(x, y - 20, "fx-dot", { speed: { min: 80, max: 220 }, angle: { min: 200, max: 340 }, gravityY: 300, lifespan: 1400, quantity: 40, scale: { start: 0.7, end: 0.2 }, rotate: { min: 0, max: 360 }, tint: [0xef4444, 0xf59e0b, 0x22c55e, 0x3b82f6, 0xa855f7, 0xec4899], emitting: false }).setDepth(9500);
    e.explode(40);
    scene.time.delayedCall(1600, () => e.destroy());
    return;
  }
  const glyph: Record<string, string> = { hearts: "💖", fire: "🔥", clap: "👏", balloons: "🎈" };
  const g = glyph[id] ?? "✨";
  for (let i = 0; i < 8; i++) {
    const t = scene.add.text(x + (Math.random() - 0.5) * 40, y, g, { fontSize: `${12 + Math.random() * 10}px`, resolution: 2 }).setOrigin(0.5).setDepth(9500).setAlpha(0);
    scene.tweens.add({ targets: t, y: y - 60 - Math.random() * 50, x: t.x + (Math.random() - 0.5) * 30, alpha: { from: 1, to: 0 }, duration: 1200 + Math.random() * 600, delay: i * 70, ease: "Sine.Out", onComplete: () => t.destroy() });
  }
}
