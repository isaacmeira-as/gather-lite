// Avatar spritesheet generated at runtime from an AvatarConfig:
// 4 directions x 3 frames (idle, walk1, walk2) + 3 sitting frames.
import { AvatarConfig, SKIN_TONES, HAIR_COLORS, PANTS_COLORS } from "../../shared/avatar";

export const AV_W = 32;
export const AV_H = 40;
export const AV_FRAMES_PER_DIR = 3;

type Ctx = CanvasRenderingContext2D;
const r = (c: Ctx, x: number, y: number, w: number, h: number, color: string) => { c.fillStyle = color; c.fillRect(x, y, w, h); };

function darken(hex: string, amt = 0.25) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.round(v * (1 - amt)));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, "0")).join("")}`;
}

function drawFrame(c: Ctx, dir: number, frame: number, a: AvatarConfig, sitting = false) {
  const skin = SKIN_TONES[a.skin];
  const hair = HAIR_COLORS[a.hairColor];
  const shirt = a.shirt;
  const pants = PANTS_COLORS[a.pants];
  const legOff = frame === 1 ? 2 : frame === 2 ? -2 : 0;
  const bob = frame === 0 ? 0 : 1;
  const by = (sitting ? 6 : 0) + bob;

  // legs
  if (sitting) {
    r(c, 9, 28 + 6, 6, 6, pants); r(c, 17, 28 + 6, 6, 6, pants);
    r(c, 9, 32 + 6, 6, 3, "#111827"); r(c, 17, 32 + 6, 6, 3, "#111827");
  } else if (dir === 1 || dir === 2) {
    r(c, 12 + legOff, 28, 5, 9, pants); r(c, 15 - legOff, 28, 5, 9, pants);
    r(c, 12 + legOff, 35, 5, 3, "#111827"); r(c, 15 - legOff, 35, 5, 3, "#111827");
  } else {
    r(c, 10, 28 + Math.max(0, legOff), 5, 9 - Math.max(0, legOff), pants);
    r(c, 17, 28 + Math.max(0, -legOff), 5, 9 - Math.max(0, -legOff), pants);
    r(c, 10, 35, 5, 3, "#111827"); r(c, 17, 35, 5, 3, "#111827");
  }
  // body
  r(c, 9, 17 + by, 14, 12, shirt);
  r(c, 9, 25 + by, 14, 4, darken(shirt));
  // arms
  if (dir === 1) r(c, 11, 18 + by, 4, 10, shirt);
  else if (dir === 2) r(c, 17, 18 + by, 4, 10, shirt);
  else { r(c, 6, 18 + by, 3, 9, shirt); r(c, 23, 18 + by, 3, 9, shirt); r(c, 6, 26 + by, 3, 2, skin); r(c, 23, 26 + by, 3, 2, skin); }
  // head
  r(c, 8, 4 + by, 16, 14, skin);
  // hair styles: 0 short, 1 long, 2 bun, 3 spiky, 4 bald, 5 curly
  const h = a.hair;
  if (h !== 4) {
    r(c, 7, 2 + by, 18, 5, hair);
    r(c, 7, 6 + by, 3, 5, hair); r(c, 22, 6 + by, 3, 5, hair);
    if (dir === 3) r(c, 8, 7 + by, 16, 9, hair);
  }
  if (h === 1) { r(c, 6, 6 + by, 3, 13, hair); r(c, 23, 6 + by, 3, 13, hair); if (dir === 3) r(c, 8, 7 + by, 16, 13, hair); }
  if (h === 2) { r(c, 12, 0 + by, 8, 4, hair); }
  if (h === 3) { for (let i = 0; i < 4; i++) r(c, 8 + i * 4, 0 + by, 2, 3, hair); }
  if (h === 5) { r(c, 5, 3 + by, 22, 4, hair); r(c, 5, 6 + by, 4, 7, hair); r(c, 23, 6 + by, 4, 7, hair); r(c, 9, 0 + by, 14, 3, hair); }
  // face
  if (dir === 0) { r(c, 11, 10 + by, 2, 3, "#111827"); r(c, 19, 10 + by, 2, 3, "#111827"); r(c, 14, 15 + by, 4, 1, "#9f1239"); }
  else if (dir === 1) r(c, 9, 10 + by, 2, 3, "#111827");
  else if (dir === 2) r(c, 21, 10 + by, 2, 3, "#111827");
  // accessories: 1 glasses, 2 hat, 3 headphones, 4 crown
  const acc = a.accessory;
  if (acc === 1 && dir !== 3) {
    if (dir === 0) { r(c, 10, 9 + by, 4, 5, "#111827"); r(c, 18, 9 + by, 4, 5, "#111827"); r(c, 11, 10 + by, 2, 3, "#93c5fd"); r(c, 19, 10 + by, 2, 3, "#93c5fd"); r(c, 14, 11 + by, 4, 1, "#111827"); }
    else if (dir === 1) { r(c, 8, 9 + by, 4, 5, "#111827"); r(c, 9, 10 + by, 2, 3, "#93c5fd"); }
    else { r(c, 20, 9 + by, 4, 5, "#111827"); r(c, 21, 10 + by, 2, 3, "#93c5fd"); }
  }
  if (acc === 2) { r(c, 5, 4 + by, 22, 2, "#7c2d12"); r(c, 8, -1 + by, 16, 6, "#9a3412"); }
  if (acc === 3) { r(c, 7, 1 + by, 18, 2, "#374151"); r(c, 5, 6 + by, 4, 6, "#111827"); r(c, 23, 6 + by, 4, 6, "#111827"); }
  if (acc === 4) { r(c, 9, 0 + by, 14, 3, "#facc15"); for (let i = 0; i < 4; i++) r(c, 9 + i * 4, -2 + by, 2, 2, "#facc15"); r(c, 15, 0 + by, 2, 2, "#ef4444"); }
}

export function drawAvatarSheet(canvas: HTMLCanvasElement, a: AvatarConfig) {
  canvas.width = AV_W * AV_FRAMES_PER_DIR;
  canvas.height = AV_H * 5;
  const c = canvas.getContext("2d")!;
  c.imageSmoothingEnabled = false;
  for (let dir = 0; dir < 4; dir++) for (let f = 0; f < AV_FRAMES_PER_DIR; f++) {
    c.save(); c.translate(f * AV_W, dir * AV_H); c.beginPath(); c.rect(0, 0, AV_W, AV_H); c.clip();
    drawFrame(c, dir, f, a);
    c.restore();
  }
  for (let dir = 0; dir < AV_FRAMES_PER_DIR; dir++) {
    c.save(); c.translate(dir * AV_W, 4 * AV_H); c.beginPath(); c.rect(0, 0, AV_W, AV_H); c.clip();
    drawFrame(c, dir, 0, a, true);
    c.restore();
  }
  return canvas;
}

/** Draws a single idle frame (facing down) into a preview canvas at 2x. */
export function drawAvatarPreview(canvas: HTMLCanvasElement, a: AvatarConfig, scale = 2) {
  const sheet = drawAvatarSheet(document.createElement("canvas"), a);
  canvas.width = AV_W * scale; canvas.height = AV_H * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(sheet, 0, 0, AV_W, AV_H, 0, 0, AV_W * scale, AV_H * scale);
}
