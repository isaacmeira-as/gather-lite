import { F, O, isSolid, DIR_DELTA } from "./tiles";

export interface Zone {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

export type InteractableKind = "iframe" | "note" | "board" | "emote" | "link";

export interface Interactable {
  id: string;
  x: number;
  y: number;
  kind: InteractableKind;
  title: string;
  url?: string;
  text?: string;
  emote?: string;
}

export interface MapData {
  width: number;
  height: number;
  floor: number[];
  objects: number[];
  zones: Zone[];
  interactables: Interactable[];
  spawn: { x: number; y: number };
}

export const NEARBY_RADIUS = 4;

export const idx = (m: { width: number }, x: number, y: number) => y * m.width + x;

export function inBounds(m: MapData, x: number, y: number) {
  return x >= 0 && y >= 0 && x < m.width && y < m.height;
}

export function isWalkable(m: MapData, x: number, y: number) {
  if (!inBounds(m, x, y)) return false;
  const i = idx(m, x, y);
  return !isSolid(m.floor[i], m.objects[i]);
}

export function stepTarget(m: MapData, x: number, y: number, dir: number): { x: number; y: number } | null {
  const d = DIR_DELTA[dir];
  if (!d) return null;
  const nx = x + d[0];
  const ny = y + d[1];
  return isWalkable(m, nx, ny) ? { x: nx, y: ny } : null;
}

export function zoneAt(m: MapData, x: number, y: number): Zone | null {
  for (const z of m.zones) {
    if (x >= z.x && y >= z.y && x < z.x + z.w && y < z.y + z.h) return z;
  }
  return null;
}

export function distance(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(ax - bx, ay - by);
}

/** Players "hear" each other if they share a private zone, or if neither is in
 *  a zone and they're within NEARBY_RADIUS tiles. A zone wall blocks sound. */
export function canHear(m: MapData, a: { x: number; y: number }, b: { x: number; y: number }) {
  const za = zoneAt(m, a.x, a.y);
  const zb = zoneAt(m, b.x, b.y);
  if (za || zb) return za?.id === zb?.id;
  return distance(a.x, a.y, b.x, b.y) <= NEARBY_RADIUS;
}

export function isSpotlight(m: MapData, x: number, y: number) {
  return inBounds(m, x, y) && m.objects[idx(m, x, y)] === O.SPOTLIGHT;
}

export function interactableNear(m: MapData, x: number, y: number): Interactable | null {
  // Object on the player's tile or on any of the 4 neighbours.
  let best: Interactable | null = null;
  let bestD = Infinity;
  for (const it of m.interactables) {
    const d = Math.abs(it.x - x) + Math.abs(it.y - y);
    if (d <= 1 && d < bestD) {
      best = it;
      bestD = d;
    }
  }
  return best;
}

/** Breadth-first path over walkable tiles. Returns tile list excluding start, or null. */
export function findPath(m: MapData, sx: number, sy: number, tx: number, ty: number): { x: number; y: number }[] | null {
  if (!inBounds(m, tx, ty)) return null;
  const start = idx(m, sx, sy);
  const goal = idx(m, tx, ty);
  if (start === goal) return [];
  const prev = new Int32Array(m.width * m.height).fill(-1);
  const seen = new Uint8Array(m.width * m.height);
  const q: number[] = [start];
  seen[start] = 1;
  while (q.length) {
    const cur = q.shift()!;
    if (cur === goal) break;
    const cx = cur % m.width;
    const cy = (cur - cx) / m.width;
    for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(m, nx, ny)) continue;
      const ni = idx(m, nx, ny);
      if (seen[ni]) continue;
      if (ni !== goal && !isWalkable(m, nx, ny)) continue;
      seen[ni] = 1;
      prev[ni] = cur;
      q.push(ni);
    }
  }
  if (!seen[goal]) return null;
  const path: { x: number; y: number }[] = [];
  let cur = goal;
  while (cur !== start) {
    path.push({ x: cur % m.width, y: Math.floor(cur / m.width) });
    cur = prev[cur];
  }
  return path.reverse();
}

// ---------------------------------------------------------------------------
// Default office map, built procedurally so the repo ships no binary assets.
// ---------------------------------------------------------------------------
export function buildDefaultMap(): MapData {
  const width = 44;
  const height = 32;
  const floor = new Array(width * height).fill(F.GRASS);
  const objects = new Array(width * height).fill(O.NONE);
  const m: MapData = { width, height, floor, objects, zones: [], interactables: [], spawn: { x: 7, y: 7 } };

  const setF = (x: number, y: number, t: number) => { if (inBounds(m, x, y)) floor[idx(m, x, y)] = t; };
  const setO = (x: number, y: number, t: number) => { if (inBounds(m, x, y)) objects[idx(m, x, y)] = t; };
  const fillF = (x: number, y: number, w: number, h: number, t: number) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) setF(i, j, t);
  };
  const fillO = (x: number, y: number, w: number, h: number, t: number) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) setO(i, j, t);
  };
  const rectO = (x: number, y: number, w: number, h: number, t: number) => {
    for (let i = x; i < x + w; i++) { setO(i, y, t); setO(i, y + h - 1, t); }
    for (let j = y; j < y + h; j++) { setO(x, j, t); setO(x + w - 1, j, t); }
  };

  // Building shell
  fillF(2, 2, 32, 23, F.WOOD);
  rectO(2, 2, 32, 23, O.WALL);

  // Lobby
  fillF(3, 3, 10, 7, F.STONE);
  setO(5, 4, O.DESK); setO(6, 4, O.DESK); setO(7, 4, O.COMPUTER);
  setO(3, 3, O.PLANT); setO(12, 3, O.PLANT);
  setO(3, 9, O.PLANT); setO(12, 9, O.PLANT);
  setO(10, 6, O.SOFA); setO(11, 6, O.SOFA);

  // Meeting room A (private)
  rectO(13, 2, 9, 9, O.WALL);
  fillF(14, 3, 7, 7, F.CARPET_BLUE);
  setO(17, 10, O.DOOR);
  fillO(16, 5, 3, 2, O.TABLE);
  setO(15, 5, O.CHAIR); setO(15, 6, O.CHAIR); setO(19, 5, O.CHAIR); setO(19, 6, O.CHAIR);
  setO(16, 4, O.CHAIR); setO(17, 4, O.CHAIR); setO(18, 4, O.CHAIR);
  setO(16, 7, O.CHAIR); setO(17, 7, O.CHAIR); setO(18, 7, O.CHAIR);
  setO(17, 3, O.WHITEBOARD); setO(14, 3, O.PLANT);
  m.zones.push({ id: "sala-a", name: "Sala Jacarandá", x: 14, y: 3, w: 7, h: 7, color: "#3b82f6" });

  // Meeting room B (private)
  rectO(22, 2, 12, 9, O.WALL);
  fillF(23, 3, 10, 7, F.CARPET_GREEN);
  setO(27, 10, O.DOOR);
  fillO(26, 5, 4, 2, O.TABLE);
  setO(25, 5, O.CHAIR); setO(25, 6, O.CHAIR); setO(30, 5, O.CHAIR); setO(30, 6, O.CHAIR);
  for (let i = 26; i < 30; i++) { setO(i, 4, O.CHAIR); setO(i, 7, O.CHAIR); }
  setO(28, 3, O.TV); setO(23, 3, O.PLANT); setO(32, 3, O.PLANT);
  m.zones.push({ id: "sala-b", name: "Sala Ipê", x: 23, y: 3, w: 10, h: 7, color: "#22c55e" });

  // Open desk area
  for (let row = 0; row < 2; row++) {
    const y = 12 + row * 3;
    for (let col = 0; col < 4; col++) {
      const x = 4 + col * 4;
      setO(x, y, O.COMPUTER); setO(x + 1, y, O.DESK);
      setO(x, y + 1, O.CHAIR); setO(x + 1, y + 1, O.CHAIR);
    }
  }
  setO(3, 11, O.BOOKSHELF); setO(4, 11, O.BOOKSHELF); setO(5, 11, O.BOOKSHELF);
  setO(19, 11, O.PLANT); setO(3, 17, O.PLANT);

  // Lounge
  fillF(22, 11, 11, 7, F.RUG_RED);
  setO(23, 12, O.SOFA); setO(24, 12, O.SOFA); setO(25, 12, O.SOFA);
  setO(23, 15, O.SOFA); setO(24, 15, O.SOFA); setO(25, 15, O.SOFA);
  setO(24, 13, O.TABLE);
  setO(31, 12, O.COFFEE); setO(32, 12, O.COFFEE);
  setO(31, 16, O.PIANO); setO(28, 11, O.ARCADE); setO(29, 11, O.ARCADE);
  setO(32, 14, O.LAMP); setO(22, 17, O.PLANT);
  setO(33, 14, O.DOOR); // door to the garden (east wall)

  // Auditorium / stage
  fillF(3, 19, 31, 5, F.CARPET_PURPLE);
  fillF(14, 19, 7, 2, F.WOOD_DARK);
  setO(17, 19, O.SPOTLIGHT);
  setO(14, 19, O.LAMP); setO(20, 19, O.LAMP);
  for (let i = 5; i <= 12; i += 2) { setO(i, 21, O.BENCH); setO(i, 23, O.BENCH); }
  for (let i = 22; i <= 29; i += 2) { setO(i, 21, O.BENCH); setO(i, 23, O.BENCH); }
  setO(17, 24, O.DOOR); // door to the south garden

  // Focus booths (tiny private zones)
  const booths = [[3, 19], [31, 19], [3, 22], [31, 22]] as const;
  booths.forEach(([bx, by], n) => {
    fillF(bx, by, 2, 2, F.CARPET_BLUE);
    setO(bx, by, O.LAMP); setO(bx + 1, by + 1, O.CHAIR);
    m.zones.push({ id: `cabine-${n + 1}`, name: `Cabine ${n + 1}`, x: bx, y: by, w: 2, h: 2, color: "#f59e0b" });
  });

  // Garden (east + south)
  fillF(34, 14, 8, 1, F.PATH);
  fillF(38, 2, 1, 28, F.PATH);
  fillF(17, 25, 1, 5, F.PATH);
  fillF(17, 29, 22, 1, F.PATH);
  fillF(35, 4, 3, 3, F.WATER);
  setO(40, 6, O.FOUNTAIN);
  setO(36, 16, O.BENCH); setO(40, 16, O.BENCH);
  for (const [tx, ty] of [[35, 9], [41, 10], [36, 20], [41, 22], [35, 26], [42, 28], [5, 27], [11, 28], [25, 27], [31, 26], [2, 30], [42, 2], [34, 31]]) setO(tx, ty, O.TREE);
  for (const [fx, fy] of [[36, 12], [40, 12], [37, 18], [39, 24], [8, 26], [22, 26], [28, 28], [14, 27]]) setO(fx, fy, O.FLOWERS);
  fillO(0, 0, width, 1, O.FENCE);
  fillO(0, height - 1, width, 1, O.FENCE);
  fillO(0, 0, 1, height, O.FENCE);
  fillO(width - 1, 0, 1, height, O.FENCE);
  m.zones.push({ id: "jardim-bancos", name: "Banquinhos do jardim", x: 36, y: 15, w: 5, h: 2, color: "#84cc16" });

  // Interactables
  m.interactables.push(
    { id: "recepcao", x: 6, y: 4, kind: "note", title: "Recepção", text: "Bem-vindo ao escritório virtual!\n\nUse as setas ou WASD para andar, X para interagir, Enter para falar.\nAs salas coloridas são zonas privadas: só quem está dentro ouve a conversa." },
    { id: "whiteboard-a", x: 17, y: 3, kind: "board", title: "Quadro da Sala Jacarandá" },
    { id: "tv-b", x: 28, y: 3, kind: "iframe", title: "TV da Sala Ipê", url: "https://www.youtube.com/embed/jfKfPfyJRdk" },
    { id: "estante", x: 4, y: 11, kind: "note", title: "Estante", text: "📚 Documentação do time\n\n- Rituais semanais às segundas 10h\n- Deploy em produção só com dois reviewers\n- Café é por conta da casa" },
    { id: "cafe", x: 31, y: 12, kind: "emote", title: "Máquina de café", emote: "☕" },
    { id: "piano", x: 31, y: 16, kind: "emote", title: "Piano", emote: "🎵" },
    { id: "arcade", x: 28, y: 11, kind: "iframe", title: "Arcade", url: "https://excalidraw.com" },
    { id: "fonte", x: 40, y: 6, kind: "emote", title: "Fonte", emote: "💧" },
    { id: "palco", x: 17, y: 19, kind: "note", title: "Spotlight", text: "Quem fica neste tile fala com TODO o escritório, independentemente de distância ou zona." },
    { id: "quadro-geral", x: 29, y: 11, kind: "board", title: "Mural de avisos" },
  );

  return m;
}
