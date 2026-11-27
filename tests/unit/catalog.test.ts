import { test } from "node:test";
import assert from "node:assert/strict";
import { CATALOG, CATALOG_START, CATALOG_END, CATEGORIES, searchCatalog, BASES } from "../../src/shared/catalog";
import { O, F, isSolid, SITTABLE, isValidObject, TALL_OBJECTS, WALL_MOUNTED } from "../../src/shared/tiles";

test("catalog has more than 1000 unique objects across all categories", () => {
  assert.ok(CATALOG.length > 1000, `only ${CATALOG.length}`);
  assert.equal(new Set(CATALOG.map((i) => i.id)).size, CATALOG.length);
  assert.ok(CATALOG.every((i) => i.id >= CATALOG_START && i.id < CATALOG_END));
  assert.ok(CATALOG_START > Math.max(...Object.values(O), ...Object.values(F), 60), "no overlap with legacy and render-only ids");
  for (const c of CATEGORIES) assert.ok(CATALOG.some((i) => i.cat === c.id), `category ${c.id} empty`);
  assert.ok(new Set(BASES.map((b) => b.base)).size === BASES.length, "unique bases");
});

test("collision and behaviour flags come from the catalog", () => {
  const sofa = CATALOG.find((i) => i.base === "sofa")!;
  const chair = CATALOG.find((i) => i.base === "chair")!;
  const rug = CATALOG.find((i) => i.base === "rug")!;
  const wall = CATALOG.find((i) => i.base === "wall")!;
  const tv = CATALOG.find((i) => i.base === "tvWall")!;
  assert.ok(isSolid(F.WOOD, sofa.id)); assert.ok(!isSolid(F.WOOD, chair.id)); assert.ok(!isSolid(F.WOOD, rug.id));
  assert.ok(SITTABLE.has(chair.id)); assert.ok(!SITTABLE.has(sofa.id));
  assert.ok(TALL_OBJECTS.has(wall.id)); assert.ok(WALL_MOUNTED.has(tv.id));
  assert.ok(isValidObject(sofa.id) && isValidObject(O.WALL) && isValidObject(0) && !isValidObject(CATALOG_END + 500) && !isValidObject(50));
});

test("search by words, category and colour (accent-insensitive)", () => {
  assert.ok(searchCatalog("sofa azul").some((i) => i.name === "Sofá azul"));
  assert.ok(searchCatalog("", "cozinha").every((i) => i.cat === "cozinha"));
  assert.ok(searchCatalog("", "all", "Vermelho").every((i) => i.colorName === "Vermelho"));
  assert.ok(searchCatalog("luz").some((i) => i.base === "floorLamp"), "tags are searchable");
  assert.equal(searchCatalog("xyzzy").length, 0);
});
