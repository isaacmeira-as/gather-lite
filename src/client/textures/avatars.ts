// Avatar spritesheet generated at runtime: 4 directions x 3 frames + 1 sitting frame.
export const AV_W = 32;
export const AV_H = 40;
export const AV_FRAMES_PER_DIR = 3;
export const SKINS = [
  { name: "Clássico", skin: "#f1c6a3", hair: "#3b2416" },
  { name: "Loiro", skin: "#f7d7b7", hair: "#e3b24b" },
  { name: "Ruivo", skin: "#f3cdb0", hair: "#c2410c" },
  { name: "Moreno", skin: "#b07a52", hair: "#1f1410" },
  { name: "Grisalho", skin: "#e7c3a3", hair: "#cbd5e1" },
  { name: "Azul", skin: "#8d5a3b", hair: "#2563eb" },
];

type Ctx = CanvasRenderingContext2D;
const r = (c: Ctx, x: number, y: number, w: number, h: number, color: string) => { c.fillStyle = color; c.fillRect(x, y, w, h); };

function darken(hex: string, amt = 0.25) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.round(v * (1 - amt)));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, "0")).join("")}`;
}

/** dir: 0 down, 1 left, 2 right, 3 up. frame: 0 idle, 1/2 walk. */
function drawFrame(c: Ctx, dir: number, frame: number, skinIdx: number, color: string, sitting = false) {
  const s = SKINS[skinIdx % SKINS.length];
  const shirt = color;
  const pants = "#1e3a8a";
  const legOff = frame === 1 ? 2 : frame === 2 ? -2 : 0;
  const bob = frame === 0 ? 0 : 1;
  const baseY = sitting ? 6 : 0;

  // legs
  if (sitting) {
    r(c, 9, 28 + baseY, 6, 6, pants); r(c, 17, 28 + baseY, 6, 6, pants);
    r(c, 9, 32 + baseY, 6, 3, "#111827"); r(c, 17, 32 + baseY, 6, 3, "#111827");
  } else if (dir === 1 || dir === 2) {
    r(c, 12 + legOff, 28, 5, 9, pants); r(c, 15 - legOff, 28, 5, 9, pants);
    r(c, 12 + legOff, 35, 5, 3, "#111827"); r(c, 15 - legOff, 35, 5, 3, "#111827");
  } else {
    r(c, 10, 28 + Math.max(0, legOff), 5, 9 - Math.max(0, legOff), pants);
    r(c, 17, 28 + Math.max(0, -legOff), 5, 9 - Math.max(0, -legOff), pants);
    r(c, 10, 35, 5, 3, "#111827"); r(c, 17, 35, 5, 3, "#111827");
  }
  // body
  r(c, 9, 17 + bob + baseY, 14, 12, shirt);
  r(c, 9, 25 + bob + baseY, 14, 4, darken(shirt));
  // arms
  if (dir === 1) { r(c, 11, 18 + bob + baseY, 4, 10, shirt); }
  else if (dir === 2) { r(c, 17, 18 + bob + baseY, 4, 10, shirt); }
  else { r(c, 6, 18 + bob + baseY, 3, 9, shirt); r(c, 23, 18 + bob + baseY, 3, 9, shirt); r(c, 6, 26 + bob + baseY, 3, 2, s.skin); r(c, 23, 26 + bob + baseY, 3, 2, s.skin); }
  // head
  r(c, 8, 4 + bob + baseY, 16, 14, s.skin);
  // hair
  r(c, 7, 2 + bob + baseY, 18, 5, s.hair);
  r(c, 7, 6 + bob + baseY, 3, 6, s.hair); r(c, 22, 6 + bob + baseY, 3, 6, s.hair);
  if (dir === 3) r(c, 8, 7 + bob + baseY, 16, 9, s.hair);
  // face
  if (dir === 0) { r(c, 11, 10 + bob + baseY, 2, 3, "#111827"); r(c, 19, 10 + bob + baseY, 2, 3, "#111827"); r(c, 14, 15 + bob + baseY, 4, 1, "#9f1239"); }
  else if (dir === 1) { r(c, 9, 10 + bob + baseY, 2, 3, "#111827"); }
  else if (dir === 2) { r(c, 21, 10 + bob + baseY, 2, 3, "#111827"); }
}

/** Sheet layout: row = dir (4 rows), col = frame (3 cols) ; row 4 = sitting frames (1 per dir). */
export function drawAvatarSheet(canvas: HTMLCanvasElement, skinIdx: number, color: string) {
  canvas.width = AV_W * AV_FRAMES_PER_DIR;
  canvas.height = AV_H * 5;
  const c = canvas.getContext("2d")!;
  c.imageSmoothingEnabled = false;
  for (let dir = 0; dir < 4; dir++) {
    for (let f = 0; f < AV_FRAMES_PER_DIR; f++) {
      c.save(); c.translate(f * AV_W, dir * AV_H);
      drawFrame(c, dir, f, skinIdx, color);
      c.restore();
    }
  }
  for (let dir = 0; dir < 4; dir++) {
    if (dir >= AV_FRAMES_PER_DIR) break;
    c.save(); c.translate(dir * AV_W, 4 * AV_H);
    drawFrame(c, dir, 0, skinIdx, color, true);
    c.restore();
  }
  return canvas;
}

export const frameIndex = (dir: number, frame: number) => dir * AV_FRAMES_PER_DIR + frame;
export const sittingFrame = (dir: number) => 4 * AV_FRAMES_PER_DIR + Math.min(dir, AV_FRAMES_PER_DIR - 1);
