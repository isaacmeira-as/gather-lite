import { test } from "node:test";
import assert from "node:assert/strict";
process.env.DB_PATH = ":memory:";
const S = await import("../../src/server/spaces");
const { createGuest } = await import("../../src/server/auth");
const { getDb } = await import("../../src/server/db");

const owner = createGuest("Dona");
const other = createGuest("Outro");

test("createSpace makes office + garden with portals both ways", () => {
  const sp = S.createSpace(owner.id, "Meu Escritório!", "office");
  assert.equal(sp.slug, "meu-escritorio");
  const maps = S.listMaps(sp.id);
  assert.equal(maps.length, 2);
  const office = S.loadMapData(maps[0].id)!;
  const garden = S.loadMapData(maps[1].id)!;
  assert.equal(office.portals[0].targetMapId, maps[1].id);
  assert.equal(garden.portals[0].targetMapId, maps[0].id);
  assert.equal(S.roleOf(sp.id, owner.id), "owner");
  // slug collision
  assert.equal(S.createSpace(owner.id, "Meu Escritório!", "blank").slug, "meu-escritorio-2");
});

test("public spaces grant guest role, private ones don't", () => {
  const pub = S.createSpace(owner.id, "Publico", "blank", false);
  const priv = S.createSpace(owner.id, "Privado", "blank", true);
  assert.equal(S.effectiveRole(pub, other.id), "guest");
  assert.equal(S.effectiveRole(priv, other.id), null);
  assert.equal(S.can.build("guest"), false);
  assert.equal(S.can.build("moderator"), true);
});

test("invites grant roles, respect limits, and bans block", () => {
  const priv = S.createSpace(owner.id, "Privado2", "blank", true);
  const tok = S.createInvite(priv.id, owner.id, "member", undefined, 1);
  const r = S.acceptInvite(tok, other.id);
  assert.ok("space" in r && r.role === "member");
  assert.equal(S.effectiveRole(priv, other.id), "member");
  const r2 = S.acceptInvite(tok, createGuest("Terceiro").id);
  assert.ok("error" in r2, "max uses respected");
  S.ban(priv.id, other.id, "spam");
  assert.equal(S.effectiveRole(priv, other.id), null);
  assert.ok("error" in S.acceptInvite(S.createInvite(priv.id, owner.id), other.id));
  S.unban(priv.id, other.id);
  assert.ok("space" in S.acceptInvite(S.createInvite(priv.id, owner.id), other.id));
});

test("chat history only returns what the user could see", () => {
  const sp = S.createSpace(owner.id, "Chat", "blank");
  const m = S.listMaps(sp.id)[0];
  const base = { spaceId: sp.id, mapId: m.id, fromName: "Dona", fromColor: "#fff", ts: Date.now() };
  S.saveMessage({ ...base, scope: "everyone", from: owner.id, text: "geral" });
  S.saveMessage({ ...base, scope: "nearby", from: owner.id, text: "perto de outro", recipients: [other.id] });
  S.saveMessage({ ...base, scope: "nearby", from: owner.id, text: "perto de ninguem", recipients: [] });
  S.saveMessage({ ...base, scope: "dm", from: owner.id, to: other.id, text: "dm" });
  const third = createGuest("Terceiro");
  const forOther = S.historyFor(sp.id, other.id).map((x) => x.text);
  const forThird = S.historyFor(sp.id, third.id).map((x) => x.text);
  assert.deepEqual(forOther, ["geral", "perto de outro", "dm"]);
  assert.deepEqual(forThird, ["geral"]);
});

test("object state and map persistence", () => {
  const sp = S.createSpace(owner.id, "Obj", "blank");
  S.setObjectState(sp.id, "poll:x", { votes: { a: 1 } });
  assert.deepEqual(S.getObjectState(sp.id, "poll:x"), { votes: { a: 1 } });
  const m = S.listMaps(sp.id)[0];
  const data = S.loadMapData(m.id)!;
  data.zones.push({ id: "z1", name: "Z", x: 2, y: 2, w: 3, h: 3, color: "#ff0000" });
  S.saveMapData(m.id, data);
  assert.equal(S.loadMapData(m.id)!.zones[0].name, "Z");
  getDb().prepare("DELETE FROM spaces WHERE id = ?").run(sp.id);
  assert.equal(S.getMap(m.id), undefined, "maps cascade on space delete");
});
