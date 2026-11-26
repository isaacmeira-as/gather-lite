/* End-to-end suite: boots the server with a temp SQLite DB, drives real browsers
   (Playwright) through accounts, spaces, invites, roles, maps, mapmaker, objects,
   social features and the original movement/chat checks. `npm run test:e2e`. */
import { chromium, Browser, Page, BrowserContext } from "playwright";
import { spawn, ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const PORT = 2599;
const BASE = `http://localhost:${PORT}`;
const DB = path.join(os.tmpdir(), `gather-lite-e2e-${Date.now()}.sqlite`);
const SHOTS = path.join(process.cwd(), "tests", "e2e", "screenshots");
fs.mkdirSync(SHOTS, { recursive: true });

let passed = 0, failed = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const assert = (cond: any, msg: string) => { if (!cond) throw new Error(msg); };
async function step(name: string, fn: () => Promise<void>) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e: any) { failed++; console.log(`  ✗ ${name}\n      ${(e?.message ?? e).toString().split("\n")[0]}`); }
}
async function waitFor(fn: () => Promise<boolean>, msg: string, timeout = 6000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { try { if (await fn()) return; } catch {} await sleep(100); }
  throw new Error("timeout: " + msg);
}

// ---------- API helpers (node side)
async function api(method: string, p: string, body?: any, token?: string) {
  const r = await fetch(`${BASE}/api${p}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, ...data };
}
const register = (email: string, name: string) => api("POST", "/auth/register", { email, password: "senha123", name });

// ---------- page helpers
const me = (p: Page) => p.evaluate(() => { const n = (window as any).__net; const m = n.me; return { x: m.x, y: m.y, zone: m.zone, emote: m.emote, status: m.status, sitting: m.sitting, name: m.name, id: n.sessionId, role: m.role, ghost: m.ghost, avatar: m.avatar, userId: m.userId }; });
const players = (p: Page) => p.evaluate(() => [...(window as any).__net.state.players.values()].map((m: any) => ({ id: m.id, name: m.name, x: m.x, y: m.y, connected: m.connected, role: m.role, avatar: m.avatar, emote: m.emote, status: m.status, ghost: m.ghost })));
const mapName = (p: Page) => p.evaluate(() => (window as any).__net.state.mapName);
const teleport = async (p: Page, x: number, y: number) => {
  // Cancel any auto-walk/follow first so the avatar doesn't drift after the jump.
  await p.evaluate(({ x, y }) => { const s = (window as any).__scene; if (s) { s.autoPath = null; s.followTarget = null; } (window as any).__net.teleport(x, y); }, { x, y });
  await waitFor(async () => { const m = await me(p); return m.x === x && m.y === y; }, `teleport to ${x},${y}`);
};
const chatTexts = (p: Page) => p.$$eval("#chat-messages .msg:not(.system)", (els) => els.map((e) => e.textContent ?? ""));
const unfocus = (p: Page) => p.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
async function sendChat(p: Page, text: string, scope: "nearby" | "everyone" = "nearby") {
  await p.evaluate(() => (window as any).__bus.emit("ui:focus-chat"));
  await p.selectOption("#chat-scope", scope);
  await p.fill("#chat-input", text);
  await p.press("#chat-input", "Enter");
}
const send = (p: Page, type: string, data: any) => p.evaluate(({ type, data }) => (window as any).__net.send(type, data), { type, data });
const mapData = (p: Page) => p.evaluate(() => { const m = (window as any).__scene.mapData; return { zones: m.zones, interactables: m.interactables, portals: m.portals, spawn: m.spawn, objects: m.objects, floor: m.floor, width: m.width }; });

interface Session { page: Page; ctx: BrowserContext; errors: string[] }
async function open(browser: Browser, url: string, token?: string, opts: any = {}): Promise<Session> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...opts });
  if (token) await ctx.addInitScript((t) => localStorage.setItem("gather-lite:token", t), token);
  await ctx.addInitScript(() => localStorage.setItem("gather-lite:picked", "1")); // skip the character picker
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept("APAGAR"));
  await page.goto(url);
  return { page, ctx, errors };
}
async function joinSpace(browser: Browser, slug: string, token?: string, query = "", opts: any = {}) {
  const s = await open(browser, `${BASE}/s/${slug}${query}`, token, opts);
  await s.page.waitForSelector("#hud:not([hidden])", { timeout: 20000 });
  await s.page.waitForFunction(() => (window as any).__scene?.me, null, { timeout: 15000 });
  return s;
}

async function main() {
  try { await fetch(`${BASE}/healthz`); throw new Error(`port ${PORT} is already in use`); } catch (e: any) { if (!/fetch failed/.test(String(e))) throw e; }
  const tsx = path.join(process.cwd(), "node_modules", ".bin", "tsx");
  const server: ChildProcess = spawn(tsx, ["src/server/index.ts"], { env: { ...process.env, PORT: String(PORT), DB_PATH: DB, JWT_SECRET: "e2e-secret" }, stdio: ["ignore", "pipe", "pipe"] });
  const serverLog: string[] = [];
  server.stdout!.on("data", (d) => serverLog.push(String(d)));
  server.stderr!.on("data", (d) => serverLog.push(String(d)));
  const stopServer = () => { try { server.kill("SIGTERM"); } catch {} };
  process.on("exit", stopServer);
  await waitFor(async () => { try { return (await fetch(`${BASE}/healthz`)).ok; } catch { return false; } }, "server up", 20000);
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });

  // =========================================================== accounts & spaces (UI)
  let slug = "";
  let aliceToken = "";
  await step("register through the home page and create a space", async () => {
    const s = await open(browser, `${BASE}/`);
    await s.page.click('button[data-m="register"]');
    await s.page.fill('[name="name"]', "Alice");
    await s.page.fill('[name="email"]', "alice@test.dev");
    await s.page.fill('[name="password"]', "senha123");
    await s.page.click('button[type="submit"]');
    await s.page.waitForSelector("form.create");
    aliceToken = await s.page.evaluate(() => localStorage.getItem("gather-lite:token")!);
    await s.page.fill('form.create [name="name"]', "Escritório da Alice");
    await s.page.click("form.create button.primary");
    await s.page.waitForURL(/\/s\/escritorio-da-alice/);
    slug = "escritorio-da-alice";
    await s.page.waitForSelector("#hud:not([hidden])");
    await s.page.waitForFunction(() => (window as any).__scene?.me);
    assert((await me(s.page)).role === "owner", "creator is owner");
    assert((await s.page.textContent("#space-name"))!.includes("Alice"), "space name in topbar");
    await s.ctx.close();
  });

  await step("character picker appears before the first entry and the avatar button edits it in-game", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript((t) => localStorage.setItem("gather-lite:token", t), aliceToken);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/s/${slug}`);
    await page.waitForSelector(".overlay .avatar-editor");
    await page.click('.avatar-editor .chip:has-text("Chapéu")');
    await page.click(".overlay button.primary");
    await page.waitForFunction(() => (window as any).__scene?.me, null, { timeout: 15000 });
    await waitFor(async () => JSON.parse((await me(page)).avatar).accessory === 2, "picked accessory applied");
    await page.click('#toolbar button[data-action="avatar"]');
    await page.waitForSelector("#modal:not([hidden]) .avatar-editor");
    await page.click('.avatar-editor .chip:has-text("Coroa")');
    await page.click("#modal button.primary");
    await waitFor(async () => JSON.parse((await me(page)).avatar).accessory === 4, "in-game edit applied");
    await page.screenshot({ path: path.join(SHOTS, "avatar.png") });
    await ctx.close();
  });

  await step("login form works and wrong password is rejected", async () => {
    const s = await open(browser, `${BASE}/`);
    await s.page.click('button[data-m="login"]');
    await s.page.fill('[name="email"]', "alice@test.dev");
    await s.page.fill('[name="password"]', "errada1");
    await s.page.click('button[type="submit"]');
    await waitFor(async () => (await s.page.textContent(".error"))!.includes("incorretos"), "error shown");
    await s.page.fill('[name="password"]', "senha123");
    await s.page.click('button[type="submit"]');
    await s.page.waitForSelector(".space-card");
    assert((await s.page.textContent(".space-card"))!.includes("Escritório da Alice"), "space listed on home");
    await s.ctx.close();
  });

  const bobReg = await register("bob@test.dev", "Bob");
  const carolReg = await register("carol@test.dev", "Carol");
  assert(bobReg.token && carolReg.token, "api register");

  // =========================================================== the main two sessions
  const A = await joinSpace(browser, slug, aliceToken);
  const B = await joinSpace(browser, slug, bobReg.token);
  const a = A.page, b = B.page;

  await step("both players see each other; Bob is a guest in a public space", async () => {
    await waitFor(async () => (await players(a)).length === 2 && (await players(b)).length === 2, "2 players");
    assert((await me(b)).role === "guest", "public space => guest");
    assert(await b.$eval('#toolbar button[data-action="build"]', (e) => (e as HTMLElement).hidden), "guest has no mapmaker button");
    assert(!(await a.$eval('#toolbar button[data-action="build"]', (e) => (e as HTMLElement).hidden)), "owner has mapmaker button");
  });

  await step("keyboard movement is server-validated and predicted locally", async () => {
    await teleport(a, 3, 7);
    await unfocus(a);
    await a.keyboard.down("ArrowLeft"); await sleep(400); await a.keyboard.up("ArrowLeft");
    assert((await me(a)).x === 3, "wall blocked movement");
    await a.keyboard.down("ArrowRight");
    await sleep(60);
    const predicted = await a.evaluate(() => (window as any).__scene.me.tileX);
    await sleep(500); await a.keyboard.up("ArrowRight");
    assert(predicted === 4, `sprite moved immediately on key press (got ${predicted})`);
    const after = await me(a);
    assert(after.x > 4 && after.x <= 9, `moved right to ${after.x}`);
    await waitFor(async () => (await players(b)).find((p) => p.name === "Alice")!.x === after.x, "Bob sees Alice's position");
  });

  await step("players block each other unless in ghost mode", async () => {
    await teleport(a, 6, 7); await teleport(b, 7, 7);
    await unfocus(a);
    await a.keyboard.down("ArrowRight"); await sleep(350); await a.keyboard.up("ArrowRight");
    assert((await me(a)).x === 6, "Bob blocks Alice");
    await a.keyboard.press("g");
    await waitFor(async () => (await me(a)).ghost === true, "ghost on");
    await a.keyboard.down("ArrowRight"); await sleep(350); await a.keyboard.up("ArrowRight");
    assert((await me(a)).x >= 7, "ghost walks through");
    await a.keyboard.press("g");
    await waitFor(async () => (await me(a)).ghost === false, "ghost off");
  });

  await step("click-to-move walks a path", async () => {
    await teleport(a, 7, 7);
    await a.evaluate(() => (window as any).__scene.walkTo(10, 8));
    await waitFor(async () => { const m = await me(a); return m.x === 10 && m.y === 8; }, "arrived", 5000);
  });

  await step("nearby / everyone / zone / spotlight chat scopes", async () => {
    await teleport(a, 7, 7); await teleport(b, 8, 7);
    await sendChat(a, "oi bob, perto");
    await waitFor(async () => (await chatTexts(b)).some((t) => t.includes("oi bob, perto")), "nearby heard");
    await teleport(b, 11, 16);
    await sendChat(a, "longe demais"); await sleep(500);
    assert(!(await chatTexts(b)).some((t) => t.includes("longe demais")), "far not heard");
    await sendChat(a, "anúncio geral", "everyone");
    await waitFor(async () => (await chatTexts(b)).some((t) => t.includes("anúncio geral")), "everyone heard");
    await teleport(a, 17, 8); await teleport(b, 17, 11);
    await waitFor(async () => (await a.textContent("#zone-indicator"))!.includes("Jacarandá"), "zone indicator");
    await sendChat(a, "segredo da sala"); await sleep(500);
    assert(!(await chatTexts(b)).some((t) => t.includes("segredo da sala")), "outside zone not heard");
    await teleport(b, 15, 8);
    await sendChat(a, "agora sim");
    await waitFor(async () => (await chatTexts(b)).some((t) => t.includes("agora sim")), "zone mate heard");
    await teleport(a, 17, 19); await teleport(b, 40, 25);
    await sendChat(a, "atenção pessoal");
    await waitFor(async () => (await chatTexts(b)).some((t) => t.includes("atenção pessoal") && t.includes("spotlight")), "spotlight heard");
  });

  await step("chat is rate limited", async () => {
    await teleport(b, 20, 21);
    const before = (await chatTexts(b)).length;
    for (let i = 0; i < 6; i++) await a.evaluate((i) => (window as any).__net.chat("spam " + i, "everyone"), i);
    await sleep(700);
    const got = (await chatTexts(b)).length - before;
    assert(got >= 1 && got <= 3, `burst of 6 delivered ${got}`);
  });

  await step("direct messages, waves and summon requests", async () => {
    const bobId = (await me(b)).id;
    await a.evaluate((id) => (window as any).__net.chat("só pra você", "dm", id), bobId);
    await waitFor(async () => (await chatTexts(b)).some((t) => t.includes("só pra você")), "Bob gets DM");
    await send(a, "wave", { to: bobId });
    await waitFor(async () => (await b.textContent("#toasts"))!.includes("acenou"), "wave toast");
    await teleport(a, 9, 7); await teleport(b, 25, 13);
    await send(a, "summon", { to: bobId });
    await b.waitForSelector('#toasts .toast:has-text("chamando") button');
    await b.click('#toasts .toast:has-text("chamando") button');
    await waitFor(async () => { const m = await me(b); return Math.abs(m.x - 9) + Math.abs(m.y - 7) <= 1; }, "Bob walked to Alice", 15000);
  });

  await step("follow mode keeps Bob next to Alice", async () => {
    const aliceId = (await me(a)).id;
    await teleport(a, 9, 7); await teleport(b, 11, 7);
    await b.evaluate((id) => (window as any).__bus.emit("ui:follow", id), aliceId);
    await a.evaluate(() => (window as any).__scene.walkTo(9, 14));
    await waitFor(async () => { const m = await me(a); return m.x === 9 && m.y === 14; }, "Alice arrived", 8000);
    await waitFor(async () => { const m = await me(b); return Math.abs(m.x - 9) + Math.abs(m.y - 14) <= 1; }, "Bob followed", 10000);
    await b.evaluate(() => (window as any).__bus.emit("ui:follow", null));
  });

  await step("emotes, status, sitting, avatar profile update", async () => {
    await unfocus(a);
    await a.keyboard.press("1");
    await waitFor(async () => (await players(b)).find((p) => p.name === "Alice")!.emote === "👋", "Bob sees emote");
    await a.selectOption("#status-select", "dnd");
    await waitFor(async () => (await players(b)).find((p) => p.name === "Alice")!.status === "dnd", "Bob sees status");
    await teleport(a, 15, 5);
    await waitFor(async () => (await me(a)).sitting === true, "sitting");
    await send(a, "profile", { name: "Alice M.", avatar: { skin: 3, hair: 1, hairColor: 2, shirt: "#ec4899", pants: 1, accessory: 1 } });
    await waitFor(async () => { const p = (await players(b)).find((p) => p.name === "Alice M."); return !!p && p.avatar.includes("#ec4899"); }, "Bob sees new name and avatar");
    const meApi = await api("GET", "/auth/me", undefined, aliceToken);
    assert(meApi.user.name === "Alice M." && meApi.user.avatar.accessory === 1, "profile persisted in DB");
  });

  await step("objects: note, shared board, poll, timer, image", async () => {
    await teleport(a, 6, 5); await unfocus(a); await a.keyboard.press("x");
    await a.waitForSelector("#modal:not([hidden]) pre");
    assert((await a.textContent("#modal pre"))!.includes("Bem-vindo"), "note text");
    await a.keyboard.press("Escape");
    await teleport(a, 17, 4); await unfocus(a); await a.keyboard.press("x");
    await a.waitForSelector("#modal:not([hidden]) textarea");
    await a.fill("#modal textarea", "pauta: lançar");
    await teleport(b, 18, 3); await unfocus(b); await b.keyboard.press("x");
    await b.waitForSelector("#modal:not([hidden]) textarea");
    await waitFor(async () => (await b.inputValue("#modal textarea")) === "pauta: lançar", "board synced");
    await a.keyboard.press("Escape"); await b.keyboard.press("Escape");
    // poll at (24,13), stand at (24,14)? that's rug floor (walkable)
    await teleport(a, 24, 14); await unfocus(a); await a.keyboard.press("x");
    await a.waitForSelector("#modal:not([hidden]) .poll-option");
    await a.click(".poll-option:nth-child(2)");
    await teleport(b, 23, 13); await unfocus(b); await b.keyboard.press("x");
    await b.waitForSelector("#modal:not([hidden]) .poll-option");
    await waitFor(async () => (await b.textContent(".poll-total"))!.startsWith("1 voto"), "Bob sees Alice's vote");
    await b.click(".poll-option:nth-child(2)");
    await waitFor(async () => (await a.textContent(".poll-option:nth-child(2) .count"))!.includes("100%"), "both voted option 2");
    await a.keyboard.press("Escape"); await b.keyboard.press("Escape");
    // timer at (14,3) -> stand at (14,4)
    await teleport(a, 14, 4); await unfocus(a); await a.keyboard.press("x");
    await a.waitForSelector("#modal:not([hidden]) .timer-display");
    await a.fill("#modal input[type=number]", "1");
    await a.click('[data-t="start"]');
    await teleport(b, 15, 3); await unfocus(b); await b.keyboard.press("x");
    await b.waitForSelector("#modal:not([hidden]) .timer-display");
    await waitFor(async () => /00:5\d/.test((await b.textContent(".timer-display"))!), "Bob sees running timer");
    await a.click('[data-t="stop"]');
    await sleep(600);
    const t1 = await b.textContent(".timer-display"); await sleep(600);
    assert(t1 === (await b.textContent(".timer-display")), "timer paused for Bob too");
    await a.keyboard.press("Escape"); await b.keyboard.press("Escape");
    await teleport(a, 32, 4); await unfocus(a); await a.keyboard.press("x");
    await a.waitForSelector("#modal:not([hidden]) img");
    await a.keyboard.press("Escape");
  });

  await step("chat history is loaded from the database after reload", async () => {
    await a.reload();
    await a.waitForSelector("#hud:not([hidden])");
    await a.waitForFunction(() => (window as any).__scene?.me);
    await waitFor(async () => (await a.$$eval("#chat-messages .msg.history", (e) => e.length)) > 3, "history rows");
    const hist = await a.$$eval("#chat-messages .msg.history", (els) => els.map((e) => e.textContent ?? ""));
    assert(hist.some((t) => t.includes("anúncio geral")), "everyone message in history");
    assert(hist.some((t) => t.includes("só pra você")), "DM in history");
    await waitFor(async () => (await players(b)).filter((p) => p.name.startsWith("Alice")).length === 1, "no duplicate Alice after reload", 10000);
  });

  // =========================================================== roles & moderation
  await step("guest cannot build; owner promotes Bob to moderator live", async () => {
    const i = 7 * 44 + 9;
    await send(b, "build", { layer: "objects", x: 9, y: 7, tile: 14 });
    await sleep(400);
    assert((await mapData(a)).objects[i] === 0, "guest build ignored");
    const bobId = (await me(b)).id;
    await send(a, "role", { to: bobId, role: "moderator" });
    await waitFor(async () => (await me(b)).role === "moderator", "Bob promoted");
    await send(b, "build", { layer: "objects", x: 9, y: 7, tile: 14 });
    await waitFor(async () => (await mapData(a)).objects[i] === 14, "moderator can build");
    await send(b, "build", { layer: "objects", x: 9, y: 7, tile: 0 });
    await waitFor(async () => (await mapData(a)).objects[i] === 0, "cleanup");
    const members = await api("GET", `/spaces/${slug}/members`, undefined, aliceToken);
    assert(members.members.find((m: any) => m.name === "Bob")?.role === "moderator", "role persisted");
  });

  await step("mapmaker: zones, interactables, portals, spawn via UI-level messages, and they persist", async () => {
    await send(a, "zone:set", { name: "Copa", x: 22, y: 12, w: 4, h: 3, color: "#14b8a6" });
    await waitFor(async () => (await mapData(b)).zones.some((z: any) => z.name === "Copa"), "Bob sees new zone");
    await teleport(b, 23, 14);
    await waitFor(async () => (await me(b)).zone !== "", "zone takes effect for movement");
    await send(a, "interactable:set", { x: 3, y: 17, kind: "note", title: "Aviso", text: "Teste de objeto" });
    await waitFor(async () => (await mapData(b)).interactables.some((i: any) => i.title === "Aviso"), "Bob sees interactable");
    await teleport(b, 4, 17); await unfocus(b); await b.keyboard.press("x");
    await b.waitForSelector("#modal:not([hidden]) pre");
    assert((await b.textContent("#modal pre"))!.includes("Teste de objeto"), "new object opens");
    await b.keyboard.press("Escape");
    await send(a, "spawn:set", { x: 8, y: 8 });
    await waitFor(async () => { const s = (await mapData(a)).spawn; return s.x === 8 && s.y === 8; }, "spawn moved");
    // UI drag for a zone: simulate build tool pick/drag through the scene
    await a.keyboard.press("b");
    await a.waitForSelector("#build-panel:not([hidden])");
    await a.click('#build-tabs [data-tab="zones"]');
    await a.evaluate(() => (window as any).__bus.emit("build:zone-rect", { x: 3, y: 3, w: 2, h: 2 }));
    await a.fill('#build-body [name="name"]', "Cantinho");
    await a.click('#build-body button[type="submit"]');
    await waitFor(async () => (await mapData(b)).zones.some((z: any) => z.name === "Cantinho"), "zone from UI form");
    await a.keyboard.press("Escape");
    const saved = await api("GET", `/spaces/${slug}/maps/${await a.evaluate(() => (window as any).__net.state.mapId)}`, undefined, aliceToken);
    await waitFor(async () => { const s = await api("GET", `/spaces/${slug}/maps/${saved.map.id}`, undefined, aliceToken); return s.map.data.zones.some((z: any) => z.name === "Cantinho") && s.map.data.spawn.x === 8; }, "persisted in sqlite", 4000);
  });

  let gardenId = "";
  await step("portals move players between maps; maps isolate presence", async () => {
    const maps = await a.evaluate(() => (window as any).__net.welcome.maps);
    gardenId = maps.find((m: any) => m.name === "Jardim").id;
    await teleport(a, 41, 29);
    await a.evaluate(() => (window as any).__net.teleport(42, 29));
    await waitFor(async () => (await mapName(a)) === "Jardim", "Alice in garden", 10000);
    await waitFor(async () => (await players(a)).length === 1, "Alice alone in garden");
    await waitFor(async () => (await players(b)).length === 1, "Bob alone in office");
    assert((await a.inputValue("#map-select")) === gardenId, "map select updated");
    await b.selectOption("#map-select", gardenId);
    await waitFor(async () => (await mapName(b)) === "Jardim" && (await players(b)).length === 2, "Bob switched via dropdown", 10000);
    await sendChat(a, "no jardim", "everyone");
    await waitFor(async () => (await chatTexts(b)).some((t) => t.includes("no jardim")), "chat works after switching");
    await a.screenshot({ path: path.join(SHOTS, "garden.png") });
  });

  await step("maps: create, rename, import/export JSON, delete (moderator+)", async () => {
    const created = await api("POST", `/spaces/${slug}/maps`, { name: "Auditório", template: "blank" }, aliceToken);
    assert(created.map?.id, "map created");
    await api("PATCH", `/spaces/${slug}/maps/${created.map.id}`, { name: "Auditório Grande" }, aliceToken);
    const info = await api("GET", `/spaces/${slug}`, undefined, aliceToken);
    assert(info.space.maps.some((m: any) => m.name === "Auditório Grande"), "renamed");
    const exported = (await api("GET", `/spaces/${slug}/maps/${gardenId}`, undefined, aliceToken)).map.data;
    exported.zones.push({ id: "imp", name: "Importada", x: 2, y: 2, w: 3, h: 3, color: "#ff00ff" });
    await send(a, "map:import", exported);
    await waitFor(async () => (await mapData(b)).zones.some((z: any) => z.name === "Importada"), "imported map synced to Bob", 8000);
    const guestDenied = await api("DELETE", `/spaces/${slug}/maps/${created.map.id}`, undefined, carolReg.token);
    assert(guestDenied.status === 403, "guest cannot delete maps");
    const del = await api("DELETE", `/spaces/${slug}/maps/${created.map.id}`, undefined, aliceToken);
    assert(del.ok, "deleted");
  });

  await step("kick and ban: banned user cannot rejoin", async () => {
    const C = await joinSpace(browser, slug, carolReg.token, `?map=${gardenId}`);
    await waitFor(async () => (await players(a)).length === 3, "Carol joined");
    const carolId = (await me(C.page)).id;
    await send(a, "kick", { to: carolId, ban: true, reason: "teste" });
    await waitFor(async () => (await players(a)).length === 2, "Carol gone");
    await sleep(500);
    await C.ctx.close();
    const denied = await api("GET", `/spaces/${slug}`, undefined, carolReg.token);
    assert(denied.status === 403 && /banid/.test(denied.error), "banned via API");
    const members = await api("GET", `/spaces/${slug}/members`, undefined, aliceToken);
    assert(members.bans.some((b: any) => b.name === "Carol"), "ban listed");
    await api("DELETE", `/spaces/${slug}/bans/${carolReg.user.id}`, undefined, aliceToken);
    assert((await api("GET", `/spaces/${slug}`, undefined, carolReg.token)).space, "unbanned");
  });

  await step("private space: blocked without invite, invite link through the UI grants access", async () => {
    const priv = await api("POST", "/spaces", { name: "Sala Secreta", template: "blank", isPrivate: true }, aliceToken);
    const pslug = priv.space.slug;
    assert((await api("GET", `/spaces/${pslug}`, undefined, bobReg.token)).status === 403, "Bob blocked");
    const s = await open(browser, `${BASE}/s/${pslug}`, bobReg.token);
    await s.page.waitForSelector("text=Sem acesso");
    await s.ctx.close();
    const inv = await api("POST", `/spaces/${pslug}/invites`, { role: "member" }, aliceToken);
    const s2 = await open(browser, `${BASE}/invite/${inv.token}`, bobReg.token);
    await s2.page.waitForURL(new RegExp(`/s/${pslug}`), { timeout: 15000 });
    await s2.page.waitForFunction(() => (window as any).__scene?.me, null, { timeout: 15000 });
    assert((await me(s2.page)).role === "member", "Bob is member after invite");
    await s2.ctx.close();
    // a brand-new visitor can accept an invite as guest from the invite page
    const s3 = await open(browser, `${BASE}/invite/${inv.token}`);
    await s3.page.click('button[data-m="guest"]');
    await s3.page.fill('[name="name"]', "Dani");
    await s3.page.click('button[type="submit"]');
    await s3.page.waitForURL(new RegExp(`/s/${pslug}`), { timeout: 15000 });
    await s3.page.waitForFunction(() => (window as any).__scene?.me, null, { timeout: 15000 });
    assert((await me(s3.page)).name === "Dani", "guest joined via invite");
    await s3.ctx.close();
    const bad = await api("POST", `/invites/inv_nope/accept`, undefined, bobReg.token);
    assert(bad.status === 403 || bad.status === 404, "bad invite rejected");
  });

  await step("members panel lists members and invites for the owner", async () => {
    await a.evaluate(() => (window as any).__bus.emit("ui:toggle-members"));
    await a.waitForSelector("#members:not([hidden])");
    await waitFor(async () => (await a.textContent("#members-body"))!.includes("Bob") && (await a.textContent("#members-body"))!.includes("Convites"), "members rendered");
    await a.click("#members-body button.primary");
    await waitFor(async () => (await a.$$eval("#members-body ul.inv li", (e) => e.length)) >= 1, "invite listed");
    await a.screenshot({ path: path.join(SHOTS, "members.png") });
    await a.click('[data-close="members"]');
  });

  await step("locate + typing guard + reconnection", async () => {
    const bobId = (await me(b)).id;
    await teleport(a, 5, 5); await teleport(b, 30, 20);
    await a.evaluate((id) => (window as any).__bus.emit("ui:locate", id), bobId);
    await waitFor(async () => (await a.evaluate(() => (window as any).__scene.locateTarget)) !== null, "locate set");
    await a.evaluate(() => (window as any).__bus.emit("ui:locate", null));
    await teleport(a, 18, 10);
    await a.evaluate(() => (window as any).__bus.emit("ui:focus-chat"));
    await a.waitForSelector("#chat-input:visible");
    await a.keyboard.down("ArrowRight"); await sleep(300); await a.keyboard.up("ArrowRight");
    await a.keyboard.type("wasd"); await sleep(200);
    const m = await me(a);
    assert(m.x === 18 && m.y === 10 && (await a.inputValue("#chat-input")) === "wasd", "typing does not move");
    await a.fill("#chat-input", ""); await a.keyboard.press("Escape");
    await a.evaluate(() => (window as any).__net.room.connection.close(4010, "drop"));
    await sleep(500);
    assert((await players(b)).some((p) => p.name.startsWith("Alice")), "Alice kept while reconnecting");
    await waitFor(async () => (await players(b)).find((p) => p.name.startsWith("Alice"))!.connected === true, "reconnected", 10000);
  });

  await step("mobile: touch viewport shows joystick and it moves the avatar", async () => {
    const M = await joinSpace(browser, slug, undefined, "?guest=Mobi", { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await M.page.waitForSelector("#joystick:not([hidden])");
    const start = await me(M.page);
    await M.page.evaluate(() => (window as any).__bus.emit("joystick", 2)); // RIGHT
    await sleep(600);
    await M.page.evaluate(() => (window as any).__bus.emit("joystick", -1));
    await waitFor(async () => (await me(M.page)).x > start.x, "moved with joystick");
    await M.page.screenshot({ path: path.join(SHOTS, "mobile.png") });
    await M.ctx.close();
  });

  await step("screenshots + no page errors", async () => {
    await b.selectOption("#map-select", (await a.evaluate(() => (window as any).__net.welcome.maps.find((m: any) => m.name === "Escritório").id)));
    await waitFor(async () => (await mapName(b)) === "Escritório", "Bob back", 10000);
    await teleport(b, 17, 8);
    await unfocus(b); await b.keyboard.press("p");
    await sendChat(b, "fechando o sprint!");
    await sleep(500);
    await b.screenshot({ path: path.join(SHOTS, "office.png") });
    const errs = [...A.errors, ...B.errors];
    assert(errs.length === 0, "page errors: " + errs.join(" | "));
  });

  await browser.close();
  stopServer();
  await sleep(300);
  try { fs.unlinkSync(DB); fs.unlinkSync(DB + "-wal"); fs.unlinkSync(DB + "-shm"); } catch {}
  const serverErrors = serverLog.join("").split("\n").filter((l) => /Error|error/.test(l) && !/sponsor|Experimental|trace-warnings/i.test(l));
  if (serverErrors.length) { console.log("server errors:\n" + serverErrors.join("\n")); failed++; }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
