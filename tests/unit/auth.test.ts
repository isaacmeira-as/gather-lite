import { test } from "node:test";
import assert from "node:assert/strict";
process.env.DB_PATH = ":memory:";
const { hashPassword, verifyPassword, signToken, verifyToken, userFromToken, createGuest } = await import("../../src/server/auth");

test("passwords hash and verify", () => {
  const h = hashPassword("segredo123");
  assert.ok(h.includes(":"));
  assert.ok(verifyPassword("segredo123", h));
  assert.ok(!verifyPassword("errada", h));
  assert.ok(!verifyPassword("x", null));
});

test("tokens round-trip and reject tampering", () => {
  const t = signToken({ sub: "u_1" });
  assert.equal(verifyToken(t)?.sub, "u_1");
  assert.equal(verifyToken(t.slice(0, -2) + "zz"), null);
  assert.equal(verifyToken("garbage"), null);
  assert.equal(verifyToken(undefined), null);
});

test("guest users resolve from token", () => {
  const g = createGuest("Visitante <script>");
  const user = userFromToken(signToken({ sub: g.id }));
  assert.equal(user?.name, "Visitante <script>");
  assert.ok(user?.isGuest);
  assert.equal(userFromToken(signToken({ sub: "nope" })), null);
});
