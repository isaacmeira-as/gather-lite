import { MapData, zoneAt, isSpotlight, distance, NEARBY_RADIUS } from "./map";

export interface Positioned { id: string; x: number; y: number }

/**
 * Derives the audio/video group of every player: if anyone is on a spotlight the whole
 * map shares "stage"; players inside a zone share "zone:<id>"; players outside form
 * proximity clusters (connected components within NEARBY_RADIUS). "" means alone.
 */
export function conversationGroups(m: MapData, mapId: string, players: Positioned[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (players.some((p) => isSpotlight(m, p.x, p.y))) { for (const p of players) out[p.id] = `stage:${mapId}`; return out; }
  const free: Positioned[] = [];
  for (const p of players) {
    const z = zoneAt(m, p.x, p.y);
    if (z) out[p.id] = `zone:${mapId}:${z.id}`; else free.push(p);
  }
  const parent = new Map<string, string>();
  const find = (id: string): string => { const p = parent.get(id) ?? id; if (p === id) return id; const r = find(p); parent.set(id, r); return r; };
  for (const a of free) for (const b of free) if (a.id < b.id && distance(a.x, a.y, b.x, b.y) <= NEARBY_RADIUS) parent.set(find(a.id), find(b.id));
  const members = new Map<string, string[]>();
  for (const p of free) { const r = find(p.id); members.set(r, [...(members.get(r) ?? []), p.id]); }
  for (const p of free) { const ids = members.get(find(p.id))!; out[p.id] = ids.length > 1 ? `near:${mapId}:${[...ids].sort()[0]}` : ""; }
  return out;
}
