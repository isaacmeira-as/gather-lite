import { Router } from "express";
import { getDb, uid, now } from "./db";
import { hashPassword, verifyPassword, signToken, toAuthUser, createGuest, authMiddleware, requireAuth, AuthedRequest, UserRow } from "./auth";
import * as S from "./spaces";
import { normalizeAvatar } from "../shared/avatar";
import { normalizeMap } from "../shared/map";

export const api = Router();
api.use(authMiddleware);

const bad = (res: any, msg: string, code = 400) => res.status(code).json({ error: msg });
const validEmail = (e: any) => typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length < 120;
const cleanName = (n: any) => String(n ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 24);

// ------------------------------------------------------------------ auth
api.post("/auth/register", (req, res) => {
  const { email, password, name } = req.body ?? {};
  if (!validEmail(email)) return bad(res, "e-mail inválido");
  if (typeof password !== "string" || password.length < 6) return bad(res, "senha precisa de 6+ caracteres");
  const nm = cleanName(name);
  if (!nm) return bad(res, "nome obrigatório");
  const db = getDb();
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email.toLowerCase())) return bad(res, "e-mail já cadastrado", 409);
  const id = uid("u_");
  db.prepare("INSERT INTO users (id, email, name, password_hash, avatar, is_guest, created_at) VALUES (?, ?, ?, ?, '{}', 0, ?)").run(id, email.toLowerCase(), nm, hashPassword(password), now());
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as unknown as UserRow;
  res.json({ token: signToken({ sub: id }), user: toAuthUser(row) });
});

api.post("/auth/login", (req, res) => {
  const { email, password } = req.body ?? {};
  const row = getDb().prepare("SELECT * FROM users WHERE email = ?").get(String(email ?? "").toLowerCase()) as unknown as UserRow | undefined;
  if (!row || !verifyPassword(String(password ?? ""), row.password_hash)) return bad(res, "e-mail ou senha incorretos", 401);
  res.json({ token: signToken({ sub: row.id }), user: toAuthUser(row) });
});

api.post("/auth/guest", (req, res) => {
  const nm = cleanName(req.body?.name);
  if (!nm) return bad(res, "nome obrigatório");
  const row = createGuest(nm);
  res.json({ token: signToken({ sub: row.id }), user: toAuthUser(row) });
});

api.get("/auth/me", requireAuth, (req: AuthedRequest, res) => res.json({ user: req.user }));

api.patch("/auth/me", requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const { name, avatar } = req.body ?? {};
  if (name !== undefined) { const nm = cleanName(name); if (!nm) return bad(res, "nome inválido"); db.prepare("UPDATE users SET name = ? WHERE id = ?").run(nm, req.user!.id); }
  if (avatar !== undefined) db.prepare("UPDATE users SET avatar = ? WHERE id = ?").run(JSON.stringify(normalizeAvatar(avatar)), req.user!.id);
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user!.id) as unknown as UserRow;
  res.json({ user: toAuthUser(row) });
});

// ---------------------------------------------------------------- spaces
api.get("/spaces", requireAuth, (req: AuthedRequest, res) => res.json({ spaces: S.listSpacesFor(req.user!.id) }));

api.post("/spaces", requireAuth, (req: AuthedRequest, res) => {
  if (req.user!.isGuest) return bad(res, "crie uma conta para criar espaços", 403);
  const name = String(req.body?.name ?? "").trim();
  if (!name) return bad(res, "nome obrigatório");
  const template = ["office", "blank", "garden"].includes(req.body?.template) ? req.body.template : "office";
  const space = S.createSpace(req.user!.id, name, template, !!req.body?.isPrivate);
  res.json({ space: publicSpace(space, "owner") });
});

function publicSpace(s: S.SpaceRow, role: S.Role | null) {
  return { id: s.id, slug: s.slug, name: s.name, isPrivate: !!s.is_private, ownerId: s.owner_id, role, maps: S.listMaps(s.id) };
}

function loadSpace(req: AuthedRequest, res: any, minRole?: S.Role) {
  const space = S.getSpaceBySlug(req.params.slug as string);
  if (!space) { bad(res, "espaço não encontrado", 404); return null; }
  const role = req.user ? S.effectiveRole(space, req.user.id) : null;
  if (minRole && (!role || S.ROLE_RANK[role] < S.ROLE_RANK[minRole])) { bad(res, "sem permissão", 403); return null; }
  return { space, role };
}

api.get("/spaces/:slug", (req: AuthedRequest, res) => {
  const space = S.getSpaceBySlug(req.params.slug as string);
  if (!space) return bad(res, "espaço não encontrado", 404);
  const role = req.user ? S.effectiveRole(space, req.user.id) : null;
  if (req.user && !role && S.isBanned(space.id, req.user.id)) return bad(res, "você foi banido deste espaço", 403);
  if (space.is_private && !role) return res.status(403).json({ error: "espaço privado: peça um convite", isPrivate: true, name: space.name });
  res.json({ space: publicSpace(space, role) });
});

api.patch("/spaces/:slug", requireAuth, (req: AuthedRequest, res) => {
  const ctx = loadSpace(req, res, "owner"); if (!ctx) return;
  const { name, isPrivate } = req.body ?? {};
  if (name !== undefined) getDb().prepare("UPDATE spaces SET name = ? WHERE id = ?").run(String(name).trim().slice(0, 60) || ctx.space.name, ctx.space.id);
  if (isPrivate !== undefined) getDb().prepare("UPDATE spaces SET is_private = ? WHERE id = ?").run(isPrivate ? 1 : 0, ctx.space.id);
  res.json({ space: publicSpace(S.getSpace(ctx.space.id)!, ctx.role) });
});

api.delete("/spaces/:slug", requireAuth, (req: AuthedRequest, res) => {
  const ctx = loadSpace(req, res, "owner"); if (!ctx) return;
  getDb().prepare("DELETE FROM spaces WHERE id = ?").run(ctx.space.id);
  res.json({ ok: true });
});

// ---- members / moderation
api.get("/spaces/:slug/members", requireAuth, (req: AuthedRequest, res) => {
  const ctx = loadSpace(req, res, "guest"); if (!ctx) return;
  res.json({ members: S.listMembers(ctx.space.id), bans: S.can.moderate(ctx.role) ? S.listBans(ctx.space.id) : [] });
});
api.patch("/spaces/:slug/members/:userId", requireAuth, (req: AuthedRequest, res) => {
  const ctx = loadSpace(req, res, "moderator"); if (!ctx) return;
  const role = req.body?.role as S.Role;
  if (!["moderator", "member", "guest"].includes(role)) return bad(res, "papel inválido");
  const target = req.params.userId as string;
  if (target === ctx.space.owner_id) return bad(res, "não dá para mudar o dono", 403);
  if (role === "moderator" && ctx.role !== "owner") return bad(res, "só o dono promove moderadores", 403);
  S.setRole(ctx.space.id, target, role);
  res.json({ ok: true });
});
api.delete("/spaces/:slug/members/:userId", requireAuth, (req: AuthedRequest, res) => {
  const ctx = loadSpace(req, res, "moderator"); if (!ctx) return;
  const target = req.params.userId as string;
  if (target === ctx.space.owner_id) return bad(res, "não dá para remover o dono", 403);
  if (req.query.ban === "1") S.ban(ctx.space.id, target, String(req.query.reason ?? "")); else S.removeMember(ctx.space.id, target);
  res.json({ ok: true });
});
api.delete("/spaces/:slug/bans/:userId", requireAuth, (req: AuthedRequest, res) => {
  const ctx = loadSpace(req, res, "moderator"); if (!ctx) return;
  S.unban(ctx.space.id, req.params.userId as string);
  res.json({ ok: true });
});

// ---- invites
api.get("/spaces/:slug/invites", requireAuth, (req: AuthedRequest, res) => {
  const ctx = loadSpace(req, res, "moderator"); if (!ctx) return;
  res.json({ invites: S.listInvites(ctx.space.id) });
});
api.post("/spaces/:slug/invites", requireAuth, (req: AuthedRequest, res) => {
  const ctx = loadSpace(req, res, "moderator"); if (!ctx) return;
  const role = ["member", "moderator", "guest"].includes(req.body?.role) ? req.body.role : "member";
  if (role === "moderator" && ctx.role !== "owner") return bad(res, "só o dono convida moderadores", 403);
  const token = S.createInvite(ctx.space.id, req.user!.id, role, req.body?.expiresInHours ? Number(req.body.expiresInHours) : undefined, req.body?.maxUses ? Number(req.body.maxUses) : undefined);
  res.json({ token });
});
api.delete("/spaces/:slug/invites/:token", requireAuth, (req: AuthedRequest, res) => {
  const ctx = loadSpace(req, res, "moderator"); if (!ctx) return;
  S.revokeInvite(ctx.space.id, req.params.token as string);
  res.json({ ok: true });
});
api.get("/invites/:token", (req, res) => {
  const inv = getDb().prepare("SELECT i.role, s.name, s.slug FROM invites i JOIN spaces s ON s.id = i.space_id WHERE i.token = ?").get(req.params.token as string) as any;
  if (!inv) return bad(res, "convite inválido", 404);
  res.json({ invite: inv });
});
api.post("/invites/:token/accept", requireAuth, (req: AuthedRequest, res) => {
  const r = S.acceptInvite(req.params.token as string, req.user!.id);
  if ("error" in r) return bad(res, r.error, 403);
  res.json({ space: publicSpace(r.space, r.role) });
});

// ---- maps
api.get("/spaces/:slug/maps/:mapId", requireAuth, (req: AuthedRequest, res) => {
  const ctx = loadSpace(req, res, "guest"); if (!ctx) return;
  const map = S.getMap(req.params.mapId as string);
  if (!map || map.space_id !== ctx.space.id) return bad(res, "mapa não encontrado", 404);
  res.json({ map: { id: map.id, name: map.name, isDefault: !!map.is_default, data: JSON.parse(map.data) } });
});
api.post("/spaces/:slug/maps", requireAuth, (req: AuthedRequest, res) => {
  const ctx = loadSpace(req, res, "moderator"); if (!ctx) return;
  const name = String(req.body?.name ?? "Nova sala").trim().slice(0, 40) || "Nova sala";
  let template: any = ["office", "blank", "garden"].includes(req.body?.template) ? req.body.template : "blank";
  if (req.body?.data) { template = normalizeMap(req.body.data); if (!template) return bad(res, "mapa importado inválido"); }
  const map = S.createMap(ctx.space.id, name, template, false);
  res.json({ map: { id: map.id, name: map.name, isDefault: false } });
});
api.patch("/spaces/:slug/maps/:mapId", requireAuth, (req: AuthedRequest, res) => {
  const ctx = loadSpace(req, res, "moderator"); if (!ctx) return;
  const map = S.getMap(req.params.mapId as string);
  if (!map || map.space_id !== ctx.space.id) return bad(res, "mapa não encontrado", 404);
  if (req.body?.name) S.renameMap(map.id, String(req.body.name));
  if (req.body?.isDefault) S.setDefaultMap(ctx.space.id, map.id);
  res.json({ ok: true });
});
api.delete("/spaces/:slug/maps/:mapId", requireAuth, (req: AuthedRequest, res) => {
  const ctx = loadSpace(req, res, "moderator"); if (!ctx) return;
  const map = S.getMap(req.params.mapId as string);
  if (!map || map.space_id !== ctx.space.id) return bad(res, "mapa não encontrado", 404);
  if (S.listMaps(ctx.space.id).length <= 1) return bad(res, "o espaço precisa de pelo menos um mapa");
  S.deleteMap(map.id);
  if (map.is_default) { const first = S.listMaps(ctx.space.id)[0]; if (first) S.setDefaultMap(ctx.space.id, first.id); }
  res.json({ ok: true });
});

// ---- chat history
api.get("/spaces/:slug/history", requireAuth, (req: AuthedRequest, res) => {
  const ctx = loadSpace(req, res, "guest"); if (!ctx) return;
  res.json({ messages: S.historyFor(ctx.space.id, req.user!.id) });
});
