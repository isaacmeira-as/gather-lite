import { TILE, F, O } from "../../shared/tiles";

export const TILESET_COLS = 16;
export const TILESET_ROWS = 4;
/** Render-only tile ids (never stored in the map). */
export const V = { WALL_FACE: 48, WATER_B: 49, FOUNTAIN_B: 50, COMPUTER_B: 51, ARCADE_B: 52, SPOTLIGHT_B: 53, WALL_TOP_END: 54, GRASS_B: 55, GRASS_C: 56, WOOD_B: 57, STONE_B: 58, CARPET_BLUE_B: 59, PATH_B: 60 } as const;

type Ctx = CanvasRenderingContext2D;
const r = (c: Ctx, x: number, y: number, w: number, h: number, color: string) => { c.fillStyle = color; c.fillRect(x, y, w, h); };
const shadow = (c: Ctx, x = 4, y = 24, w = 24, h = 7) => { c.fillStyle = "rgba(0,0,0,0.22)"; c.beginPath(); c.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); c.fill(); };
const outline = (c: Ctx, x: number, y: number, w: number, h: number, color = "#1f1a17") => { c.fillStyle = color; c.fillRect(x - 1, y - 1, w + 2, 1); c.fillRect(x - 1, y + h, w + 2, 1); c.fillRect(x - 1, y, 1, h); c.fillRect(x + w, y, 1, h); };
const box = (c: Ctx, x: number, y: number, w: number, h: number, fill: string, top: string, side: string) => { outline(c, x, y, w, h); r(c, x, y, w, h, fill); r(c, x, y, w, 3, top); r(c, x, y + h - 3, w, 3, side); };

function noise(seed: number) { let s = seed; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }

function carpet(c: Ctx, base: string, dark: string, light: string, seed: number) {
  r(c, 0, 0, 32, 32, base);
  const n = noise(seed);
  for (let i = 0; i < 40; i++) r(c, Math.floor(n() * 32), Math.floor(n() * 32), 2, 1, n() > 0.5 ? dark : light);
}
function planks(c: Ctx, base: string, line: string, hi: string, offset: number) {
  r(c, 0, 0, 32, 32, base);
  for (let i = 0; i < 4; i++) {
    r(c, 0, i * 8, 32, 1, line);
    r(c, ((i + offset) % 2) * 16, i * 8 + 1, 1, 7, line);
    r(c, ((i + offset) % 2) * 16 + 3, i * 8 + 3, 9, 1, hi);
  }
}

const floorPainters: Record<number, (c: Ctx) => void> = {
  [F.NONE]: (c) => r(c, 0, 0, 32, 32, "#0b1220"),
  [F.WOOD]: (c) => planks(c, "#c99a6b", "#a2743f", "#dcb184", 0),
  [F.WOOD_DARK]: (c) => planks(c, "#7a4a2b", "#5a3219", "#8f5c38", 1),
  [F.CARPET_BLUE]: (c) => carpet(c, "#4d6fc3", "#4262b1", "#5a7bcf", 1),
  [F.CARPET_GREEN]: (c) => carpet(c, "#4c9f66", "#42905a", "#5aae74", 2),
  [F.CARPET_PURPLE]: (c) => carpet(c, "#7558bd", "#684cab", "#8468ca", 3),
  [F.RUG_RED]: (c) => { carpet(c, "#b94d4a", "#a3403e", "#c75c58", 4); r(c, 0, 0, 32, 2, "#e4b762"); r(c, 0, 30, 32, 2, "#e4b762"); r(c, 0, 4, 32, 1, "#e4b76288"); r(c, 0, 27, 32, 1, "#e4b76288"); },
  [F.STONE]: (c) => {
    r(c, 0, 0, 32, 32, "#d3d7dc");
    r(c, 0, 0, 32, 1, "#b4b9c0"); r(c, 0, 0, 1, 32, "#b4b9c0"); r(c, 16, 0, 1, 16, "#b4b9c0"); r(c, 0, 16, 32, 1, "#b4b9c0"); r(c, 8, 16, 1, 16, "#b4b9c0");
    r(c, 1, 1, 15, 1, "#e6e9ec"); r(c, 17, 1, 15, 1, "#e6e9ec"); r(c, 1, 17, 7, 1, "#e6e9ec"); r(c, 9, 17, 23, 1, "#e6e9ec");
  },
  [F.GRASS]: (c) => {
    r(c, 0, 0, 32, 32, "#6cbd5c");
    const n = noise(7);
    for (let i = 0; i < 22; i++) { const x = Math.floor(n() * 30), y = Math.floor(n() * 30); r(c, x, y, 1, 3, n() > 0.5 ? "#59a84b" : "#7fcf6e"); r(c, x + 1, y + 1, 1, 2, "#59a84b"); }
  },
  [F.PATH]: (c) => {
    r(c, 0, 0, 32, 32, "#dac89f");
    const n = noise(11);
    for (let i = 0; i < 12; i++) r(c, Math.floor(n() * 28), Math.floor(n() * 28), 3, 2, n() > 0.5 ? "#c8b58a" : "#e6d6b0");
  },
  [F.WATER]: (c) => { r(c, 0, 0, 32, 32, "#3d86f0"); r(c, 3, 6, 10, 2, "#9cc8fd"); r(c, 18, 14, 9, 2, "#9cc8fd"); r(c, 8, 24, 12, 2, "#67a7f7"); r(c, 22, 26, 6, 1, "#9cc8fd"); },
};

const objectPainters: Record<number, (c: Ctx) => void> = {
  [O.WALL]: (c) => { // wall TOP (cap)
    r(c, 0, 0, 32, 32, "#6b7280"); r(c, 1, 1, 30, 30, "#9aa3b0"); r(c, 1, 1, 30, 2, "#b7bec8"); r(c, 1, 1, 2, 30, "#b7bec8"); r(c, 1, 29, 30, 2, "#7d8694"); r(c, 29, 1, 2, 30, "#7d8694");
  },
  [V.WALL_FACE]: (c) => { // wall FACE (front)
    r(c, 0, 0, 32, 32, "#cfc6b8");
    for (let y = 0; y < 32; y += 8) { r(c, 0, y + 7, 32, 1, "#b3a996"); r(c, (y / 8) % 2 ? 16 : 0, y, 1, 7, "#b3a996"); r(c, (y / 8) % 2 ? 17 : 1, y + 1, 13, 1, "#e0d8ca"); }
    r(c, 0, 0, 32, 2, "#8a8f97"); r(c, 0, 29, 32, 3, "#8c6a3e");
  },
  [V.WALL_TOP_END]: (c) => { r(c, 0, 0, 32, 32, "#6b7280"); r(c, 1, 1, 30, 30, "#9aa3b0"); },
  [O.WINDOW]: (c) => { objectPainters[V.WALL_FACE](c); outline(c, 6, 5, 20, 18, "#4b3a26"); r(c, 6, 5, 20, 18, "#7fb7e8"); r(c, 7, 6, 18, 8, "#bfe0fa"); r(c, 15, 5, 2, 18, "#4b3a26"); r(c, 6, 13, 20, 2, "#4b3a26"); r(c, 4, 23, 24, 2, "#e9e1d3"); },
  [O.PAINTING]: (c) => { objectPainters[V.WALL_FACE](c); outline(c, 7, 6, 18, 14, "#5b3a1a"); r(c, 7, 6, 18, 14, "#8a5a2b"); r(c, 9, 8, 14, 10, "#dbe9f7"); r(c, 9, 13, 14, 5, "#6abd5c"); r(c, 12, 10, 4, 3, "#f5c542"); r(c, 17, 11, 6, 3, "#4f8bd6"); },
  [O.WHITEBOARD]: (c) => { objectPainters[V.WALL_FACE](c); outline(c, 3, 5, 26, 18, "#4b5563"); r(c, 3, 5, 26, 18, "#9ca3af"); r(c, 5, 7, 22, 14, "#f9fafb"); r(c, 8, 10, 12, 2, "#3b82f6"); r(c, 8, 14, 16, 2, "#ef4444"); r(c, 8, 18, 8, 2, "#22c55e"); r(c, 10, 24, 12, 2, "#6b7280"); },
  [O.TV]: (c) => { objectPainters[V.WALL_FACE](c); outline(c, 3, 5, 26, 17, "#000"); r(c, 3, 5, 26, 17, "#111827"); r(c, 5, 7, 22, 13, "#0ea5e9"); r(c, 8, 10, 16, 2, "#f0f9ff"); r(c, 8, 14, 10, 2, "#f0f9ff"); r(c, 13, 23, 6, 2, "#374151"); },
  [O.SIGN]: (c) => { objectPainters[V.WALL_FACE](c); outline(c, 5, 8, 22, 12, "#3b2a1a"); r(c, 5, 8, 22, 12, "#f5e6c8"); r(c, 8, 11, 16, 2, "#3b2a1a"); r(c, 8, 15, 10, 2, "#3b2a1a"); },
  [O.DESK]: (c) => { shadow(c, 2, 25, 28, 7); box(c, 1, 6, 30, 20, "#9a6232", "#b57a44", "#6e4320"); r(c, 3, 26, 4, 5, "#5a3417"); r(c, 25, 26, 4, 5, "#5a3417"); r(c, 20, 10, 8, 5, "#f3f4f6"); r(c, 21, 11, 6, 1, "#9ca3af"); r(c, 21, 13, 4, 1, "#9ca3af"); },
  [O.COMPUTER]: (c) => { objectPainters[O.DESK](c); r(c, 20, 10, 8, 5, "#9a6232"); outline(c, 8, 3, 16, 12, "#111"); r(c, 8, 3, 16, 12, "#1f2937"); r(c, 10, 5, 12, 8, "#38bdf8"); r(c, 11, 6, 6, 1, "#e0f2fe"); r(c, 11, 8, 9, 1, "#e0f2fe"); r(c, 14, 15, 4, 3, "#374151"); r(c, 10, 18, 12, 2, "#374151"); r(c, 9, 21, 14, 3, "#e5e7eb"); r(c, 10, 22, 12, 1, "#9ca3af"); },
  [V.COMPUTER_B]: (c) => { objectPainters[O.COMPUTER](c); r(c, 10, 5, 12, 8, "#0ea5e9"); r(c, 11, 6, 8, 1, "#e0f2fe"); r(c, 11, 8, 5, 1, "#e0f2fe"); r(c, 11, 10, 7, 1, "#e0f2fe"); },
  [O.CHAIR]: (c) => { shadow(c, 6, 24, 20, 7); outline(c, 8, 4, 16, 10, "#111827"); r(c, 8, 4, 16, 10, "#374151"); r(c, 10, 6, 12, 6, "#4b5563"); outline(c, 6, 14, 20, 10, "#111827"); r(c, 6, 14, 20, 10, "#4b5563"); r(c, 8, 16, 16, 4, "#5b6676"); r(c, 8, 24, 3, 6, "#1e293b"); r(c, 21, 24, 3, 6, "#1e293b"); r(c, 14, 24, 4, 4, "#1e293b"); },
  [O.BENCH]: (c) => { shadow(c, 2, 22, 28, 7); box(c, 2, 10, 28, 8, "#a87340", "#c08a52", "#7a512a"); r(c, 2, 13, 28, 1, "#7a512a"); r(c, 4, 18, 4, 8, "#5c3a1a"); r(c, 24, 18, 4, 8, "#5c3a1a"); },
  [O.PLANT]: (c) => { shadow(c, 7, 25, 18, 6); outline(c, 10, 22, 12, 9, "#5a2d0c"); r(c, 10, 22, 12, 9, "#b45309"); r(c, 10, 22, 12, 2, "#d97706"); r(c, 12, 20, 8, 2, "#7c2d12"); r(c, 8, 6, 16, 14, "#16a34a"); r(c, 4, 10, 8, 8, "#22c55e"); r(c, 20, 8, 8, 8, "#15803d"); r(c, 14, 2, 6, 8, "#22c55e"); r(c, 10, 8, 3, 3, "#4ade80"); r(c, 16, 12, 3, 3, "#4ade80"); },
  [O.CACTUS]: (c) => { shadow(c, 8, 26, 16, 5); outline(c, 11, 24, 10, 7, "#5a2d0c"); r(c, 11, 24, 10, 7, "#c2410c"); r(c, 11, 24, 10, 2, "#ea580c"); r(c, 13, 6, 6, 18, "#16a34a"); r(c, 8, 10, 4, 8, "#16a34a"); r(c, 8, 10, 5, 2, "#16a34a"); r(c, 20, 13, 4, 7, "#16a34a"); r(c, 14, 8, 1, 14, "#4ade80"); r(c, 15, 6, 2, 2, "#f472b6"); },
  [O.TREE]: (c) => { shadow(c, 4, 25, 24, 7); r(c, 13, 18, 6, 13, "#6b3f1f"); r(c, 14, 18, 2, 13, "#8a5330"); outline(c, 4, 2, 24, 20, "#0f4d22"); r(c, 4, 2, 24, 20, "#15803d"); r(c, 8, 0, 16, 8, "#16a34a"); r(c, 2, 10, 8, 8, "#22c55e"); r(c, 22, 12, 8, 8, "#166534"); r(c, 10, 6, 4, 3, "#4ade80"); r(c, 18, 4, 3, 3, "#4ade80"); r(c, 6, 14, 3, 3, "#4ade80"); },
  [O.FLOWERS]: (c) => { for (const [x, y, col] of [[4, 6, "#f472b6"], [16, 4, "#facc15"], [24, 14, "#fb7185"], [8, 20, "#a78bfa"], [20, 24, "#f97316"]] as const) { r(c, x, y + 4, 2, 6, "#15803d"); r(c, x - 2, y, 6, 5, col); r(c, x, y + 1, 2, 2, "#fef3c7"); } },
  [O.TABLE]: (c) => { shadow(c, 2, 24, 28, 8); box(c, 2, 4, 28, 22, "#b8781a", "#d49a2e", "#8a5a12"); r(c, 4, 7, 24, 16, "#c98b22"); r(c, 4, 26, 4, 4, "#713f12"); r(c, 24, 26, 4, 4, "#713f12"); },
  [O.BOOKSHELF]: (c) => {
    outline(c, 1, 1, 30, 30, "#3b1d05"); r(c, 1, 1, 30, 30, "#7c3f12"); r(c, 3, 3, 26, 12, "#3f1d06"); r(c, 3, 17, 26, 12, "#3f1d06");
    const cols = ["#ef4444", "#3b82f6", "#facc15", "#22c55e", "#a855f7", "#f97316"];
    for (let i = 0; i < 6; i++) { r(c, 4 + i * 4, 4 + (i % 2), 3, 11 - (i % 2), cols[i]); r(c, 4 + i * 4, 18 + ((i + 1) % 2), 3, 11 - ((i + 1) % 2), cols[(i + 2) % 6]); r(c, 5 + i * 4, 6, 1, 2, "#ffffff88"); }
  },
  [O.LOCKER]: (c) => { outline(c, 3, 1, 26, 30, "#1e3a5f"); r(c, 3, 1, 26, 30, "#3b6ea5"); r(c, 3, 1, 26, 3, "#5b8fc9"); r(c, 16, 1, 1, 30, "#1e3a5f"); r(c, 6, 5, 7, 2, "#1e3a5f"); r(c, 19, 5, 7, 2, "#1e3a5f"); r(c, 12, 14, 2, 4, "#d1d5db"); r(c, 18, 14, 2, 4, "#d1d5db"); },
  [O.COFFEE]: (c) => { shadow(c, 2, 25, 28, 7); box(c, 1, 8, 30, 18, "#9a6232", "#b57a44", "#6e4320"); outline(c, 8, 2, 16, 20, "#000"); r(c, 8, 2, 16, 20, "#1f2937"); r(c, 10, 4, 12, 6, "#ef4444"); r(c, 12, 5, 8, 1, "#fca5a5"); r(c, 13, 14, 6, 6, "#f9fafb"); r(c, 14, 15, 4, 2, "#78350f"); r(c, 12, 20, 8, 2, "#9ca3af"); },
  [O.KITCHEN]: (c) => { box(c, 1, 6, 30, 22, "#e5e7eb", "#f9fafb", "#9ca3af"); r(c, 1, 9, 30, 1, "#9ca3af"); r(c, 15, 10, 1, 18, "#9ca3af"); r(c, 6, 18, 5, 2, "#6b7280"); r(c, 21, 18, 5, 2, "#6b7280"); r(c, 18, 2, 10, 6, "#374151"); r(c, 19, 3, 8, 4, "#9ca3af"); r(c, 4, 2, 8, 5, "#fbbf24"); r(c, 5, 3, 6, 3, "#f59e0b"); },
  [O.FRIDGE]: (c) => { outline(c, 5, 1, 22, 30, "#4b5563"); r(c, 5, 1, 22, 30, "#e5e7eb"); r(c, 5, 1, 22, 3, "#f9fafb"); r(c, 5, 12, 22, 1, "#9ca3af"); r(c, 22, 5, 2, 5, "#6b7280"); r(c, 22, 15, 2, 9, "#6b7280"); r(c, 8, 4, 6, 6, "#fde68a"); r(c, 8, 16, 6, 4, "#a7f3d0"); },
  [O.PRINTER]: (c) => { shadow(c, 2, 25, 28, 7); box(c, 1, 8, 30, 18, "#9a6232", "#b57a44", "#6e4320"); outline(c, 6, 6, 20, 14, "#1f2937"); r(c, 6, 6, 20, 14, "#d1d5db"); r(c, 8, 8, 16, 3, "#9ca3af"); r(c, 10, 3, 12, 4, "#f9fafb"); r(c, 20, 14, 4, 3, "#22c55e"); r(c, 8, 14, 8, 3, "#374151"); },
  [O.WATER_COOLER]: (c) => { shadow(c, 8, 26, 16, 5); outline(c, 10, 14, 12, 16, "#374151"); r(c, 10, 14, 12, 16, "#d1d5db"); r(c, 12, 18, 3, 3, "#3b82f6"); r(c, 17, 18, 3, 3, "#ef4444"); outline(c, 9, 2, 14, 12, "#1e40af"); r(c, 9, 2, 14, 12, "#60a5fa"); r(c, 11, 4, 4, 8, "#bfdbfe"); r(c, 11, 2, 10, 2, "#93c5fd"); },
  [O.VENDING]: (c) => { outline(c, 4, 1, 24, 30, "#7f1d1d"); r(c, 4, 1, 24, 30, "#dc2626"); r(c, 6, 4, 14, 20, "#111827"); for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) r(c, 8 + x * 4, 6 + y * 6, 3, 4, ["#facc15", "#3b82f6", "#22c55e", "#f97316", "#a855f7", "#06b6d4", "#ec4899", "#84cc16", "#f43f5e"][y * 3 + x]); r(c, 22, 6, 4, 6, "#f9fafb"); r(c, 22, 14, 4, 2, "#1f2937"); r(c, 6, 25, 18, 3, "#1f2937"); },
  [O.SOFA]: (c) => { shadow(c, 1, 25, 30, 7); outline(c, 1, 6, 30, 22, "#3b1a7a"); r(c, 1, 6, 30, 22, "#7c3aed"); r(c, 1, 6, 30, 6, "#6d28d9"); r(c, 4, 12, 24, 10, "#8b5cf6"); r(c, 5, 13, 11, 4, "#a78bfa"); r(c, 1, 12, 4, 14, "#6d28d9"); r(c, 27, 12, 4, 14, "#6d28d9"); },
  [O.LAMP]: (c) => { shadow(c, 8, 28, 16, 4); r(c, 14, 10, 4, 20, "#374151"); r(c, 15, 10, 1, 20, "#6b7280"); r(c, 10, 28, 12, 3, "#1f2937"); outline(c, 6, 2, 20, 10, "#b45309"); r(c, 6, 2, 20, 10, "#fde68a"); r(c, 8, 4, 16, 6, "#fef3c7"); r(c, 9, 5, 5, 2, "#ffffff"); },
  [O.SPOTLIGHT]: (c) => { c.fillStyle = "rgba(250,204,21,0.30)"; c.beginPath(); c.arc(16, 16, 14, 0, Math.PI * 2); c.fill(); c.strokeStyle = "#facc15"; c.lineWidth = 2; c.beginPath(); c.arc(16, 16, 12, 0, Math.PI * 2); c.stroke(); r(c, 14, 8, 4, 10, "#facc15"); r(c, 14, 20, 4, 4, "#facc15"); },
  [V.SPOTLIGHT_B]: (c) => { c.fillStyle = "rgba(250,204,21,0.42)"; c.beginPath(); c.arc(16, 16, 15, 0, Math.PI * 2); c.fill(); c.strokeStyle = "#fde68a"; c.lineWidth = 2; c.beginPath(); c.arc(16, 16, 10, 0, Math.PI * 2); c.stroke(); r(c, 14, 8, 4, 10, "#fde68a"); r(c, 14, 20, 4, 4, "#fde68a"); },
  [O.DOOR]: (c) => { planks(c, "#c99a6b", "#a2743f", "#dcb184", 0); r(c, 2, 0, 28, 3, "#6b3f1f"); r(c, 2, 29, 28, 3, "#6b3f1f"); r(c, 2, 3, 2, 26, "#6b3f1f88"); r(c, 28, 3, 2, 26, "#6b3f1f88"); r(c, 10, 3, 12, 26, "#d9b47a66"); },
  [O.FENCE]: (c) => { r(c, 0, 12, 32, 4, "#a16207"); r(c, 0, 22, 32, 4, "#a16207"); r(c, 0, 12, 32, 1, "#ca8a04"); r(c, 0, 22, 32, 1, "#ca8a04"); r(c, 4, 6, 4, 24, "#b8771a"); r(c, 24, 6, 4, 24, "#b8771a"); r(c, 4, 6, 4, 1, "#e3a92e"); r(c, 24, 6, 4, 1, "#e3a92e"); r(c, 4, 29, 4, 1, "#6b4106"); r(c, 24, 29, 4, 1, "#6b4106"); },
  [O.PIANO]: (c) => { shadow(c, 1, 25, 30, 7); outline(c, 1, 4, 30, 24, "#000"); r(c, 1, 4, 30, 24, "#111827"); r(c, 2, 5, 28, 2, "#374151"); r(c, 3, 18, 26, 8, "#f9fafb"); for (let i = 0; i < 7; i++) r(c, 5 + i * 4, 18, 2, 5, "#111827"); r(c, 3, 8, 26, 8, "#1f2937"); r(c, 8, 10, 16, 3, "#f3f4f6"); },
  [O.FOUNTAIN]: (c) => { shadow(c, 2, 26, 28, 6); c.fillStyle = "#9ca3af"; c.beginPath(); c.arc(16, 18, 14, 0, Math.PI * 2); c.fill(); c.fillStyle = "#6b7280"; c.beginPath(); c.arc(16, 18, 12, 0, Math.PI * 2); c.fill(); c.fillStyle = "#60a5fa"; c.beginPath(); c.arc(16, 18, 10, 0, Math.PI * 2); c.fill(); r(c, 8, 15, 5, 1, "#bfdbfe"); r(c, 19, 21, 5, 1, "#bfdbfe"); r(c, 14, 4, 4, 14, "#d1d5db"); r(c, 10, 2, 12, 3, "#93c5fd"); r(c, 12, 0, 8, 2, "#bfdbfe"); },
  [V.FOUNTAIN_B]: (c) => { objectPainters[O.FOUNTAIN](c); r(c, 10, 14, 4, 1, "#dbeafe"); r(c, 20, 17, 4, 1, "#dbeafe"); r(c, 9, 1, 2, 2, "#dbeafe"); r(c, 21, 2, 2, 2, "#dbeafe"); r(c, 12, 0, 8, 2, "#93c5fd"); },
  [O.ARCADE]: (c) => { shadow(c, 4, 27, 24, 5); outline(c, 4, 2, 24, 28, "#7f1d1d"); r(c, 4, 2, 24, 28, "#dc2626"); r(c, 4, 2, 24, 3, "#f87171"); r(c, 7, 6, 18, 12, "#111827"); r(c, 9, 8, 14, 8, "#22d3ee"); r(c, 11, 10, 3, 3, "#f472b6"); r(c, 17, 12, 3, 3, "#facc15"); r(c, 8, 20, 16, 6, "#1f2937"); r(c, 11, 22, 3, 3, "#facc15"); r(c, 18, 22, 3, 3, "#3b82f6"); },
  [V.ARCADE_B]: (c) => { objectPainters[O.ARCADE](c); r(c, 9, 8, 14, 8, "#0891b2"); r(c, 13, 9, 3, 3, "#f472b6"); r(c, 15, 13, 3, 3, "#facc15"); },
  [O.RUG_ROUND]: (c) => { c.fillStyle = "#c2410c"; c.beginPath(); c.ellipse(16, 16, 15, 13, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = "#ea580c"; c.beginPath(); c.ellipse(16, 16, 11, 9, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = "#fdba74"; c.beginPath(); c.ellipse(16, 16, 5, 4, 0, 0, Math.PI * 2); c.fill(); },
};
objectPainters[V.GRASS_B] = (c) => { floorPainters[F.GRASS](c); r(c, 6, 20, 2, 2, "#f472b6"); r(c, 22, 8, 2, 2, "#facc15"); r(c, 14, 26, 1, 3, "#3f8f33"); };
objectPainters[V.GRASS_C] = (c) => { r(c, 0, 0, 32, 32, "#65b556"); const n = noise(19); for (let i = 0; i < 26; i++) { const x = Math.floor(n() * 30), y = Math.floor(n() * 30); r(c, x, y, 1, 3, n() > 0.5 ? "#55a047" : "#79c868"); } r(c, 10, 12, 3, 2, "#4f9a43"); r(c, 20, 22, 3, 2, "#4f9a43"); };
objectPainters[V.WOOD_B] = (c) => { planks(c, "#c4956a", "#9d6f3b", "#d6ab7e", 1); r(c, 9, 12, 6, 1, "#b0804e"); r(c, 20, 27, 5, 1, "#b0804e"); };
objectPainters[V.STONE_B] = (c) => { floorPainters[F.STONE](c); r(c, 20, 6, 6, 1, "#c3c8cf"); r(c, 4, 22, 5, 1, "#c3c8cf"); r(c, 11, 9, 2, 2, "#c9ced4"); };
objectPainters[V.CARPET_BLUE_B] = (c) => { carpet(c, "#4b6cbf", "#4262b1", "#5a7bcf", 9); };
objectPainters[V.PATH_B] = (c) => { r(c, 0, 0, 32, 32, "#d6c39a"); const n = noise(23); for (let i = 0; i < 14; i++) r(c, Math.floor(n() * 28), Math.floor(n() * 28), 3, 2, n() > 0.5 ? "#c4b086" : "#e3d2aa"); };
objectPainters[V.WATER_B] = (c) => { r(c, 0, 0, 32, 32, "#3d86f0"); r(c, 5, 8, 10, 2, "#9cc8fd"); r(c, 16, 16, 9, 2, "#9cc8fd"); r(c, 6, 26, 12, 2, "#67a7f7"); r(c, 24, 4, 6, 1, "#9cc8fd"); };

/** Draws the whole tileset into a canvas. Tile id == tileset index. */
export function drawTileset(canvas: HTMLCanvasElement) {
  canvas.width = TILESET_COLS * TILE;
  canvas.height = TILESET_ROWS * TILE;
  const c = canvas.getContext("2d")!;
  c.imageSmoothingEnabled = false;
  const paint = (id: number, fn: (c: Ctx) => void) => {
    c.save();
    c.translate((id % TILESET_COLS) * TILE, Math.floor(id / TILESET_COLS) * TILE);
    c.beginPath(); c.rect(0, 0, TILE, TILE); c.clip();
    fn(c);
    c.restore();
  };
  for (const [id, fn] of Object.entries(floorPainters)) paint(Number(id), fn);
  for (const [id, fn] of Object.entries(objectPainters)) paint(Number(id), fn);
  return canvas;
}

/** Representative colour per tile id, for the minimap and thumbnails. */
export const TILE_COLORS: Record<number, string> = {
  [F.NONE]: "#0b1220", [F.WOOD]: "#c99a6b", [F.WOOD_DARK]: "#7a4a2b", [F.CARPET_BLUE]: "#4d6fc3", [F.CARPET_GREEN]: "#4c9f66",
  [F.CARPET_PURPLE]: "#7558bd", [F.RUG_RED]: "#b94d4a", [F.STONE]: "#d3d7dc", [F.GRASS]: "#6cbd5c", [F.PATH]: "#dac89f", [F.WATER]: "#3d86f0",
  [O.WALL]: "#6b7280", [O.DESK]: "#9a6232", [O.COMPUTER]: "#9a6232", [O.CHAIR]: "#4b5563", [O.BENCH]: "#a87340", [O.PLANT]: "#16a34a",
  [O.TREE]: "#15803d", [O.FLOWERS]: "#f472b6", [O.TABLE]: "#b8781a", [O.WHITEBOARD]: "#f9fafb", [O.BOOKSHELF]: "#7c3f12", [O.COFFEE]: "#1f2937",
  [O.SOFA]: "#7c3aed", [O.LAMP]: "#fde68a", [O.SPOTLIGHT]: "#facc15", [O.DOOR]: "#d9b47a", [O.FENCE]: "#a16207", [O.TV]: "#111827",
  [O.PIANO]: "#111827", [O.FOUNTAIN]: "#60a5fa", [O.ARCADE]: "#dc2626", [O.WINDOW]: "#7fb7e8", [O.KITCHEN]: "#e5e7eb", [O.FRIDGE]: "#e5e7eb",
  [O.PRINTER]: "#d1d5db", [O.WATER_COOLER]: "#60a5fa", [O.RUG_ROUND]: "#ea580c", [O.SIGN]: "#f5e6c8", [O.VENDING]: "#dc2626", [O.CACTUS]: "#16a34a",
  [O.PAINTING]: "#8a5a2b", [O.LOCKER]: "#3b6ea5",
};
