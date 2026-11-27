export interface AvatarConfig {
  body: number;      // 0 = menino, 1 = menina
  skin: number;      // index into SKIN_TONES
  hair: number;      // index into HAIR_STYLES
  hairColor: number; // index into HAIR_COLORS
  shirt: string;     // hex
  pants: number;     // index into PANTS_COLORS
  accessory: number; // index into ACCESSORIES
  pet: number;       // index into PETS (0 = none)
  shirtCustom?: string; // free hex, overrides shirt when set
}

export const SKIN_TONES = ["#f1c6a3", "#f7d7b7", "#e0ac84", "#c68e63", "#a06b45", "#6f4a2f"];
export const HAIR_STYLES = ["Curto", "Longo", "Coque", "Espetado", "Careca", "Cacheado"];
export const HAIR_COLORS = ["#3b2416", "#1f1410", "#e3b24b", "#c2410c", "#cbd5e1", "#2563eb", "#db2777", "#16a34a"];
export const SHIRT_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899", "#111827", "#f9fafb"];
export const PANTS_COLORS = ["#1e3a8a", "#111827", "#78350f", "#374151", "#065f46", "#7f1d1d"];
export const ACCESSORIES = ["Nenhum", "Óculos", "Chapéu", "Fones", "Coroa"];
export const PETS = ["Nenhum", "Gato", "Cachorro", "Pato", "Robô", "Slime"];
export const BODIES = ["Menino", "Menina"];

export const DEFAULT_AVATAR: AvatarConfig = { body: 0, skin: 0, hair: 0, hairColor: 0, shirt: "#3b82f6", pants: 0, accessory: 0, pet: 0 };

export function normalizeAvatar(a: any): AvatarConfig {
  const n = (v: any, max: number) => (Number.isInteger(v) && v >= 0 && v < max ? v : 0);
  return {
    body: n(a?.body, BODIES.length),
    skin: n(a?.skin, SKIN_TONES.length),
    hair: n(a?.hair, HAIR_STYLES.length),
    hairColor: n(a?.hairColor, HAIR_COLORS.length),
    shirt: /^#[0-9a-fA-F]{6}$/.test(a?.shirt ?? "") ? a.shirt : DEFAULT_AVATAR.shirt,
    pants: n(a?.pants, PANTS_COLORS.length),
    accessory: n(a?.accessory, ACCESSORIES.length),
    pet: n(a?.pet, PETS.length),
  };
}

export function randomAvatar(): AvatarConfig {
  const r = (n: number) => Math.floor(Math.random() * n);
  const body = r(2);
  return { body, skin: r(SKIN_TONES.length), hair: body ? 1 + r(2) : r(HAIR_STYLES.length), hairColor: r(HAIR_COLORS.length), shirt: SHIRT_COLORS[r(SHIRT_COLORS.length)], pants: r(PANTS_COLORS.length), accessory: 0, pet: 0 };
}

export const avatarKey = (a: AvatarConfig) => `${a.body}-${a.skin}-${a.hair}-${a.hairColor}-${a.shirt.slice(1)}-${a.pants}-${a.accessory}`;
export const SHIRT_FREE = true;
