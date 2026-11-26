import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDefaultMap, isWalkable, stepTarget, zoneAt, canHear, findPath, interactableNear, isSpotlight, idx, NEARBY_RADIUS } from "../../src/shared/map";
import { O, F, isSolid, DIR } from "../../src/shared/tiles";

const m = buildDefaultMap();

test("map has consistent dimensions", () => {
  assert.equal(m.floor.length, m.width * m.height);
  assert.equal(m.objects.length, m.width * m.height);
});

test("spawn is walkable and inside the lobby", () => {
  assert.ok(isWalkable(m, m.spawn.x, m.spawn.y));
  assert.equal(zoneAt(m, m.spawn.x, m.spawn.y), null);
});

test("walls and water block, chairs and doors don't", () => {
  assert.ok(isSolid(F.WOOD, O.WALL));
  assert.ok(isSolid(F.WATER, O.NONE));
  assert.ok(!isSolid(F.WOOD, O.CHAIR));
  assert.ok(!isSolid(F.WOOD, O.DOOR));
  assert.ok(!isWalkable(m, 0, 0)); // fence
  assert.ok(!isWalkable(m, -1, 5));
  assert.ok(!isWalkable(m, m.width, 5));
});

test("stepTarget refuses to walk into a wall", () => {
  // Tile (2,7) is the building's west wall; from (3,7) going LEFT must fail.
  assert.equal(m.objects[idx(m, 2, 7)], O.WALL);
  assert.equal(stepTarget(m, 3, 7, DIR.LEFT), null);
  assert.deepEqual(stepTarget(m, 3, 7, DIR.RIGHT), { x: 4, y: 7 });
  assert.equal(stepTarget(m, 3, 7, 99), null);
});

test("private zones are detected and isolate conversations", () => {
  const inA = { x: 17, y: 8 };
  const inA2 = { x: 15, y: 8 };
  const outside = { x: 17, y: 11 };
  const inB = { x: 27, y: 8 };
  assert.equal(zoneAt(m, inA.x, inA.y)?.id, "sala-a");
  assert.equal(zoneAt(m, inB.x, inB.y)?.id, "sala-b");
  assert.ok(canHear(m, inA, inA2));
  assert.ok(!canHear(m, inA, outside), "zone member must not hear someone just outside the door");
  assert.ok(!canHear(m, inA, inB));
});

test("proximity radius applies in the open area", () => {
  const a = { x: 10, y: 14 };
  assert.ok(canHear(m, a, { x: 10 + NEARBY_RADIUS, y: 14 }));
  assert.ok(!canHear(m, a, { x: 10 + NEARBY_RADIUS + 1, y: 14 }));
  assert.ok(!canHear(m, a, { x: 13, y: 17 })); // diagonal 3,3 => 4.24 > 4
});

test("spotlight tile exists on the stage", () => {
  assert.ok(isSpotlight(m, 17, 19));
  assert.ok(!isSpotlight(m, 16, 19));
});

test("pathfinding goes through doors and around furniture", () => {
  const path = findPath(m, m.spawn.x, m.spawn.y, 17, 8); // lobby -> meeting room A
  assert.ok(path && path.length > 0);
  assert.ok(path!.some((p) => p.x === 17 && p.y === 10), "path must use the door at (17,10)");
  for (const p of path!) assert.ok(isWalkable(m, p.x, p.y));
  assert.deepEqual(path![path!.length - 1], { x: 17, y: 8 });
  assert.ok(findPath(m, 5, 5, 1, 1), "garden corner is reachable through the doors");
  assert.deepEqual(findPath(m, 5, 5, 5, 5), []);
  const toTable = findPath(m, 14, 8, 17, 6)!; // goal is a table: path ends on it, everything before is walkable
  assert.deepEqual(toTable[toTable.length - 1], { x: 17, y: 6 });
  for (const p of toTable.slice(0, -1)) assert.ok(isWalkable(m, p.x, p.y));
  assert.equal(findPath(m, 5, 5, 36, 5), null, "water in the middle of the pond is unreachable");
});

test("interactables are found on adjacent tiles only", () => {
  assert.equal(interactableNear(m, 17, 4)?.id, "whiteboard-a");
  assert.equal(interactableNear(m, 17, 5), null);
  assert.equal(interactableNear(m, 6, 5)?.id, "recepcao");
});
