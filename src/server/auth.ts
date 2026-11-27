import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { getDb, uid, now } from "./db";

const SECRET = process.env.JWT_SECRET ?? (process.env.NODE_ENV === "production" ? undefined : "dev-secret-change-me");
if (!SECRET) throw new Error("JWT_SECRET must be set in production");
const TOKEN_TTL_MS = 30 * 24 * 3600 * 1000;

export interface UserRow { id: string; email: string | null; name: string; password_hash: string | null; avatar: string; is_guest: number; created_at: number; status_text?: string }
export interface AuthUser { id: string; name: string; email: string | null; isGuest: boolean; avatar: any; statusText?: string }

// ---- passwords (scrypt, no native deps)
export function hashPassword(pw: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pw, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}
export function verifyPassword(pw: string, stored: string | null) {
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  const test = crypto.scryptSync(pw, salt, 32);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), test);
}

// ---- tokens (HMAC-signed, JWT-like, no deps)
const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");
export function signToken(payload: Record<string, any>) {
  const body = b64(JSON.stringify({ ...payload, exp: now() + TOKEN_TTL_MS }));
  const sig = crypto.createHmac("sha256", SECRET!).update(body).digest("base64url");
  return `${body}.${sig}`;
}
export function verifyToken(token?: string | null): { sub: string; exp: number } | null {
  if (!token || typeof token !== "string") return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", SECRET!).update(body).digest("base64url");
  if (expected.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (payload.exp < now()) return null;
    return payload;
  } catch { return null; }
}

export function toAuthUser(u: UserRow): AuthUser {
  let avatar = {};
  try { avatar = JSON.parse(u.avatar); } catch {}
  return { id: u.id, name: u.name, email: u.email, isGuest: !!u.is_guest, avatar, statusText: u.status_text ?? "" };
}

export function userFromToken(token?: string | null): AuthUser | null {
  const p = verifyToken(token);
  if (!p) return null;
  const row = getDb().prepare("SELECT * FROM users WHERE id = ?").get(p.sub) as unknown as UserRow | undefined;
  return row ? toAuthUser(row) : null;
}

export function createGuest(name: string): UserRow {
  const db = getDb();
  const id = uid("u_");
  db.prepare("INSERT INTO users (id, email, name, password_hash, avatar, is_guest, created_at) VALUES (?, NULL, ?, NULL, '{}', 1, ?)").run(id, name, now());
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as unknown as UserRow;
}

// ---- express middleware
export interface AuthedRequest extends Request { user?: AuthUser }
export function authMiddleware(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : (req.query.token as string | undefined);
  req.user = userFromToken(token) ?? undefined;
  next();
}
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: "não autenticado" });
  next();
}
