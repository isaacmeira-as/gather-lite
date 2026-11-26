import { TILE, F, O } from "../../shared/tiles";

export const TILESET_COLS = 16;
export const TILESET_ROWS = 2;

type Ctx = CanvasRenderingContext2D;
const r = (c: Ctx, x: number, y: number, w: number, h: number, color: string) => { c.fillStyle = color; c.fillRect(x, y, w, h); };

// Deterministic pseudo-random for texture noise.
function noise(seed: number) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

const floorPainters: Record<number, (c: Ctx) => void> = {
  [F.NONE]: (c) => r(c, 0, 0, 32, 32, "#0f172a"),
  [F.WOOD]: (c) => {
    r(c, 0, 0, 32, 32, "#c89b6d");
    for (let i = 0; i < 4; i++) { r(c, 0, i * 8, 32, 1, "#a87a4b"); r(c, (i % 2) * 16, i * 8 + 1, 1, 7, "#a87a4b"); }
    r(c, 6, 3, 10, 1, "#d8ad7e"); r(c, 20, 19, 8, 1, "#d8ad7e");
  },
  [F.WOOD_DARK]: (c) => {
    r(c, 0, 0, 32, 32, "#7c4a2a");
    for (let i = 0; i < 4; i++) { r(c, 0, i * 8, 32, 1, "#5c3319"); r(c, ((i + 1) % 2) * 16, i * 8 + 1, 1, 7, "#5c3319"); }
  },
  [F.CARPET_BLUE]: (c) => carpet(c, "#4f74c8", "#4568b8", 1),
  [F.CARPET_GREEN]: (c) => carpet(c, "#4fa36a", "#45925e", 2),
  [F.CARPET_PURPLE]: (c) => carpet(c, "#7c5cc4", "#6d4fb3", 3),
  [F.RUG_RED]: (c) => { carpet(c, "#c0504d", "#aa4341", 4); r(c, 0, 0, 32, 2, "#e0b060"); r(c, 0, 30, 32, 2, "#e0b060"); },
  [F.STONE]: (c) => {
    r(c, 0, 0, 32, 32, "#cfd3d8");
    r(c, 0, 0, 32, 1, "#b2b7be"); r(c, 0, 0, 1, 32, "#b2b7be");
    r(c, 16, 0, 1, 16, "#b2b7be"); r(c, 0, 16, 32, 1, "#b2b7be"); r(c, 8, 16, 1, 16, "#b2b7be");
  },
  [F.GRASS]: (c) => {
    r(c, 0, 0, 32, 32, "#6abf5a");
    const n = noise(7);
    for (let i = 0; i < 18; i++) r(c, Math.floor(n() * 30), Math.floor(n() * 30), 2, 2, n() > 0.5 ? "#5aa84c" : "#7bcf6a");
  },
  [F.PATH]: (c) => {
    r(c, 0, 0, 32, 32, "#d9c7a0");
    const n = noise(11);
    for (let i = 0; i < 10; i++) r(c, Math.floor(n() * 28), Math.floor(n() * 28), 3, 2, "#c7b48a");
  },
  [F.WATER]: (c) => {
    r(c, 0, 0, 32, 32, "#3b82f6");
    r(c, 3, 6, 10, 2, "#93c5fd"); r(c, 18, 14, 9, 2, "#93c5fd"); r(c, 8, 24, 12, 2, "#60a5fa");
  },
};

function carpet(c: Ctx, base: string, dark: string, seed: number) {
  r(c, 0, 0, 32, 32, base);
  const n = noise(seed);
  for (let i = 0; i < 24; i++) r(c, Math.floor(n() * 32), Math.floor(n() * 32), 2, 1, dark);
}

const objectPainters: Record<number, (c: Ctx) => void> = {
  [O.WALL]: (c) => {
    r(c, 0, 0, 32, 32, "#8a8f98");
    r(c, 0, 0, 32, 10, "#aab0ba");
    for (let y = 10; y < 32; y += 6) { r(c, 0, y, 32, 1, "#6b7079"); r(c, (y / 6) % 2 ? 16 : 0, y + 1, 1, 5, "#6b7079"); }
  },
  [O.DESK]: (c) => { r(c, 1, 6, 30, 20, "#8b5a2b"); r(c, 1, 6, 30, 4, "#a86f3a"); r(c, 2, 26, 4, 5, "#5c3a1a"); r(c, 26, 26, 4, 5, "#5c3a1a"); },
  [O.COMPUTER]: (c) => {
    r(c, 1, 6, 30, 20, "#8b5a2b"); r(c, 1, 6, 30, 4, "#a86f3a"); r(c, 2, 26, 4, 5, "#5c3a1a"); r(c, 26, 26, 4, 5, "#5c3a1a");
    r(c, 8, 4, 16, 12, "#1f2937"); r(c, 10, 6, 12, 8, "#38bdf8"); r(c, 14, 16, 4, 3, "#374151"); r(c, 10, 19, 12, 2, "#374151");
    r(c, 9, 22, 14, 3, "#e5e7eb");
  },
  [O.CHAIR]: (c) => { r(c, 8, 4, 16, 10, "#334155"); r(c, 6, 14, 20, 10, "#475569"); r(c, 8, 24, 3, 6, "#1e293b"); r(c, 21, 24, 3, 6, "#1e293b"); },
  [O.BENCH]: (c) => { r(c, 2, 10, 28, 8, "#9a6b3c"); r(c, 2, 12, 28, 2, "#7a5230"); r(c, 4, 18, 4, 8, "#5c3a1a"); r(c, 24, 18, 4, 8, "#5c3a1a"); },
  [O.PLANT]: (c) => { r(c, 10, 22, 12, 9, "#b45309"); r(c, 12, 20, 8, 2, "#92400e"); r(c, 8, 6, 16, 14, "#16a34a"); r(c, 4, 10, 8, 8, "#22c55e"); r(c, 20, 8, 8, 8, "#15803d"); r(c, 14, 2, 6, 8, "#22c55e"); },
  [O.TREE]: (c) => { r(c, 13, 20, 6, 11, "#7c4a2a"); r(c, 4, 4, 24, 18, "#15803d"); r(c, 8, 1, 16, 8, "#16a34a"); r(c, 2, 10, 8, 8, "#22c55e"); r(c, 22, 12, 8, 8, "#166534"); },
  [O.FLOWERS]: (c) => { for (const [x, y, col] of [[4, 6, "#f472b6"], [16, 4, "#facc15"], [24, 14, "#fb7185"], [8, 20, "#a78bfa"], [20, 24, "#f97316"]] as const) { r(c, x, y + 4, 2, 6, "#15803d"); r(c, x - 2, y, 6, 5, col); r(c, x, y + 1, 2, 2, "#fef3c7"); } },
  [O.TABLE]: (c) => { r(c, 2, 4, 28, 22, "#a16207"); r(c, 4, 6, 24, 18, "#ca8a04"); r(c, 4, 26, 4, 4, "#713f12"); r(c, 24, 26, 4, 4, "#713f12"); },
  [O.WHITEBOARD]: (c) => { r(c, 2, 4, 28, 22, "#9ca3af"); r(c, 4, 6, 24, 18, "#f9fafb"); r(c, 7, 10, 12, 2, "#3b82f6"); r(c, 7, 14, 16, 2, "#ef4444"); r(c, 7, 18, 8, 2, "#22c55e"); r(c, 10, 27, 12, 2, "#6b7280"); },
  [O.BOOKSHELF]: (c) => {
    r(c, 1, 1, 30, 31, "#78350f"); r(c, 3, 3, 26, 12, "#451a03"); r(c, 3, 17, 26, 12, "#451a03");
    const cols = ["#ef4444", "#3b82f6", "#facc15", "#22c55e", "#a855f7", "#f97316"];
    for (let i = 0; i < 6; i++) { r(c, 4 + i * 4, 4, 3, 11, cols[i]); r(c, 4 + i * 4, 18, 3, 11, cols[(i + 2) % 6]); }
  },
  [O.COFFEE]: (c) => { r(c, 1, 8, 30, 18, "#8b5a2b"); r(c, 1, 8, 30, 4, "#a86f3a"); r(c, 8, 2, 16, 20, "#1f2937"); r(c, 10, 4, 12, 6, "#ef4444"); r(c, 13, 14, 6, 6, "#f9fafb"); r(c, 12, 20, 8, 2, "#9ca3af"); },
  [O.SOFA]: (c) => { r(c, 1, 6, 30, 22, "#7c3aed"); r(c, 1, 6, 30, 6, "#6d28d9"); r(c, 4, 12, 24, 10, "#8b5cf6"); r(c, 1, 12, 4, 14, "#6d28d9"); r(c, 27, 12, 4, 14, "#6d28d9"); },
  [O.LAMP]: (c) => { r(c, 14, 10, 4, 20, "#374151"); r(c, 10, 28, 12, 3, "#1f2937"); r(c, 6, 2, 20, 10, "#fde68a"); r(c, 8, 4, 16, 6, "#fef3c7"); },
  [O.SPOTLIGHT]: (c) => { c.fillStyle = "rgba(250,204,21,0.35)"; c.beginPath(); c.arc(16, 16, 14, 0, Math.PI * 2); c.fill(); c.strokeStyle = "#facc15"; c.lineWidth = 2; c.beginPath(); c.arc(16, 16, 12, 0, Math.PI * 2); c.stroke(); r(c, 14, 8, 4, 10, "#facc15"); r(c, 14, 20, 4, 4, "#facc15"); },
  [O.DOOR]: (c) => { r(c, 0, 0, 32, 32, "#c89b6d"); r(c, 2, 0, 28, 4, "#78350f"); r(c, 2, 28, 28, 4, "#78350f"); r(c, 14, 4, 4, 24, "#d6a85c"); },
  [O.FENCE]: (c) => { r(c, 0, 12, 32, 4, "#a16207"); r(c, 0, 22, 32, 4, "#a16207"); r(c, 4, 6, 4, 24, "#ca8a04"); r(c, 24, 6, 4, 24, "#ca8a04"); },
  [O.TV]: (c) => { r(c, 2, 4, 28, 20, "#111827"); r(c, 4, 6, 24, 16, "#0ea5e9"); r(c, 8, 10, 16, 2, "#f0f9ff"); r(c, 8, 14, 10, 2, "#f0f9ff"); r(c, 12, 24, 8, 2, "#374151"); r(c, 8, 26, 16, 3, "#374151"); },
  [O.PIANO]: (c) => { r(c, 1, 4, 30, 24, "#111827"); r(c, 3, 18, 26, 8, "#f9fafb"); for (let i = 0; i < 7; i++) r(c, 5 + i * 4, 18, 2, 5, "#111827"); r(c, 3, 6, 26, 8, "#1f2937"); },
  [O.FOUNTAIN]: (c) => { c.fillStyle = "#9ca3af"; c.beginPath(); c.arc(16, 18, 14, 0, Math.PI * 2); c.fill(); c.fillStyle = "#60a5fa"; c.beginPath(); c.arc(16, 18, 10, 0, Math.PI * 2); c.fill(); r(c, 14, 4, 4, 14, "#d1d5db"); r(c, 10, 2, 12, 3, "#93c5fd"); },
  [O.ARCADE]: (c) => { r(c, 4, 2, 24, 28, "#dc2626"); r(c, 7, 5, 18, 12, "#111827"); r(c, 9, 7, 14, 8, "#22d3ee"); r(c, 8, 20, 16, 6, "#1f2937"); r(c, 11, 22, 3, 3, "#facc15"); r(c, 18, 22, 3, 3, "#3b82f6"); },
};

/** Draws the whole tileset into a canvas. Tile id == tileset index. */
export function drawTileset(canvas: HTMLCanvasElement) {
  canvas.width = TILESET_COLS * TILE;
  canvas.height = TILESET_ROWS * TILE;
  const c = canvas.getContext("2d")!;
  c.imageSmoothingEnabled = false;
  const paint = (id: number, fn: (c: Ctx) => void) => {
    const x = (id % TILESET_COLS) * TILE;
    const y = Math.floor(id / TILESET_COLS) * TILE;
    c.save();
    c.translate(x, y);
    c.beginPath(); c.rect(0, 0, TILE, TILE); c.clip();
    fn(c);
    c.restore();
  };
  for (const [id, fn] of Object.entries(floorPainters)) paint(Number(id), fn);
  for (const [id, fn] of Object.entries(objectPainters)) paint(Number(id), fn);
  return canvas;
}

/** Representative colour per tile id, for the minimap. */
export const TILE_COLORS: Record<number, string> = {
  [F.NONE]: "#0f172a", [F.WOOD]: "#c89b6d", [F.WOOD_DARK]: "#7c4a2a", [F.CARPET_BLUE]: "#4f74c8", [F.CARPET_GREEN]: "#4fa36a",
  [F.CARPET_PURPLE]: "#7c5cc4", [F.RUG_RED]: "#c0504d", [F.STONE]: "#cfd3d8", [F.GRASS]: "#6abf5a", [F.PATH]: "#d9c7a0", [F.WATER]: "#3b82f6",
  [O.WALL]: "#6b7079", [O.DESK]: "#8b5a2b", [O.COMPUTER]: "#8b5a2b", [O.CHAIR]: "#475569", [O.BENCH]: "#9a6b3c", [O.PLANT]: "#16a34a",
  [O.TREE]: "#15803d", [O.FLOWERS]: "#f472b6", [O.TABLE]: "#a16207", [O.WHITEBOARD]: "#f9fafb", [O.BOOKSHELF]: "#78350f", [O.COFFEE]: "#1f2937",
  [O.SOFA]: "#7c3aed", [O.LAMP]: "#fde68a", [O.SPOTLIGHT]: "#facc15", [O.DOOR]: "#d6a85c", [O.FENCE]: "#a16207", [O.TV]: "#111827",
  [O.PIANO]: "#111827", [O.FOUNTAIN]: "#60a5fa", [O.ARCADE]: "#dc2626",
};
