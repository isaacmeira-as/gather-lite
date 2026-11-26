// Tile ids shared by server (collision) and client (rendering).
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
};

const SOLID_OBJECTS = new Set<number>([
  O.WALL, O.DESK, O.PLANT, O.TABLE, O.WHITEBOARD, O.BOOKSHELF, O.COMPUTER,
  O.COFFEE, O.SOFA, O.LAMP, O.TREE, O.FENCE, O.TV, O.PIANO, O.FOUNTAIN, O.ARCADE,
]);
const SOLID_FLOORS = new Set<number>([F.NONE, F.WATER]);

export function isSolid(floor: number, object: number): boolean {
  return SOLID_FLOORS.has(floor) || SOLID_OBJECTS.has(object);
}

export const SITTABLE = new Set<number>([O.CHAIR, O.BENCH]);

// Directions
export const DIR = { DOWN: 0, LEFT: 1, RIGHT: 2, UP: 3 } as const;
export const DIR_DELTA: Record<number, [number, number]> = {
  0: [0, 1],
  1: [-1, 0],
  2: [1, 0],
  3: [0, -1],
};
