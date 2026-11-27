// Avatar spritesheet generated at runtime from an AvatarConfig.
// Rows 0-3: directions (down, left, right, up) x 4 frames (idle, walk1, idle2, walk2).
// Row 4: sitting (down, left, right). Every frame gets a 1px dark outline for readability.
import { AvatarConfig, SKIN_TONES, HAIR_COLORS, PANTS_COLORS } from "../../shared/avatar";

export const AV_W = 32;
export const AV_H = 40;
export const AV_FRAMES_PER_DIR = 4;

type Ctx = CanvasRenderingContext2D;
const r = (c: Ctx, x: number, y: number, w: number, h: number, color: string) => { c.fillStyle = color; c.fillRect(x, y, w, h); };

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 + amt))));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, "0")).join("")}`;
}

function drawFrame(c: Ctx, dir: number, frame: number, a: AvatarConfig, sitting = false) {
  const skin = SKIN_TONES[a.skin], skinD = shade(skin, -0.18);
  const hair = HAIR_COLORS[a.hairColor], hairL = shade(hair, 0.25);
  const shirt = a.shirt, shirtD = shade(shirt, -0.3), shirtL = shade(shirt, 0.2);
  const pants = PANTS_COLORS[a.pants], pantsD = shade(pants, -0.3);
  const walk = frame === 1 ? 1 : frame === 3 ? -1 : 0;   // leg/arm swing
  const bob = frame === 1 || frame === 3 ? 1 : 0;         // body bounce
  const by = (sitting ? 6 : 0) + bob;
  const side = dir === 1 || dir === 2;
  const fem = a.body === 1;
  const acc = a.accessory;
  // Feminine body: slimmer torso, skirt instead of trousers, eyelashes and a bow.
  if (fem) {
    if (sitting) { r(c, 8, 32, 16, 6, shirtD); r(c, 9, 36, 6, 4, skin); r(c, 17, 36, 6, 4, skin); r(c, 9, 38, 6, 2, "#111827"); r(c, 17, 38, 6, 2, "#111827"); }
    else if (side) { const f = dir === 1 ? -1 : 1; r(c, 10, 26, 12, 7, shirtD); r(c, 9, 31, 14, 2, shirtD); r(c, 12 + walk * 2 * f, 33, 4, 4, skin); r(c, 16 - walk * 2 * f, 33, 4, 4, skin); r(c, 12 + walk * 2 * f, 36, 4, 2, pants); r(c, 16 - walk * 2 * f, 36, 4, 2, pants); }
    else { r(c, 9, 26, 14, 6, shirtD); r(c, 8, 30, 16, 2, shirtD); const lu = walk > 0 ? 2 : 0, ru = walk < 0 ? 2 : 0; r(c, 10, 32 + lu, 5, 5 - lu, skin); r(c, 17, 32 + ru, 5, 5 - ru, skin); r(c, 10, 36, 5, 2, pants); r(c, 17, 36, 5, 2, pants); }
    r(c, 10, 17 + by, 12, 10, shirt); r(c, 10, 17 + by, 12, 2, shirtL);
    if (side) { const ax = dir === 1 ? 11 : 17; r(c, ax, 18 + by + walk * 2, 4, 9, shirt); r(c, ax, 25 + by + walk * 2, 4, 2, skin); }
    else { r(c, 7, 18 + by - walk * 2, 3, 8, shirt); r(c, 22, 18 + by + walk * 2, 3, 8, shirt); r(c, 7, 25 + by - walk * 2, 3, 2, skin); r(c, 22, 25 + by + walk * 2, 3, 2, skin); }
  }

  // legs
  if (fem) { /* drawn above */ }
  else if (sitting) {
    r(c, 9, 34, 6, 6, pants); r(c, 17, 34, 6, 6, pants); r(c, 9, 38, 6, 2, "#111827"); r(c, 17, 38, 6, 2, "#111827");
  } else if (side) {
    const f = dir === 1 ? -1 : 1;
    r(c, 13 + walk * 2 * f, 28, 5, 9, pants); r(c, 14 - walk * 2 * f, 28, 5, 9, pantsD);
    r(c, 13 + walk * 2 * f, 35, 5, 3, "#111827"); r(c, 14 - walk * 2 * f, 35, 5, 3, "#0b1220");
  } else {
    const lu = walk > 0 ? 2 : 0, ru = walk < 0 ? 2 : 0;
    r(c, 10, 28 + lu, 5, 9 - lu, pants); r(c, 17, 28 + ru, 5, 9 - ru, pantsD);
    r(c, 10, 35, 5, 3, "#111827"); r(c, 17, 35, 5, 3, "#111827");
  }
  // body
  if (!fem) {
  r(c, 9, 17 + by, 14, 12, shirt);
  r(c, 9, 17 + by, 14, 2, shirtL);
  r(c, 9, 25 + by, 14, 4, shirtD);
  if (dir === 0) r(c, 15, 18 + by, 2, 7, shirtD);
  }
  // arms
  if (fem) { /* drawn above */ }
  else if (side) { const ax = dir === 1 ? 11 : 17; r(c, ax, 18 + by + walk * 2, 4, 10, shirt); r(c, ax, 26 + by + walk * 2, 4, 2, skin); }
  else { r(c, 6, 18 + by - walk * 2, 3, 9, shirt); r(c, 23, 18 + by + walk * 2, 3, 9, shirt); r(c, 6, 26 + by - walk * 2, 3, 2, skin); r(c, 23, 26 + by + walk * 2, 3, 2, skin); }
  // head (feminine: rounder face, no jaw shading; masculine: subtle jaw line)
  r(c, 8, 4 + by, 16, 14, skin);
  if (fem) { c.clearRect(8, 4 + by, 1, 1); c.clearRect(23, 4 + by, 1, 1); c.clearRect(8, 17 + by, 1, 1); c.clearRect(23, 17 + by, 1, 1); r(c, 9, 17 + by, 14, 1, skin); r(c, 13, 18 + by, 6, 1, skinD); }
  else { r(c, 9, 17 + by, 14, 1, skinD); }
  if (dir !== 3) { r(c, 8, 4 + by, 16, 1, shade(skin, 0.12)); }
  // hair styles: 0 short, 1 long, 2 bun, 3 spiky, 4 bald, 5 curly
  const h = a.hair;
  if (h !== 4) {
    r(c, 7, 2 + by, 18, 5, hair); r(c, 8, 2 + by, 16, 1, hairL);
    r(c, 7, 6 + by, 3, 5, hair); r(c, 22, 6 + by, 3, 5, hair);
    if (dir === 3) r(c, 8, 7 + by, 16, 9, hair);
  } else { r(c, 9, 4 + by, 14, 1, shade(skin, 0.2)); }
  if (h === 1) { r(c, 6, 6 + by, 3, 13, hair); r(c, 23, 6 + by, 3, 13, hair); if (dir === 3) r(c, 8, 7 + by, 16, 13, hair); }
  if (h === 2) { r(c, 12, 0 + by, 8, 4, hair); r(c, 13, 0 + by, 6, 1, hairL); }
  if (h === 3) { for (let i = 0; i < 4; i++) r(c, 8 + i * 4, 0 + by, 2, 3, hair); }
  if (h === 5) { r(c, 5, 3 + by, 22, 4, hair); r(c, 5, 6 + by, 4, 7, hair); r(c, 23, 6 + by, 4, 7, hair); r(c, 9, 0 + by, 14, 3, hair); r(c, 7, 4 + by, 2, 2, hairL); r(c, 20, 1 + by, 2, 2, hairL); }
  // face
  if (dir === 0) { r(c, 11, 10 + by, 2, 3, "#111827"); r(c, 19, 10 + by, 2, 3, "#111827"); r(c, 11, 10 + by, 1, 1, "#fff"); r(c, 19, 10 + by, 1, 1, "#fff"); r(c, 14, 15 + by, 4, 1, fem ? "#e11d48" : "#9f1239"); r(c, 10, 13 + by, 2, 1, "#f9a8d4aa"); r(c, 20, 13 + by, 2, 1, "#f9a8d4aa"); if (fem) { r(c, 10, 9 + by, 4, 1, "#111827"); r(c, 18, 9 + by, 4, 1, "#111827"); } }
  else if (dir === 1) { r(c, 9, 10 + by, 2, 3, "#111827"); r(c, 9, 10 + by, 1, 1, "#fff"); if (fem) r(c, 8, 9 + by, 3, 1, "#111827"); }
  else if (dir === 2) { r(c, 21, 10 + by, 2, 3, "#111827"); r(c, 22, 10 + by, 1, 1, "#fff"); if (fem) r(c, 21, 9 + by, 3, 1, "#111827"); }
  if (fem && h !== 4 && acc === 0) { r(c, 21, 2 + by, 4, 3, "#f472b6"); r(c, 22, 3 + by, 2, 1, "#fbcfe8"); }
  // accessories: 1 glasses, 2 hat, 3 headphones, 4 crown
  if (acc === 1 && dir !== 3) {
    if (dir === 0) { r(c, 10, 9 + by, 4, 5, "#111827"); r(c, 18, 9 + by, 4, 5, "#111827"); r(c, 11, 10 + by, 2, 3, "#93c5fd"); r(c, 19, 10 + by, 2, 3, "#93c5fd"); r(c, 14, 11 + by, 4, 1, "#111827"); }
    else if (dir === 1) { r(c, 8, 9 + by, 4, 5, "#111827"); r(c, 9, 10 + by, 2, 3, "#93c5fd"); }
    else { r(c, 20, 9 + by, 4, 5, "#111827"); r(c, 21, 10 + by, 2, 3, "#93c5fd"); }
  }
  if (acc === 2) { r(c, 5, 4 + by, 22, 2, "#7c2d12"); r(c, 8, -1 + by, 16, 6, "#9a3412"); r(c, 8, 1 + by, 16, 1, "#c2410c"); }
  if (acc === 3) { r(c, 7, 1 + by, 18, 2, "#374151"); r(c, 5, 6 + by, 4, 6, "#111827"); r(c, 23, 6 + by, 4, 6, "#111827"); r(c, 6, 7 + by, 1, 3, "#3b82f6"); r(c, 25, 7 + by, 1, 3, "#3b82f6"); }
  if (acc === 4) { r(c, 9, 0 + by, 14, 3, "#facc15"); for (let i = 0; i < 4; i++) r(c, 9 + i * 4, -2 + by, 2, 2, "#facc15"); r(c, 15, 0 + by, 2, 2, "#ef4444"); r(c, 10, 1 + by, 2, 1, "#fef3c7"); }
}

/** Adds a 1px dark outline around every opaque pixel of the frame. */
function outlineFrame(ctx: Ctx, ox: number, oy: number) {
  const img = ctx.getImageData(ox, oy, AV_W, AV_H);
  const d = img.data;
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < AV_W && y < AV_H && d[(y * AV_W + x) * 4 + 3] > 0;
  const out = new Uint8ClampedArray(d);
  for (let y = 0; y < AV_H; y++) for (let x = 0; x < AV_W; x++) {
    if (solid(x, y)) continue;
    if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) { const i = (y * AV_W + x) * 4; out[i] = 20; out[i + 1] = 16; out[i + 2] = 24; out[i + 3] = 230; }
  }
  img.data.set(out);
  ctx.putImageData(img, ox, oy);
}

export function drawAvatarSheet(canvas: HTMLCanvasElement, a: AvatarConfig) {
  canvas.width = AV_W * AV_FRAMES_PER_DIR;
  canvas.height = AV_H * 5;
  const c = canvas.getContext("2d")!;
  c.imageSmoothingEnabled = false;
  const cell = (col: number, row: number, fn: () => void) => {
    c.save(); c.translate(col * AV_W, row * AV_H); c.beginPath(); c.rect(0, 0, AV_W, AV_H); c.clip(); fn(); c.restore();
    outlineFrame(c, col * AV_W, row * AV_H);
  };
  for (let dir = 0; dir < 4; dir++) for (let f = 0; f < AV_FRAMES_PER_DIR; f++) cell(f, dir, () => drawFrame(c, dir, f, a));
  for (let dir = 0; dir < 3; dir++) cell(dir, 4, () => drawFrame(c, dir, 0, a, true));
  return canvas;
}

/** Draws a single idle frame (facing down) into a preview canvas. */
export function drawAvatarPreview(canvas: HTMLCanvasElement, a: AvatarConfig, scale = 2) {
  const sheet = drawAvatarSheet(document.createElement("canvas"), a);
  canvas.width = AV_W * scale; canvas.height = AV_H * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(sheet, 0, 0, AV_W, AV_H, 0, 0, AV_W * scale, AV_H * scale);
}
