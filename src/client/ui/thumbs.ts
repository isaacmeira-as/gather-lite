// Small avatar thumbnails (cached per config) and map thumbnails for cards.
import { drawAvatarPreview } from "../textures/avatars";
import { normalizeAvatar, avatarKey } from "../../shared/avatar";
import { TILE_COLORS } from "../textures/tiles";

const cache = new Map<string, string>();
export function avatarThumb(avatarJson: string, scale = 1): HTMLCanvasElement {
  let cfg; try { cfg = normalizeAvatar(JSON.parse(avatarJson)); } catch { cfg = normalizeAvatar({}); }
  const key = avatarKey(cfg) + ":" + scale;
  const c = document.createElement("canvas");
  c.className = "avatar-thumb";
  if (cache.has(key)) { const img = new Image(); c.width = 32 * scale; c.height = 40 * scale; img.onload = () => c.getContext("2d")!.drawImage(img, 0, 0); img.src = cache.get(key)!; return c; }
  drawAvatarPreview(c, cfg, scale);
  cache.set(key, c.toDataURL());
  return c;
}

export function mapThumb(canvas: HTMLCanvasElement, m: { width: number; height: number; floor: number[]; objects: number[]; zones?: any[] }) {
  canvas.width = m.width * 4; canvas.height = m.height * 4;
  const c = canvas.getContext("2d")!;
  for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
    const o = m.objects[y * m.width + x];
    c.fillStyle = TILE_COLORS[o || m.floor[y * m.width + x]] ?? "#000";
    c.fillRect(x * 4, y * 4, 4, 4);
  }
  for (const z of m.zones ?? []) { c.fillStyle = z.color + "66"; c.fillRect(z.x * 4, z.y * 4, z.w * 4, z.h * 4); }
}
