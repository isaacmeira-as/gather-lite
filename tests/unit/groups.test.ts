import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDefaultMap, buildCoworkingMap, buildClassroomMap, buildEventMap, isWalkable, findPath, interactableNear } from "../../src/shared/map";
import { conversationGroups } from "../../src/shared/groups";

const m = buildDefaultMap();

test("proximity clusters, zones and stage groups", () => {
  const g = conversationGroups(m, "map1", [{ id: "a", x: 7, y: 7 }, { id: "b", x: 9, y: 7 }, { id: "c", x: 12, y: 7 }, { id: "d", x: 30, y: 14 }, { id: "e", x: 17, y: 8 }, { id: "f", x: 15, y: 8 }]);
  assert.equal(g.a, g.b, "a and b close");
  assert.equal(g.b, g.c, "chained cluster: c is near b but not a");
  assert.equal(g.d, "", "alone");
  assert.equal(g.e, "zone:map1:sala-a");
  assert.equal(g.e, g.f, "same zone");
  assert.ok(g.a.startsWith("near:map1:"));
  const stage = conversationGroups(m, "map1", [{ id: "a", x: 17, y: 19 }, { id: "d", x: 40, y: 25 }]);
  assert.equal(stage.a, "stage:map1"); assert.equal(stage.d, "stage:map1");
});

test("new templates are consistent: walkable spawn, reachable interactables", () => {
  for (const [name, mp] of [["coworking", buildCoworkingMap()], ["classroom", buildClassroomMap()], ["event", buildEventMap()]] as const) {
    assert.ok(isWalkable(mp, mp.spawn.x, mp.spawn.y), `${name}: spawn walkable`);
    for (const it of mp.interactables) {
      const path = findPath(mp, mp.spawn.x, mp.spawn.y, it.x, it.y);
      assert.ok(path, `${name}: ${it.id} reachable`);
      const last = path![path!.length - 1];
      const near = path!.length >= 2 ? path![path!.length - 2] : mp.spawn;
      assert.ok(interactableNear(mp, near.x, near.y) || interactableNear(mp, last.x, last.y), `${name}: ${it.id} usable from the path`);
    }
    for (const z of mp.zones) assert.ok(z.x + z.w <= mp.width && z.y + z.h <= mp.height, `${name}: zone ${z.id} inside`);
  }
});
