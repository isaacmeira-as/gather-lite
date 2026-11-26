import { getDb, uid, now } from "./db";
import { buildDefaultMap, buildBlankMap, buildGardenMap, MapData, normalizeMap } from "../shared/map";

export type Role = "owner" | "moderator" | "member" | "guest";
export const ROLE_RANK: Record<Role, number> = { owner: 3, moderator: 2, member: 1, guest: 0 };
export const can = {
  build: (r: Role | null) => !!r && ROLE_RANK[r] >= ROLE_RANK.moderator,
  moderate: (r: Role | null) => !!r && ROLE_RANK[r] >= ROLE_RANK.moderator,
  manage: (r: Role | null) => r === "owner",
  chat: (r: Role | null) => !!r,
};

export interface SpaceRow { id: string; slug: string; name: string; owner_id: string; is_private: number; created_at: number; location: string; weather_mode: string; time_mode: string }
export const WEATHER_MODES = ["auto", "clear", "cloudy", "fog", "rain", "storm", "snow"];
export const TIME_MODES = ["auto", "day", "night"];
export function updateSpaceSettings(spaceId: string, patch: { name?: string; isPrivate?: boolean; location?: string; weatherMode?: string; timeMode?: string }) {
  const db = getDb();
  if (patch.name !== undefined) db.prepare("UPDATE spaces SET name = ? WHERE id = ?").run(patch.name, spaceId);
  if (patch.isPrivate !== undefined) db.prepare("UPDATE spaces SET is_private = ? WHERE id = ?").run(patch.isPrivate ? 1 : 0, spaceId);
  if (patch.location !== undefined) db.prepare("UPDATE spaces SET location = ? WHERE id = ?").run(patch.location, spaceId);
  if (patch.weatherMode !== undefined && WEATHER_MODES.includes(patch.weatherMode)) db.prepare("UPDATE spaces SET weather_mode = ? WHERE id = ?").run(patch.weatherMode, spaceId);
  if (patch.timeMode !== undefined && TIME_MODES.includes(patch.timeMode)) db.prepare("UPDATE spaces SET time_mode = ? WHERE id = ?").run(patch.timeMode, spaceId);
}
export interface MapRow { id: string; space_id: string; name: string; data: string; is_default: number; created_at: number }

export function slugify(name: string) {
  const base = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "espaco";
  const db = getDb();
  let slug = base;
  let n = 2;
  while (db.prepare("SELECT 1 FROM spaces WHERE slug = ?").get(slug)) slug = `${base}-${n++}`;
  return slug;
}

export function createSpace(ownerId: string, name: string, template: "office" | "blank" | "garden" = "office", isPrivate = false): SpaceRow {
  const db = getDb();
  const id = uid("s_");
  const slug = slugify(name);
  db.prepare("INSERT INTO spaces (id, slug, name, owner_id, is_private, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, slug, name.slice(0, 60), ownerId, isPrivate ? 1 : 0, now());
  db.prepare("INSERT INTO memberships (space_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)").run(id, ownerId, now());
  const main = createMap(id, template === "garden" ? "Jardim" : template === "blank" ? "Sala principal" : "Escritório", template, true);
  if (template === "office") {
    // Office template ships with a second room reachable through portals.
    const garden = createMap(id, "Jardim", "garden", false);
    const officeData = JSON.parse(main.data) as MapData;
    const gardenData = JSON.parse(garden.data) as MapData;
    officeData.portals.push({ id: "to-garden", x: 42, y: 29, targetMapId: garden.id, targetX: 18, targetY: 14, label: "Jardim" });
    gardenData.portals.push({ id: "to-office", x: 18, y: 24, targetMapId: main.id, targetX: 41, targetY: 29, label: "Escritório" });
    saveMapData(main.id, officeData);
    saveMapData(garden.id, gardenData);
  }
  return getSpace(id)!;
}

export function createMap(spaceId: string, name: string, template: "office" | "blank" | "garden" | MapData = "blank", isDefault = false): MapRow {
  const db = getDb();
  const id = uid("m_");
  const data = typeof template === "string" ? (template === "office" ? buildDefaultMap() : template === "garden" ? buildGardenMap() : buildBlankMap()) : template;
  if (isDefault) db.prepare("UPDATE maps SET is_default = 0 WHERE space_id = ?").run(spaceId);
  db.prepare("INSERT INTO maps (id, space_id, name, data, is_default, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, spaceId, name.slice(0, 40), JSON.stringify(data), isDefault ? 1 : 0, now());
  return getMap(id)!;
}

export function getSpace(id: string) { return getDb().prepare("SELECT * FROM spaces WHERE id = ?").get(id) as SpaceRow | undefined; }
export function getSpaceBySlug(slug: string) { return getDb().prepare("SELECT * FROM spaces WHERE slug = ?").get(slug) as SpaceRow | undefined; }
export function getMap(id: string) { return getDb().prepare("SELECT * FROM maps WHERE id = ?").get(id) as MapRow | undefined; }
export function listMaps(spaceId: string) { return getDb().prepare("SELECT id, name, is_default, created_at FROM maps WHERE space_id = ? ORDER BY is_default DESC, created_at").all(spaceId) as Omit<MapRow, "data" | "space_id">[]; }
export function defaultMap(spaceId: string) { return getDb().prepare("SELECT * FROM maps WHERE space_id = ? ORDER BY is_default DESC, created_at LIMIT 1").get(spaceId) as MapRow | undefined; }
export function saveMapData(mapId: string, data: MapData) { getDb().prepare("UPDATE maps SET data = ? WHERE id = ?").run(JSON.stringify(data), mapId); }
export function loadMapData(mapId: string): MapData | null {
  const row = getMap(mapId);
  if (!row) return null;
  try { return normalizeMap(JSON.parse(row.data)); } catch { return null; }
}
export function renameMap(mapId: string, name: string) { getDb().prepare("UPDATE maps SET name = ? WHERE id = ?").run(name.slice(0, 40), mapId); }
export function deleteMap(mapId: string) { getDb().prepare("DELETE FROM maps WHERE id = ?").run(mapId); }
export function setDefaultMap(spaceId: string, mapId: string) {
  const db = getDb();
  db.prepare("UPDATE maps SET is_default = 0 WHERE space_id = ?").run(spaceId);
  db.prepare("UPDATE maps SET is_default = 1 WHERE id = ? AND space_id = ?").run(mapId, spaceId);
}

export function roleOf(spaceId: string, userId: string): Role | null {
  const row = getDb().prepare("SELECT role FROM memberships WHERE space_id = ? AND user_id = ?").get(spaceId, userId) as { role: Role } | undefined;
  return row?.role ?? null;
}
export function isBanned(spaceId: string, userId: string) {
  return !!getDb().prepare("SELECT 1 FROM bans WHERE space_id = ? AND user_id = ?").get(spaceId, userId);
}
export function setRole(spaceId: string, userId: string, role: Role) {
  getDb().prepare("INSERT INTO memberships (space_id, user_id, role, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(space_id, user_id) DO UPDATE SET role = excluded.role").run(spaceId, userId, role, now());
}
export function removeMember(spaceId: string, userId: string) { getDb().prepare("DELETE FROM memberships WHERE space_id = ? AND user_id = ?").run(spaceId, userId); }
export function ban(spaceId: string, userId: string, reason = "") {
  removeMember(spaceId, userId);
  getDb().prepare("INSERT OR REPLACE INTO bans (space_id, user_id, reason, created_at) VALUES (?, ?, ?, ?)").run(spaceId, userId, reason, now());
}
export function unban(spaceId: string, userId: string) { getDb().prepare("DELETE FROM bans WHERE space_id = ? AND user_id = ?").run(spaceId, userId); }

/** Resolve the effective role for a user entering a space. Public spaces grant "guest" automatically. */
export function effectiveRole(space: SpaceRow, userId: string): Role | null {
  if (isBanned(space.id, userId)) return null;
  const r = roleOf(space.id, userId);
  if (r) return r;
  if (!space.is_private) { setRole(space.id, userId, "guest"); return "guest"; }
  return null;
}

export function listMembers(spaceId: string) {
  return getDb().prepare(`SELECT u.id, u.name, u.email, u.is_guest as isGuest, m.role, m.created_at as joinedAt
    FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.space_id = ? ORDER BY m.role, u.name`).all(spaceId) as { id: string; name: string; email: string | null; isGuest: number; role: Role; joinedAt: number }[];
}
export function listBans(spaceId: string) {
  return getDb().prepare(`SELECT b.user_id as id, u.name, b.reason, b.created_at FROM bans b LEFT JOIN users u ON u.id = b.user_id WHERE b.space_id = ?`).all(spaceId) as any[];
}

export function listSpacesFor(userId: string) {
  return getDb().prepare(`SELECT s.id, s.slug, s.name, s.is_private as isPrivate, m.role, s.owner_id as ownerId,
      (SELECT COUNT(*) FROM memberships mm WHERE mm.space_id = s.id) as members
    FROM spaces s JOIN memberships m ON m.space_id = s.id WHERE m.user_id = ? ORDER BY s.created_at DESC`).all(userId) as any[];
}

export function createInvite(spaceId: string, createdBy: string, role: Role = "member", expiresInHours?: number, maxUses?: number) {
  const token = uid("inv_");
  getDb().prepare("INSERT INTO invites (token, space_id, role, created_by, expires_at, max_uses, uses, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)")
    .run(token, spaceId, role, createdBy, expiresInHours ? now() + expiresInHours * 3600 * 1000 : null, maxUses ?? null, now());
  return token;
}
export function listInvites(spaceId: string) { return getDb().prepare("SELECT token, role, expires_at as expiresAt, max_uses as maxUses, uses, created_at as createdAt FROM invites WHERE space_id = ? ORDER BY created_at DESC").all(spaceId) as any[]; }
export function revokeInvite(spaceId: string, token: string) { getDb().prepare("DELETE FROM invites WHERE token = ? AND space_id = ?").run(token, spaceId); }
export function acceptInvite(token: string, userId: string): { space: SpaceRow; role: Role } | { error: string } {
  const db = getDb();
  const inv = db.prepare("SELECT * FROM invites WHERE token = ?").get(token) as any;
  if (!inv) return { error: "convite inválido" };
  if (inv.expires_at && inv.expires_at < now()) return { error: "convite expirado" };
  if (inv.max_uses && inv.uses >= inv.max_uses) return { error: "convite esgotado" };
  const space = getSpace(inv.space_id)!;
  if (isBanned(space.id, userId)) return { error: "você foi banido deste espaço" };
  const current = roleOf(space.id, userId);
  if (!current || ROLE_RANK[current] < ROLE_RANK[inv.role as Role]) setRole(space.id, userId, inv.role);
  db.prepare("UPDATE invites SET uses = uses + 1 WHERE token = ?").run(token);
  return { space, role: roleOf(space.id, userId)! };
}

// ---- chat history / object state
export function saveMessage(m: { spaceId: string; mapId: string; scope: string; from: string; fromName: string; fromColor: string; to?: string; recipients?: string[]; text: string; ts: number }) {
  const r = getDb().prepare("INSERT INTO messages (space_id, map_id, scope, from_user, from_name, from_color, to_user, recipients, text, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(m.spaceId, m.mapId, m.scope, m.from, m.fromName, m.fromColor, m.to ?? null, m.recipients ? JSON.stringify(m.recipients) : null, m.text, m.ts);
  return Number(r.lastInsertRowid);
}
export function historyFor(spaceId: string, userId: string, limit = 80) {
  // Messages the user was allowed to see: everyone/spotlight, DMs with them, or proximity/zone chats that listed them.
  const rows = getDb().prepare(`SELECT id, map_id as mapId, scope, from_user as "from", from_name as fromName, from_color as fromColor, to_user as "to", (SELECT name FROM users WHERE id = to_user) as toName, recipients, text, ts
    FROM messages WHERE space_id = ? AND (scope IN ('everyone','spotlight') OR from_user = ? OR to_user = ? OR recipients LIKE ?)
    ORDER BY ts DESC LIMIT ?`).all(spaceId, userId, userId, `%"${userId}"%`, limit) as any[];
  return rows.reverse().map((r) => { delete r.recipients; return r; });
}
export function getObjectState(spaceId: string, key: string): any | null {
  const row = getDb().prepare("SELECT value FROM object_state WHERE space_id = ? AND key = ?").get(spaceId, key) as any;
  if (!row) return null;
  try { return JSON.parse(row.value); } catch { return null; }
}
export function allObjectState(spaceId: string): Record<string, any> {
  const out: Record<string, any> = {};
  for (const r of getDb().prepare("SELECT key, value FROM object_state WHERE space_id = ?").all(spaceId) as any[]) { try { out[r.key] = JSON.parse(r.value); } catch {} }
  return out;
}
export function setObjectState(spaceId: string, key: string, value: any) {
  getDb().prepare("INSERT INTO object_state (space_id, key, value, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(space_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").run(spaceId, key, JSON.stringify(value), now());
}

export function updateUserProfile(userId: string, name: string, avatar: any) {
  getDb().prepare("UPDATE users SET name = ?, avatar = ? WHERE id = ?").run(name, JSON.stringify(avatar), userId);
}
