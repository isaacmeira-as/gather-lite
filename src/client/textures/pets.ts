// Tiny pets that trail behind the avatar. 16x16, 2 frames each.
export const PET_W = 16, PET_H = 16;
type Ctx = CanvasRenderingContext2D;
const r = (c: Ctx, x: number, y: number, w: number, h: number, col: string) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
const painters: Record<number, (c: Ctx, f: number) => void> = {
  1: (c, f) => { r(c, 3, 6, 10, 7, "#f59e0b"); r(c, 3, 4, 3, 3, "#f59e0b"); r(c, 10, 4, 3, 3, "#f59e0b"); r(c, 5, 8, 2, 2, "#111"); r(c, 9, 8, 2, 2, "#111"); r(c, 7, 10, 2, 1, "#be185d"); r(c, 13, 7 - f, 2, 5, "#f59e0b"); r(c, 4, 13, 2, 2, "#d97706"); r(c, 10, 13, 2, 2, "#d97706"); },
  2: (c, f) => { r(c, 2, 6, 11, 7, "#a16207"); r(c, 1, 5, 3, 4, "#78350f"); r(c, 11, 5, 3, 4, "#78350f"); r(c, 4, 8, 2, 2, "#111"); r(c, 9, 8, 2, 2, "#111"); r(c, 6, 10, 3, 2, "#111"); r(c, 13, 5 - f, 2, 4, "#a16207"); r(c, 3, 13, 2, 2, "#78350f"); r(c, 10, 13, 2, 2, "#78350f"); },
  3: (c, f) => { r(c, 4, 7, 9, 6, "#fde047"); r(c, 8, 3, 5, 5, "#fde047"); r(c, 12, 5, 3, 2, "#f97316"); r(c, 10, 4, 1, 1, "#111"); r(c, 5, 13, 2, 2 + f, "#f97316"); r(c, 10, 13, 2, 2 - f, "#f97316"); },
  4: (c, f) => { r(c, 4, 4, 8, 9, "#94a3b8"); r(c, 5, 6, 2, 2, "#22d3ee"); r(c, 9, 6, 2, 2, "#22d3ee"); r(c, 6, 10, 4, 1, "#334155"); r(c, 7, 1 + f, 2, 3, "#ef4444"); r(c, 2, 7, 2, 4, "#64748b"); r(c, 12, 7, 2, 4, "#64748b"); r(c, 5, 13, 2, 2, "#334155"); r(c, 9, 13, 2, 2, "#334155"); },
  5: (c, f) => { r(c, 3, 7 + f, 10, 7 - f, "#4ade80"); r(c, 4, 5 + f, 8, 3, "#4ade80"); r(c, 5, 8 + f, 2, 2, "#111"); r(c, 9, 8 + f, 2, 2, "#111"); r(c, 5, 6 + f, 2, 1, "#bbf7d0"); },
};
export function drawPetSheet(canvas: HTMLCanvasElement, pet: number) {
  canvas.width = PET_W * 2; canvas.height = PET_H;
  const c = canvas.getContext("2d")!;
  for (let f = 0; f < 2; f++) { c.save(); c.translate(f * PET_W, 0); painters[pet]?.(c, f); c.restore(); }
  return canvas;
}
