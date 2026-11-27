// Tile ids shared by server (collision) and client (rendering).
import { CATALOG_BY_ID } from "./catalog";
export const TILE = 32;

// Floor layer
export const F = {
  NONE: 0,
  WOOD: 1,
  CARPET_BLUE: 2,
  CARPET_GREEN: 3,
  GRASS: 4,
  STONE: 5,
  WATER: 6,
  WOOD_DARK: 7,
  RUG_RED: 8,
  PATH: 9,
  CARPET_PURPLE: 10,
} as const;

// Object layer (0 = empty)
export const O = {
  NONE: 0,
  WALL: 11,
  DESK: 12,
  CHAIR: 13,
  PLANT: 14,
  TABLE: 15,
  WHITEBOARD: 16,
  BOOKSHELF: 17,
  COMPUTER: 18,
  COFFEE: 19,
  SOFA: 20,
  LAMP: 21,
  SPOTLIGHT: 22,
  DOOR: 23,
  TREE: 24,
  FLOWERS: 25,
  FENCE: 26,
  TV: 27,
  PIANO: 28,
  BENCH: 29,
  FOUNTAIN: 30,
  ARCADE: 31,
  WINDOW: 32,
  KITCHEN: 33,
  FRIDGE: 34,
  PRINTER: 35,
  WATER_COOLER: 36,
  RUG_ROUND: 37,
  SIGN: 38,
  VENDING: 39,
  CACTUS: 40,
  PAINTING: 41,
  LOCKER: 42,
} as const;

export const FLOOR_NAMES: Record<number, string> = {
  [F.WOOD]: "Madeira",
  [F.CARPET_BLUE]: "Carpete azul",
  [F.CARPET_GREEN]: "Carpete verde",
  [F.GRASS]: "Grama",
  [F.STONE]: "Pedra",
  [F.WATER]: "Água",
  [F.WOOD_DARK]: "Madeira escura",
  [F.RUG_RED]: "Tapete",
  [F.PATH]: "Caminho",
  [F.CARPET_PURPLE]: "Carpete roxo",
};

export const OBJECT_NAMES: Record<number, string> = {
  [O.NONE]: "Apagar",
  [O.WALL]: "Parede",
  [O.DESK]: "Mesa",
  [O.CHAIR]: "Cadeira",
  [O.PLANT]: "Planta",
  [O.TABLE]: "Mesa redonda",
  [O.WHITEBOARD]: "Quadro",
  [O.BOOKSHELF]: "Estante",
  [O.COMPUTER]: "Computador",
  [O.COFFEE]: "Café",
  [O.SOFA]: "Sofá",
  [O.LAMP]: "Luminária",
  [O.SPOTLIGHT]: "Spotlight",
  [O.DOOR]: "Porta",
  [O.TREE]: "Árvore",
  [O.FLOWERS]: "Flores",
  [O.FENCE]: "Cerca",
  [O.TV]: "TV",
  [O.PIANO]: "Piano",
  [O.BENCH]: "Banco",
  [O.FOUNTAIN]: "Fonte",
  [O.ARCADE]: "Arcade",
  [O.WINDOW]: "Janela",
  [O.KITCHEN]: "Bancada",
  [O.FRIDGE]: "Geladeira",
  [O.PRINTER]: "Impressora",
  [O.WATER_COOLER]: "Bebedouro",
  [O.RUG_ROUND]: "Tapete redondo",
  [O.SIGN]: "Placa",
  [O.VENDING]: "Máquina de lanches",
  [O.CACTUS]: "Cacto",
  [O.PAINTING]: "Quadro de parede",
  [O.LOCKER]: "Armário",
};

const SOLID_OBJECTS = new Set<number>([
  O.WALL, O.DESK, O.PLANT, O.TABLE, O.WHITEBOARD, O.BOOKSHELF, O.COMPUTER,
  O.COFFEE, O.SOFA, O.LAMP, O.TREE, O.FENCE, O.TV, O.PIANO, O.FOUNTAIN, O.ARCADE,
  O.WINDOW, O.KITCHEN, O.FRIDGE, O.PRINTER, O.WATER_COOLER, O.VENDING, O.CACTUS, O.PAINTING, O.LOCKER,
]);

/** Objects that visually sit on a wall (rendered with the wall face behind them). */
const LEGACY_WALL_MOUNTED = new Set<number>([O.WINDOW, O.PAINTING, O.WHITEBOARD, O.TV, O.SIGN]);
export const WALL_MOUNTED = { has: (id: number) => LEGACY_WALL_MOUNTED.has(id) || !!CATALOG_BY_ID.get(id)?.wall };
/** Objects that are "tall": the player standing right below is drawn behind them. */
const LEGACY_TALL = new Set<number>([O.WALL, O.WINDOW, O.TREE, O.BOOKSHELF, O.LOCKER, O.FRIDGE, O.VENDING, O.LAMP, O.PLANT]);
export const TALL_OBJECTS = { has: (id: number) => LEGACY_TALL.has(id) || !!CATALOG_BY_ID.get(id)?.tall };
/** Catalog walls (base "wall") behave like O.WALL for top/face rendering. */
export const isWallLike = (id: number) => id === O.WALL || CATALOG_BY_ID.get(id)?.base === "wall";
const SOLID_FLOORS = new Set<number>([F.NONE, F.WATER]);

export function isSolid(floor: number, object: number): boolean {
  if (SOLID_FLOORS.has(floor)) return true;
  const c = CATALOG_BY_ID.get(object);
  if (c) return c.solid;
  return SOLID_OBJECTS.has(object);
}

const LEGACY_SITTABLE = new Set<number>([O.CHAIR, O.BENCH]);
export const SITTABLE = { has: (id: number) => LEGACY_SITTABLE.has(id) || !!CATALOG_BY_ID.get(id)?.sittable };
export const isValidObject = (id: number) => id === 0 || (Object.values(O) as number[]).includes(id) || CATALOG_BY_ID.has(id);

// Directions
export const DIR = { DOWN: 0, LEFT: 1, RIGHT: 2, UP: 3 } as const;
export const DIR_DELTA: Record<number, [number, number]> = {
  0: [0, 1],
  1: [-1, 0],
  2: [1, 0],
  3: [0, -1],
};
