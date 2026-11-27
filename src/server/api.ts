import { Router } from "express";
import { getDb, uid, now } from "./db";
import { hashPassword, verifyPassword, signToken, toAuthUser, createGuest, authMiddleware, requireAuth, AuthedRequest, UserRow } from "./auth";
import * as S from "./spaces";
import { normalizeAvatar } from "../shared/avatar";
import { normalizeMap } from "../shared/map";
import { geocode, invalidate } from "./weather";
import { matchMaker } from "@colyseus/core";
import { mediaEnabled, mediaUrl, mintToken } from "./media";
import { DB_PATH } from "./db";
import express from "express";
import fs from "node:fs";
import path from "node:path";

export const api = Router();
api.use(authMiddleware);

const bad = (res: any, msg: string, code = 400) => res.status(code).json({ error: msg });
const validEmail = (e: any) => typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length < 120;
const cleanName = (n: any) => String(n ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 24);

// ------------------------------------------------------------------ auth
api.post("/auth/register", (req, res) => {
  if (process.env.AUTH_MODE === "google") return bad(res, "cadastro por senha desativado: entre com Google", 403);
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
  if (process.env.AUTH_MODE === "google") return bad(res, "login por senha desativado: entre com Google", 403);
  const { email, password } = req.body ?? {};
  const row = getDb().prepare("SELECT * FROM users WHERE email = ?").get(String(email ?? "").toLowerCase()) as unknown as UserRow | undefined;
  if (!row || !verifyPassword(String(password ?? ""), row.password_hash)) return bad(res, "e-mail ou senha incorretos", 401);
  res.json({ token: signToken({ sub: row.id }), user: toAuthUser(row) });
});

api.post("/auth/guest", (req, res) => {
  if (process.env.ALLOW_GUESTS === "0") return bad(res, "entrada como visitante desativada", 403);
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
  if (req.body?.statusText !== undefined) db.prepare("UPDATE users SET status_text = ? WHERE id = ?").run(String(req.body.statusText).slice(0, 60), req.user!.id);
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user!.id) as unknown as UserRow;
  res.json({ user: toAuthUser(row) });
});

// ---------------------------------------------------------------- spaces
api.get("/spaces", requireAuth, (req: AuthedRequest, res) => res.json({ spaces: S.listSpacesFor(req.user!.id) }));

api.post("/spaces", requireAuth, (req: AuthedRequest, res) => {
  if (req.user!.isGuest) return bad(res, "crie uma conta para criar espaços", 403);
  const name = String(req.body?.name ?? "").trim();
  if (!name) return bad(res, "nome obrigatório");
  const template = S.TEMPLATES.includes(req.body?.template) ? req.body.template : "office";
  const space = S.createSpace(req.user!.id, name, template, !!req.body?.isPrivate);
  res.json({ space: publicSpace(space, "owner") });
});

function publicSpace(s: S.SpaceRow, role: S.Role | null) {
  return { id: s.id, slug: s.slug, name: s.name, isPrivate: !!s.is_private, ownerId: s.owner_id, role, maps: S.listMaps(s.id), location: s.location, weatherMode: s.weather_mode, timeMode: s.time_mode, logoUrl: s.logo_url };
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

api.patch("/spaces/:slug", requireAuth, async (req: AuthedRequest, res) => {
  const ctx = loadSpace(req, res, "owner"); if (!ctx) return;
  const { name, isPrivate, location, weatherMode, timeMode, logoUrl } = req.body ?? {};
  const patch: any = {};
  if (logoUrl !== undefined) patch.logoUrl = logoUrl ? String(logoUrl).slice(0, 300) : null;
  if (name !== undefined) patch.name = String(name).trim().slice(0, 60) || ctx.space.name;
  if (isPrivate !== undefined) patch.isPrivate = !!isPrivate;
  if (location !== undefined) {
    const loc = String(location).trim().slice(0, 80);
    if (!loc) return bad(res, "informe uma cidade");
    // Only reject when the geocoder answered "not found"; without internet we keep the name (weather falls back to simulated).
    try { await geocode(loc); } catch (e: any) { if (/não encontrada/.test(String(e?.message))) return bad(res, "cidade não encontrada"); }
    patch.location = loc;
  }
  if (weatherMode !== undefined) patch.weatherMode = String(weatherMode);
  if (timeMode !== undefined) patch.timeMode = String(timeMode);
  S.updateSpaceSettings(ctx.space.id, patch);
  invalidate(ctx.space.id);
  await matchMaker.presence.publish(`space:${ctx.space.id}`, "settings");
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
  S.logMod(ctx.space.id, { id: req.user!.id, name: req.user!.name }, "role:" + role, { id: target, name: (getDb().prepare("SELECT name FROM users WHERE id = ?").get(target) as any)?.name ?? target });
  res.json({ ok: true });
});
api.delete("/spaces/:slug/members/:userId", requireAuth, (req: AuthedRequest, res) => {
  const ctx = loadSpace(req, res, "moderator"); if (!ctx) return;
  const target = req.params.userId as string;
  if (target === ctx.space.owner_id) return bad(res, "não dá para remover o dono", 403);
  const tname = (getDb().prepare("SELECT name FROM users WHERE id = ?").get(target) as any)?.name ?? target;
  if (req.query.ban === "1") S.ban(ctx.space.id, target, String(req.query.reason ?? "")); else S.removeMember(ctx.space.id, target);
  S.logMod(ctx.space.id, { id: req.user!.id, name: req.user!.name }, req.query.ban === "1" ? "ban" : "kick", { id: target, name: tname }, String(req.query.reason ?? ""));
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
  let template: any = S.TEMPLATES.includes(req.body?.template) ? req.body.template : "blank";
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

// ---------------------------------------------------------------- agenda
api.get("/spaces/:slug/events", requireAuth, (req: AuthedRequest, res) => {
  const ctx = loadSpace(req, res, "guest"); if (!ctx) return;
  res.json({ events: S.listEvents(ctx.space.id) });
});
api.post("/spaces/:slug/events", requireAuth, async (req: AuthedRequest, res) => {
  const ctx = loadSpace(req, res, "member"); if (!ctx) return;
  const { title, description, mapId, zoneId, startsAt, endsAt } = req.body ?? {};
  if (!title || typeof title !== "string") return bad(res, "título obrigatório");
  const s = Number(startsAt), e = Number(endsAt);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return bad(res, "horário inválido");
  if (e - s > 24 * 3600 * 1000) return bad(res, "evento longo demais");
  if (mapId && !S.getMap(mapId)) return bad(res, "sala inválida");
  if (mapId && zoneId && S.zoneBusy(ctx.space.id, mapId, zoneId, s, e)) return res.status(409).json({ error: "essa sala já está reservada nesse horário" });
  const ev = S.createEvent(ctx.space.id, req.user!.id, { title, description, mapId, zoneId, startsAt: s, endsAt: e });
  await matchMaker.presence.publish(`space:${ctx.space.id}`, "events");
  res.json({ event: ev });
});
api.delete("/spaces/:slug/events/:id", requireAuth, async (req: AuthedRequest, res) => {
  const ctx = loadSpace(req, res, "member"); if (!ctx) return;
  const ev = S.getEvent(req.params.id as string);
  if (!ev || ev.space_id !== ctx.space.id) return bad(res, "evento não encontrado", 404);
  if (ev.created_by !== req.user!.id && !S.can.moderate(ctx.role)) return bad(res, "sem permissão", 403);
  S.deleteEvent(ctx.space.id, ev.id);
  await matchMaker.presence.publish(`space:${ctx.space.id}`, "events");
  res.json({ ok: true });
});

// ---------------------------------------------------------------- mural & search
api.get("/spaces/:slug/pins", requireAuth, (req: AuthedRequest, res) => {
  const ctx = loadSpace(req, res, "guest"); if (!ctx) return;
  res.json({ pins: S.listPins(ctx.space.id) });
});
api.post("/spaces/:slug/pins", requireAuth, async (req: AuthedRequest, res) => {
  const ctx = loadSpace(req, res, "moderator"); if (!ctx) return;
  const text = String(req.body?.text ?? "").trim();
  if (!text) return bad(res, "texto obrigatório");
  const id = S.addPin(ctx.space.id, null, text, req.user!.id, req.user!.name);
  await matchMaker.presence.publish(`space:${ctx.space.id}`, "pins");
  res.json({ id });
});
api.delete("/spaces/:slug/pins/:id", requireAuth, async (req: AuthedRequest, res) => {
  const ctx = loadSpace(req, res, "moderator"); if (!ctx) return;
  S.removePin(ctx.space.id, Number(req.params.id));
  await matchMaker.presence.publish(`space:${ctx.space.id}`, "pins");
  res.json({ ok: true });
});
api.get("/spaces/:slug/search", requireAuth, (req: AuthedRequest, res) => {
  const ctx = loadSpace(req, res, "guest"); if (!ctx) return;
  const q = String(req.query.q ?? "").trim().slice(0, 80);
  if (q.length < 2) return res.json({ messages: [] });
  res.json({ messages: S.searchMessages(ctx.space.id, req.user!.id, q) });
});

// ---------------------------------------------------------------- admin: stats + mod log
api.get("/spaces/:slug/stats", requireAuth, (req: AuthedRequest, res) => {
  const ctx = loadSpace(req, res, "moderator"); if (!ctx) return;
  res.json({ stats: S.stats(ctx.space.id), modLog: S.listModLog(ctx.space.id) });
});

// ---------------------------------------------------------------- uploads (images for objects / logo)
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(path.dirname(DB_PATH === ":memory:" ? path.join(process.cwd(), "data", "x") : DB_PATH), "uploads");
const MAX_UPLOAD = 4 * 1024 * 1024;
const MIMES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };
api.post("/spaces/:slug/uploads", requireAuth, express.raw({ type: Object.keys(MIMES), limit: MAX_UPLOAD }), (req: AuthedRequest, res) => {
  const ctx = loadSpace(req, res, "moderator"); if (!ctx) return;
  const mime = req.headers["content-type"] ?? "";
  const ext = MIMES[mime];
  const body = req.body as Buffer;
  if (!ext || !Buffer.isBuffer(body) || !body.length) return bad(res, "envie uma imagem png, jpg, gif ou webp");
  const id = uid("up_");
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, `${id}.${ext}`), body);
  const name = String(req.query.name ?? "imagem").slice(0, 80);
  S.recordUpload(ctx.space.id, req.user!.id, `${id}.${ext}`, name, mime, body.length);
  res.json({ id: `${id}.${ext}`, url: `/uploads/${id}.${ext}`, name });
});
api.get("/spaces/:slug/uploads", requireAuth, (req: AuthedRequest, res) => {
  const ctx = loadSpace(req, res, "guest"); if (!ctx) return;
  res.json({ uploads: S.listUploads(ctx.space.id).map((u) => ({ ...u, url: `/uploads/${u.id}` })) });
});
api.delete("/spaces/:slug/uploads/:id", requireAuth, (req: AuthedRequest, res) => {
  const ctx = loadSpace(req, res, "moderator"); if (!ctx) return;
  const up = S.getUpload(req.params.id as string);
  if (!up || up.space_id !== ctx.space.id) return bad(res, "não encontrado", 404);
  try { fs.unlinkSync(path.join(UPLOAD_DIR, up.id)); } catch {}
  S.deleteUpload(up.id);
  res.json({ ok: true });
});
export const uploadsDir = UPLOAD_DIR;

// ---------------------------------------------------------------- media (LiveKit)
api.get("/media/config", (_req, res) => res.json({ enabled: mediaEnabled(), url: mediaUrl() }));
api.post("/spaces/:slug/media/token", requireAuth, async (req: AuthedRequest, res) => {
  const ctx = loadSpace(req, res, "guest"); if (!ctx) return;
  if (!mediaEnabled()) return bad(res, "áudio/vídeo não configurado neste servidor", 503);
  const group = String(req.body?.group ?? "");
  if (!/^(zone|near|stage):/.test(group)) return bad(res, "grupo inválido");
  const token = await mintToken(`${ctx.space.id}:${group}`, req.user!.id, req.user!.name);
  res.json({ token, url: mediaUrl() });
});

// ---------------------------------------------------------------- Google login (needs GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)
const googleEnabled = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
// AUTH_MODE=google turns off e-mail/password accounts; ALLOW_GUESTS=0 turns off guest entry.
const passwordEnabled = () => process.env.AUTH_MODE !== "google";
const guestsEnabled = () => process.env.ALLOW_GUESTS !== "0";
const allowedDomains = () => (process.env.GOOGLE_ALLOWED_DOMAINS ?? "").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
const publicUrl = (req: any) => (process.env.PUBLIC_URL ?? `${req.headers["x-forwarded-proto"] ?? req.protocol}://${req.get("host")}`).replace(/\/$/, "");
api.get("/auth/providers", (_req, res) => res.json({ google: googleEnabled(), password: passwordEnabled(), guest: guestsEnabled(), allowedDomains: allowedDomains() }));
api.get("/auth/google", (req, res) => {
  if (!googleEnabled()) return bad(res, "login Google não configurado", 503);
  const redirect = `${publicUrl(req)}/api/auth/google/callback`;
  const state = uid("st_");
  const hd = allowedDomains().length === 1 ? `&hd=${encodeURIComponent(allowedDomains()[0])}` : "";
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(process.env.GOOGLE_CLIENT_ID!)}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=openid%20email%20profile&state=${state}&prompt=select_account${hd}`;
  res.redirect(url);
});
api.get("/auth/google/callback", async (req, res) => {
  if (!googleEnabled()) return bad(res, "login Google não configurado", 503);
  try {
    const redirect = `${publicUrl(req)}/api/auth/google/callback`;
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code: String(req.query.code ?? ""), client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, redirect_uri: redirect, grant_type: "authorization_code" }) });
    const tok = await tokenRes.json() as any;
    if (!tok.access_token) throw new Error("token inválido");
    const info = await (await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { authorization: `Bearer ${tok.access_token}` } })).json() as any;
    if (!info.sub || !info.email) throw new Error("perfil inválido");
    if (info.email_verified === false) throw new Error("e-mail não verificado no Google");
    const domains = allowedDomains();
    const domain = String(info.email).split("@")[1]?.toLowerCase();
    if (domains.length && !domains.includes(domain)) return res.status(403).send(`<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;background:#0b1220;color:#e5e7eb;display:flex;align-items:center;justify-content:center;height:100vh"><div><h2>Conta não autorizada</h2><p>Use um e-mail de ${domains.map((d) => "@" + d).join(" ou ")}.</p><a href="/" style="color:#93c5fd">voltar</a></div>`);
    const db = getDb();
    let row = db.prepare("SELECT * FROM users WHERE google_id = ? OR email = ?").get(info.sub, String(info.email).toLowerCase()) as unknown as UserRow | undefined;
    if (!row) {
      const id = uid("u_");
      db.prepare("INSERT INTO users (id, email, name, password_hash, avatar, is_guest, created_at, google_id) VALUES (?, ?, ?, NULL, '{}', 0, ?, ?)").run(id, String(info.email).toLowerCase(), cleanName(info.name) || "Usuário", now(), info.sub);
      row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as unknown as UserRow;
    } else db.prepare("UPDATE users SET google_id = ? WHERE id = ?").run(info.sub, row.id);
    const token = signToken({ sub: row.id });
    res.send(`<!doctype html><script>localStorage.setItem("gather-lite:token", ${JSON.stringify(token)}); location.replace("/");</script>`);
  } catch (e: any) { res.status(400).send(`Falha no login Google: ${e.message}`); }
});
