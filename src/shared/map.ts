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

export type InteractableKind = "iframe" | "note" | "board" | "emote" | "link" | "poll" | "timer" | "image" | "game" | "draw" | "radio";
export const INTERACTABLE_KINDS: { kind: InteractableKind; label: string; needs: ("url" | "text" | "emote" | "options")[] }[] = [
  { kind: "note", label: "Nota (texto)", needs: ["text"] },
  { kind: "board", label: "Quadro compartilhado", needs: [] },
  { kind: "iframe", label: "Página embutida (iframe)", needs: ["url"] },
  { kind: "link", label: "Link (nova aba)", needs: ["url"] },
  { kind: "image", label: "Imagem", needs: ["url"] },
  { kind: "poll", label: "Enquete", needs: ["text", "options"] },
  { kind: "timer", label: "Timer compartilhado", needs: [] },
  { kind: "game", label: "Jogo da velha (2 jogadores)", needs: [] },
  { kind: "draw", label: "Lousa de desenho", needs: [] },
  { kind: "radio", label: "Rádio / música (YouTube)", needs: ["url"] },
  { kind: "emote", label: "Emote ao usar", needs: ["emote"] },
];

export interface Portal {
  id: string;
  x: number;
  y: number;
  targetMapId: string;
  targetX: number;
  targetY: number;
  label?: string;
}

export interface Interactable {
  id: string;
  x: number;
  y: number;
  kind: InteractableKind;
  title: string;
  url?: string;
  text?: string;
  emote?: string;
  options?: string[];
}

export interface MapData {
  width: number;
  height: number;
  floor: number[];
  objects: number[];
  zones: Zone[];
  interactables: Interactable[];
  portals: Portal[];
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

export function portalAt(m: MapData, x: number, y: number): Portal | null {
  return m.portals?.find((p) => p.x === x && p.y === y) ?? null;
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
  const m: MapData = { width, height, floor, objects, zones: [], interactables: [], portals: [], spawn: { x: 7, y: 7 } };

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

  // Windows, paintings and signs on the outer/top walls (wall-mounted, still solid)
  for (const wx of [5, 8, 11, 16, 19, 25, 30]) setO(wx, 2, O.WINDOW);
  setO(15, 2, O.PAINTING); setO(24, 2, O.PAINTING); setO(31, 2, O.PAINTING);
  setO(9, 2, O.SIGN);

  // Lobby
  fillF(3, 3, 10, 7, F.STONE);
  setO(3, 5, O.LOCKER); setO(3, 6, O.LOCKER);
  setO(7, 7, O.RUG_ROUND);
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
  setO(6, 11, O.CACTUS); setO(20, 11, O.PRINTER); setO(21, 11, O.WATER_COOLER);
  setO(19, 11, O.PLANT); setO(3, 17, O.PLANT);

  // Lounge
  fillF(22, 11, 11, 7, F.RUG_RED);
  setO(23, 12, O.SOFA); setO(24, 12, O.SOFA); setO(25, 12, O.SOFA);
  setO(23, 15, O.SOFA); setO(24, 15, O.SOFA); setO(25, 15, O.SOFA);
  setO(24, 13, O.TABLE);
  setO(31, 12, O.COFFEE); setO(32, 12, O.COFFEE);
  setO(29, 12, O.KITCHEN); setO(30, 12, O.KITCHEN); setO(30, 11, O.FRIDGE); setO(32, 11, O.VENDING);
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
    { id: "enquete", x: 24, y: 13, kind: "poll", title: "Enquete do lounge", text: "Onde vai ser o happy hour?", options: ["Bar da esquina", "Rooftop", "Online mesmo"] },
    { id: "timer-sala-a", x: 14, y: 3, kind: "timer", title: "Timer da reunião" },
    { id: "quadro-ipe", x: 32, y: 3, kind: "image", title: "Quadro de parede", url: "https://picsum.photos/seed/gather/800/500" },
    { id: "velha", x: 24, y: 15, kind: "game", title: "Jogo da velha" },
    { id: "lousa", x: 26, y: 2, kind: "draw", title: "Lousa da Sala Ipê" },
    { id: "radio", x: 32, y: 16, kind: "radio", title: "Rádio do lounge", url: "https://www.youtube.com/embed/jfKfPfyJRdk?autoplay=1" },
  );

  return m;
}

/** Small blank map used by the mapmaker when creating a new room. */
export function buildBlankMap(width = 30, height = 20, floorTile: number = F.WOOD): MapData {
  const floor = new Array(width * height).fill(floorTile);
  const objects = new Array(width * height).fill(O.NONE);
  const m: MapData = { width, height, floor, objects, zones: [], interactables: [], portals: [], spawn: { x: Math.floor(width / 2), y: Math.floor(height / 2) } };
  for (let x = 0; x < width; x++) { objects[idx(m, x, 0)] = O.WALL; objects[idx(m, x, height - 1)] = O.WALL; }
  for (let y = 0; y < height; y++) { objects[idx(m, 0, y)] = O.WALL; objects[idx(m, width - 1, y)] = O.WALL; }
  return m;
}

/** Garden template: outdoor area with a pond, path and benches. */
export function buildGardenMap(): MapData {
  const m = buildBlankMap(36, 26, F.GRASS);
  const set = (x: number, y: number, t: number) => { m.objects[idx(m, x, y)] = t; };
  for (let x = 0; x < m.width; x++) { set(x, 0, O.FENCE); set(x, m.height - 1, O.FENCE); }
  for (let y = 0; y < m.height; y++) { set(0, y, O.FENCE); set(m.width - 1, y, O.FENCE); }
  for (let x = 2; x < m.width - 2; x++) m.floor[idx(m, x, 13)] = F.PATH;
  for (let y = 2; y < m.height - 2; y++) m.floor[idx(m, 18, y)] = F.PATH;
  for (let y = 4; y <= 7; y++) for (let x = 6; x <= 10; x++) m.floor[idx(m, x, y)] = F.WATER;
  set(26, 6, O.FOUNTAIN);
  for (const [x, y] of [[4, 18], [12, 20], [24, 18], [30, 21], [8, 10], [28, 3], [14, 3]]) set(x, y, O.TREE);
  for (const [x, y] of [[20, 10], [22, 16], [10, 16], [30, 10]]) set(x, y, O.BENCH);
  for (const [x, y] of [[5, 15], [16, 8], [24, 22], [32, 15]]) set(x, y, O.FLOWERS);
  m.zones.push({ id: "gazebo", name: "Gazebo", x: 20, y: 15, w: 4, h: 3, color: "#84cc16" });
  m.spawn = { x: 18, y: 13 };
  return m;
}

/** Coworking: open floor with desk pods, phone booths and a kitchen. */
export function buildCoworkingMap(): MapData {
  const m = buildBlankMap(36, 26, F.WOOD);
  const setO = (x: number, y: number, t: number) => { m.objects[idx(m, x, y)] = t; };
  const fillF = (x: number, y: number, w: number, h: number, t: number) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) m.floor[idx(m, i, j)] = t; };
  for (const wx of [4, 9, 14, 19, 24, 29]) setO(wx, 0, O.WINDOW);
  for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) {
    const x = 3 + col * 7, y = 3 + row * 6;
    setO(x, y, O.COMPUTER); setO(x + 1, y, O.DESK); setO(x + 2, y, O.COMPUTER); setO(x, y + 1, O.CHAIR); setO(x + 1, y + 1, O.CHAIR); setO(x + 2, y + 1, O.CHAIR);
    setO(x + 4, y, O.PLANT);
  }
  fillF(31, 2, 4, 3, F.CARPET_BLUE); setO(31, 2, O.LAMP); setO(33, 3, O.CHAIR); m.zones.push({ id: "booth-1", name: "Cabine 1", x: 31, y: 2, w: 4, h: 3, color: "#f59e0b" });
  fillF(31, 7, 4, 3, F.CARPET_BLUE); setO(31, 7, O.LAMP); setO(33, 8, O.CHAIR); m.zones.push({ id: "booth-2", name: "Cabine 2", x: 31, y: 7, w: 4, h: 3, color: "#f59e0b" });
  fillF(2, 21, 12, 4, F.STONE); setO(2, 21, O.KITCHEN); setO(3, 21, O.KITCHEN); setO(4, 21, O.FRIDGE); setO(6, 21, O.COFFEE); setO(8, 21, O.VENDING); setO(10, 22, O.TABLE); setO(9, 22, O.CHAIR); setO(11, 22, O.CHAIR);
  fillF(16, 20, 10, 5, F.CARPET_GREEN); setO(19, 21, O.TABLE); setO(20, 21, O.TABLE); setO(21, 21, O.TABLE); for (let i = 19; i <= 21; i++) { setO(i, 20, O.CHAIR); setO(i, 22, O.CHAIR); } setO(20, 24, O.WHITEBOARD); setO(17, 20, O.TV);
  m.zones.push({ id: "meet", name: "Sala de reunião", x: 16, y: 20, w: 10, h: 5, color: "#22c55e" });
  fillF(28, 20, 7, 5, F.RUG_RED); setO(29, 21, O.SOFA); setO(30, 21, O.SOFA); setO(31, 21, O.SOFA); setO(30, 23, O.TABLE); setO(33, 22, O.ARCADE); setO(28, 24, O.PLANT);
  m.interactables.push({ id: "board", x: 20, y: 24, kind: "board", title: "Quadro da reunião" }, { id: "cafe", x: 6, y: 21, kind: "emote", title: "Café", emote: "☕" }, { id: "arcade", x: 33, y: 22, kind: "game", title: "Jogo da velha" }, { id: "tv", x: 17, y: 20, kind: "draw", title: "Lousa" });
  m.spawn = { x: 18, y: 13 };
  return m;
}

/** Classroom: rows of desks facing a whiteboard, plus a small library corner. */
export function buildClassroomMap(): MapData {
  const m = buildBlankMap(30, 22, F.CARPET_BLUE);
  const setO = (x: number, y: number, t: number) => { m.objects[idx(m, x, y)] = t; };
  for (const wx of [5, 10, 19, 24]) setO(wx, 0, O.WINDOW);
  for (let x = 11; x <= 18; x++) setO(x, 0, x === 14 || x === 15 ? O.WHITEBOARD : O.WALL);
  setO(14, 2, O.DESK); setO(15, 2, O.DESK); setO(14, 3, O.CHAIR); setO(15, 3, O.CHAIR); setO(13, 2, O.COMPUTER);
  for (let row = 0; row < 4; row++) for (let col = 0; col < 5; col++) { const x = 5 + col * 4, y = 6 + row * 3; setO(x, y, O.DESK); setO(x + 1, y, O.DESK); setO(x, y + 1, O.CHAIR); setO(x + 1, y + 1, O.CHAIR); }
  for (let y = 4; y <= 8; y++) setO(27, y, O.BOOKSHELF);
  setO(2, 19, O.PLANT); setO(27, 19, O.PLANT); setO(2, 3, O.LOCKER); setO(2, 4, O.LOCKER); setO(2, 5, O.LOCKER);
  m.zones.push({ id: "mesa-prof", name: "Mesa do professor", x: 12, y: 1, w: 6, h: 3, color: "#8b5cf6" });
  m.interactables.push({ id: "lousa", x: 14, y: 0, kind: "draw", title: "Lousa da sala" }, { id: "enquete", x: 15, y: 0, kind: "poll", title: "Chamada / enquete", text: "Entenderam a aula de hoje?", options: ["Sim", "Mais ou menos", "Não"] }, { id: "timer", x: 13, y: 2, kind: "timer", title: "Tempo da atividade" }, { id: "biblio", x: 27, y: 6, kind: "note", title: "Biblioteca", text: "Materiais da turma ficam aqui." });
  setO(15, 20, O.SPOTLIGHT);
  m.spawn = { x: 15, y: 19 };
  return m;
}

/** Event hall: stage with spotlight, audience benches, sponsor booths and a bar. */
export function buildEventMap(): MapData {
  const m = buildBlankMap(40, 28, F.CARPET_PURPLE);
  const setO = (x: number, y: number, t: number) => { m.objects[idx(m, x, y)] = t; };
  const fillF = (x: number, y: number, w: number, h: number, t: number) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) m.floor[idx(m, i, j)] = t; };
  fillF(12, 2, 16, 4, F.WOOD_DARK); setO(20, 3, O.SPOTLIGHT); setO(12, 2, O.LAMP); setO(27, 2, O.LAMP); setO(19, 1, O.TV); setO(21, 1, O.TV);
  for (let row = 0; row < 5; row++) for (let x = 8; x <= 31; x += 3) if (x !== 20) setO(x, 8 + row * 2, O.BENCH);
  fillF(2, 2, 6, 10, F.STONE); for (let y = 3; y <= 9; y += 3) { setO(3, y, O.TABLE); setO(4, y, O.TABLE); setO(3, y + 1, O.SIGN); }
  m.zones.push({ id: "booths", name: "Estandes", x: 2, y: 2, w: 6, h: 10, color: "#f59e0b" });
  fillF(33, 2, 5, 10, F.STONE); setO(34, 3, O.KITCHEN); setO(35, 3, O.KITCHEN); setO(36, 3, O.COFFEE); setO(34, 6, O.TABLE); setO(36, 6, O.TABLE); setO(34, 9, O.VENDING);
  m.zones.push({ id: "bar", name: "Bar", x: 33, y: 2, w: 5, h: 10, color: "#ec4899" });
  fillF(2, 20, 36, 6, F.RUG_RED); for (let x = 4; x <= 34; x += 6) { setO(x, 22, O.SOFA); setO(x + 1, 22, O.SOFA); setO(x, 24, O.TABLE); }
  m.zones.push({ id: "lounge", name: "Networking", x: 2, y: 20, w: 36, h: 6, color: "#22c55e" });
  m.interactables.push({ id: "palco", x: 20, y: 3, kind: "note", title: "Palco", text: "Quem fica no spotlight fala para todo o auditório." }, { id: "telao", x: 19, y: 1, kind: "iframe", title: "Telão", url: "https://www.youtube.com/embed/jfKfPfyJRdk" }, { id: "quiz", x: 21, y: 1, kind: "poll", title: "Quiz do evento", text: "Qual palestra você mais curtiu?", options: ["Abertura", "Produto", "Engenharia", "Encerramento"] }, { id: "bar", x: 36, y: 3, kind: "emote", title: "Bar", emote: "🥂" });
  m.spawn = { x: 20, y: 18 };
  return m;
}

/** Validates/normalises an imported map object. Returns null when unusable. */
export function normalizeMap(input: any): MapData | null {
  if (!input || typeof input !== "object") return null;
  const width = Number(input.width), height = Number(input.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 4 || height < 4 || width > 200 || height > 200) return null;
  const n = width * height;
  const floor = Array.isArray(input.floor) && input.floor.length === n ? input.floor.map((v: any) => Number(v) | 0) : new Array(n).fill(F.WOOD);
  const objects = Array.isArray(input.objects) && input.objects.length === n ? input.objects.map((v: any) => Number(v) | 0) : new Array(n).fill(O.NONE);
  const m: MapData = { width, height, floor, objects, zones: [], interactables: [], portals: [], spawn: { x: 1, y: 1 } };
  for (const z of input.zones ?? []) if (z && typeof z.name === "string") m.zones.push({ id: String(z.id ?? `z${m.zones.length}`), name: z.name.slice(0, 40), x: z.x | 0, y: z.y | 0, w: Math.max(1, z.w | 0), h: Math.max(1, z.h | 0), color: /^#[0-9a-fA-F]{6}$/.test(z.color) ? z.color : "#3b82f6" });
  for (const it of input.interactables ?? []) if (it && typeof it.title === "string" && INTERACTABLE_KINDS.some((k) => k.kind === it.kind)) m.interactables.push({ id: String(it.id ?? `i${m.interactables.length}`), x: it.x | 0, y: it.y | 0, kind: it.kind, title: it.title.slice(0, 60), url: typeof it.url === "string" ? it.url.slice(0, 500) : undefined, text: typeof it.text === "string" ? it.text.slice(0, 5000) : undefined, emote: typeof it.emote === "string" ? it.emote.slice(0, 4) : undefined, options: Array.isArray(it.options) ? it.options.slice(0, 10).map((o: any) => String(o).slice(0, 60)) : undefined });
  for (const p of input.portals ?? []) if (p && typeof p.targetMapId === "string") m.portals.push({ id: String(p.id ?? `p${m.portals.length}`), x: p.x | 0, y: p.y | 0, targetMapId: p.targetMapId, targetX: p.targetX | 0, targetY: p.targetY | 0, label: typeof p.label === "string" ? p.label.slice(0, 40) : undefined });
  if (input.spawn && inBounds(m, input.spawn.x | 0, input.spawn.y | 0)) m.spawn = { x: input.spawn.x | 0, y: input.spawn.y | 0 };
  if (!isWalkable(m, m.spawn.x, m.spawn.y)) {
    outer: for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (isWalkable(m, x, y)) { m.spawn = { x, y }; break outer; }
  }
  return m;
}
