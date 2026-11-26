/* End-to-end test: boots the server, opens two headless browsers and walks
   through the whole feature set. Run with `npm run test:e2e`. */
import { chromium, Browser, Page } from "playwright";
import { spawn, ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const PORT = 2599;
const BASE = `http://localhost:${PORT}`;
const DATA = path.join(os.tmpdir(), `gather-lite-e2e-${Date.now()}.json`);
const SHOTS = path.join(process.cwd(), "tests", "e2e", "screenshots");
fs.mkdirSync(SHOTS, { recursive: true });

let passed = 0;
let failed = 0;
async function step(name: string, fn: () => Promise<void>) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e: any) { failed++; console.log(`  ✗ ${name}\n      ${e?.message ?? e}`); }
}
const assert = (cond: any, msg: string) => { if (!cond) throw new Error(msg); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const modalOpen = async (p: Page, who: string) => {
  try { await p.waitForSelector("#modal:not([hidden]) textarea", { timeout: 5000 }); }
  catch { throw new Error(`${who}: modal did not open. hint=${JSON.stringify(await p.evaluate(() => ({ hintHidden: (document.querySelector("#interact-hint") as HTMLElement).hidden, nearby: (window as any).__scene.nearbyInteractable?.id, modalHidden: (document.querySelector("#modal") as HTMLElement).hidden, active: document.activeElement?.tagName, me: [(window as any).__net.me.x, (window as any).__net.me.y] })))}`); }
};
async function waitFor(fn: () => Promise<boolean>, msg: string, timeout = 6000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { if (await fn()) return; await sleep(100); }
  throw new Error("timeout: " + msg);
}

// Helpers evaluated inside the page. `window.__net` is exposed by main.ts for tests.
const me = (p: Page) => p.evaluate(() => { const n = (window as any).__net; const m = n.me; return { x: m.x, y: m.y, zone: m.zone, emote: m.emote, status: m.status, sitting: m.sitting, name: m.name, id: n.sessionId }; });
const players = (p: Page) => p.evaluate(() => [...(window as any).__net.state.players.values()].map((m: any) => ({ id: m.id, name: m.name, x: m.x, y: m.y, connected: m.connected })));
const teleport = async (p: Page, x: number, y: number) => {
  await p.evaluate(({ x, y }) => (window as any).__net.teleport(x, y), { x, y });
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
async function join(browser: Browser, name: string, color: string) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/?name=${name}&color=${color}&skin=1&autojoin=1`);
  await page.waitForSelector("#hud:not([hidden])", { timeout: 15000 });
  await page.waitForFunction(() => (window as any).__scene?.me);
  return { page, ctx, errors };
}

async function main() {
  console.log("starting server on", PORT);
  try { await fetch(`${BASE}/healthz`); throw new Error(`port ${PORT} is already in use; stop the other server first`); } catch (e: any) { if (!e.cause && !/fetch failed/.test(String(e))) throw e; }
  const tsx = path.join(process.cwd(), "node_modules", ".bin", "tsx");
  const server: ChildProcess = spawn(tsx, ["src/server/index.ts"], { env: { ...process.env, PORT: String(PORT), OFFICE_DATA: DATA }, stdio: ["ignore", "pipe", "pipe"] });
  const stopServer = () => { try { server.kill("SIGTERM"); } catch {} };
  process.on("exit", stopServer);
  const serverLog: string[] = [];
  server.stdout!.on("data", (d) => serverLog.push(String(d)));
  server.stderr!.on("data", (d) => serverLog.push(String(d)));
  await waitFor(async () => { try { const r = await fetch(`${BASE}/healthz`); return r.ok; } catch { return false; } }, "server up", 20000);

  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const A = await join(browser, "Alice", "ef4444");
  const B = await join(browser, "Bob", "3b82f6");
  const a = A.page, b = B.page;

  await step("both players see each other with names", async () => {
    await waitFor(async () => (await players(a)).length === 2 && (await players(b)).length === 2, "2 players");
    const names = (await players(a)).map((p) => p.name).sort();
    assert(names.join(",") === "Alice,Bob", "names: " + names);
    await a.keyboard.press("p");
    await a.waitForSelector("#participants:not([hidden])");
    const txt = await a.textContent("#participants-list");
    assert(txt!.includes("Bob") && txt!.includes("(você)"), "participants panel lists Bob and self");
  });

  await step("keyboard movement is server-validated (walls block)", async () => {
    const start = await me(a);
    await a.keyboard.down("ArrowRight");
    await sleep(700);
    await a.keyboard.up("ArrowRight");
    const after = await me(a);
    assert(after.x > start.x, `moved right: ${start.x} -> ${after.x}`);
    assert(after.x - start.x <= 6, "no more than ~1 tile per 130ms");
    // Walk into the west wall of the lobby and make sure we stop at x=3
    await teleport(a, 3, 7);
    await a.keyboard.down("ArrowLeft"); await sleep(500); await a.keyboard.up("ArrowLeft");
    assert((await me(a)).x === 3, "wall blocked movement");
    // Bob sees Alice's new position
    await waitFor(async () => (await players(b)).find((p) => p.name === "Alice")!.x === 3, "Bob sees Alice at x=3");
  });

  await step("click-to-move walks a path", async () => {
    await teleport(a, 7, 7);
    await a.evaluate(() => (window as any).__scene.walkTo(10, 8));
    await waitFor(async () => { const m = await me(a); return m.x === 10 && m.y === 8; }, "arrived by path", 5000);
  });

  await step("nearby chat is heard only within radius", async () => {
    await teleport(a, 7, 7);
    await teleport(b, 8, 7);
    await a.keyboard.press("Enter");
    await sendChat(a, "oi bob, perto");
    await waitFor(async () => (await chatTexts(b)).some((t) => t.includes("oi bob, perto")), "Bob hears nearby chat");
    await teleport(b, 11, 16); // far away in the desk area
    await sendChat(a, "longe demais");
    await sleep(600);
    assert(!(await chatTexts(b)).some((t) => t.includes("longe demais")), "Bob must not hear far chat");
    assert((await chatTexts(a)).some((t) => t.includes("longe demais")), "Alice sees her own message");
  });

  await step("everyone scope reaches far players", async () => {
    await sendChat(a, "anúncio geral", "everyone");
    await waitFor(async () => (await chatTexts(b)).some((t) => t.includes("anúncio geral")), "Bob hears everyone chat");
  });

  await step("private zones isolate chat and show the zone name", async () => {
    await teleport(a, 17, 8);
    await waitFor(async () => (await me(a)).zone === "sala-a", "Alice zone");
    await waitFor(async () => (await a.textContent("#zone-indicator"))!.includes("Jacarandá"), "zone indicator");
    await teleport(b, 17, 11); // right outside the door, within 4 tiles
    await sendChat(a, "segredo da sala");
    await sleep(600);
    assert(!(await chatTexts(b)).some((t) => t.includes("segredo da sala")), "outside the zone must not hear");
    await teleport(b, 15, 8);
    await waitFor(async () => (await me(b)).zone === "sala-a", "Bob zone");
    await sendChat(a, "agora sim");
    await waitFor(async () => (await chatTexts(b)).some((t) => t.includes("agora sim")), "zone mate hears");
  });

  await step("spotlight tile broadcasts to everyone", async () => {
    await teleport(a, 17, 19);
    await teleport(b, 40, 25);
    await waitFor(async () => (await a.textContent("#zone-indicator"))!.includes("Spotlight"), "spotlight indicator");
    await sendChat(a, "atenção pessoal");
    await waitFor(async () => (await chatTexts(b)).some((t) => t.includes("atenção pessoal") && t.includes("spotlight")), "Bob hears spotlight");
  });

  await step("direct messages go to one person only", async () => {
    const C = await join(browser, "Carol", "22c55e");
    const bobId = (await me(b)).id;
    await a.evaluate((id) => (window as any).__net.chat("só pra você", "dm", id), bobId);
    await waitFor(async () => (await chatTexts(b)).some((t) => t.includes("só pra você")), "Bob receives DM");
    await sleep(400);
    assert(!(await chatTexts(C.page)).some((t) => t.includes("só pra você")), "Carol must not see DM");
    await C.page.evaluate(() => (window as any).__net.room.leave(true));
    await C.ctx.close();
    await waitFor(async () => (await players(a)).length === 2, "Carol removed after leaving");
  });

  await step("emotes via number keys are synced and expire", async () => {
    await unfocus(a);
    await a.keyboard.press("1");
    await waitFor(async () => (await me(a)).emote === "👋", "emote set");
    await waitFor(async () => { const p = (await players(b)).find((p) => p.name === "Alice"); return !!p; }, "bob sees alice");
    await waitFor(async () => (await b.evaluate(() => [...(window as any).__net.state.players.values()].find((p: any) => p.name === "Alice").emote)) === "👋", "Bob sees emote");
    await waitFor(async () => (await me(a)).emote === "", "emote expires", 5000);
  });

  await step("status changes propagate", async () => {
    await a.selectOption("#status-select", "dnd");
    await waitFor(async () => (await b.evaluate(() => [...(window as any).__net.state.players.values()].find((p: any) => p.name === "Alice").status)) === "dnd", "Bob sees dnd");
  });

  await step("sitting on a chair", async () => {
    await teleport(a, 15, 5);
    await waitFor(async () => (await me(a)).sitting === true, "sitting flag");
    await teleport(a, 17, 8);
    await waitFor(async () => (await me(a)).sitting === false, "stood up");
  });

  await step("interactable prompt + note modal + shared whiteboard", async () => {
    await teleport(a, 17, 4); // below the whiteboard
    await a.waitForSelector("#interact-hint:not([hidden])");
    assert((await a.textContent("#interact-hint"))!.includes("Quadro"), "hint names the whiteboard");
    await unfocus(a);
    await a.keyboard.press("x");
    await modalOpen(a, "Alice");
    await a.fill("#modal textarea", "pauta: lançar o gather lite");
    await teleport(b, 18, 3); // Bob also next to it
    await unfocus(b);
    await b.keyboard.press("x");
    await modalOpen(b, "Bob");
    await waitFor(async () => (await b.inputValue("#modal textarea")) === "pauta: lançar o gather lite", "Bob sees shared note");
    await a.keyboard.press("Escape");
    await b.click("#modal-close");
    await a.waitForSelector("#modal", { state: "hidden" });
    // note object
    await teleport(a, 6, 5);
    await unfocus(a);
    await a.keyboard.press("x");
    await a.waitForSelector("#modal:not([hidden]) pre");
    assert((await a.textContent("#modal pre"))!.includes("Bem-vindo"), "reception note text");
    await a.keyboard.press("Escape");
  });

  await step("emote objects (coffee machine) trigger an emote", async () => {
    await teleport(a, 31, 13);
    await a.waitForSelector("#interact-hint:not([hidden])");
    await unfocus(a);
    await a.keyboard.press("x");
    await waitFor(async () => (await me(a)).emote === "☕", "coffee emote");
  });

  await step("build mode places and removes tiles for everyone, and persists", async () => {
    await teleport(a, 7, 7);
    await unfocus(a);
    await a.keyboard.press("b");
    await a.waitForSelector("#build-panel:not([hidden])");
    await a.evaluate(() => (window as any).__net.build("objects", 9, 7, 13 + 1)); // a plant (O.PLANT = 14)
    await waitFor(async () => (await b.evaluate(() => (window as any).__scene.mapData.objects[7 * 44 + 9])) === 14, "Bob sees the plant");
    // Now it's solid: Alice can't walk into it
    await teleport(a, 8, 7);
    await a.keyboard.down("ArrowRight"); await sleep(400); await a.keyboard.up("ArrowRight");
    assert((await me(a)).x === 8, "plant blocks movement");
    await a.evaluate(() => (window as any).__net.build("objects", 9, 7, 0));
    await waitFor(async () => (await b.evaluate(() => (window as any).__scene.mapData.objects[7 * 44 + 9])) === 0, "Bob sees removal");
    await a.evaluate(() => (window as any).__net.build("floor", 9, 8, 8)); // rug
    await waitFor(async () => (await b.evaluate(() => (window as any).__scene.mapData.floor[8 * 44 + 9])) === 8, "Bob sees floor change");
    await a.keyboard.press("Escape");
    await waitFor(async () => fs.existsSync(DATA) && JSON.parse(fs.readFileSync(DATA, "utf8")).floor[8 * 44 + 9] === 8, "persisted to disk", 4000);
    const saved = JSON.parse(fs.readFileSync(DATA, "utf8"));
    assert(saved.notes["whiteboard-a"] === "pauta: lançar o gather lite", "note persisted");
  });

  await step("locate draws a path to another player", async () => {
    const bobId = (await me(b)).id;
    await a.evaluate((id) => (window as any).__bus.emit("ui:locate", id), bobId);
    await waitFor(async () => (await a.evaluate(() => (window as any).__scene.locateTarget)) !== null, "locate set");
    await a.evaluate(() => (window as any).__bus.emit("ui:locate", null));
  });

  await step("typing in chat does not move the avatar", async () => {
    await teleport(a, 7, 7);
    await a.evaluate(() => (window as any).__bus.emit("ui:focus-chat"));
    await a.waitForSelector("#chat-input:visible");
    await a.keyboard.down("ArrowRight"); await sleep(400); await a.keyboard.up("ArrowRight");
    await a.keyboard.type("wasd");
    await sleep(300);
    assert((await me(a)).x === 7 && (await me(a)).y === 7, "did not move while typing");
    assert((await a.inputValue("#chat-input")) === "wasd", "text went to the input");
    await a.fill("#chat-input", "");
    await a.keyboard.press("Escape");
  });

  await step("reconnection keeps the same player after a dropped socket", async () => {
    await teleport(a, 12, 7);
    const before = await players(b);
    // 4010 = CloseCode.MAY_TRY_RECONNECT: the only client-side close code the SDK auto-reconnects from.
    await a.evaluate(() => (window as any).__net.room.connection.close(4010, "test drop"));
    await sleep(800);
    await waitFor(async () => (await players(b)).find((p) => p.name === "Alice") !== undefined, "Alice still listed for Bob while reconnecting");
    const alice = (await players(b)).find((p) => p.name === "Alice")!;
    assert(alice.x === 12, "position kept while disconnected");
    await waitFor(async () => (await players(b)).find((p) => p.name === "Alice")!.connected === true, "Alice reconnected", 10000);
    assert(before.length === (await players(b)).length, "no duplicate player");
  });

  await step("screenshots for the record", async () => {
    await teleport(a, 17, 8); await teleport(b, 16, 8);
    await sendChat(a, "fechando o sprint!");
    await sendChat(b, "bora! 🎉");
    await sleep(400);
    await a.screenshot({ path: path.join(SHOTS, "meeting-room.png") });
    await unfocus(a);
    await a.keyboard.press("m");
    await a.keyboard.press("p");
    await teleport(a, 28, 14);
    await sleep(400);
    await a.screenshot({ path: path.join(SHOTS, "lounge-with-panels.png") });
  });

  await step("no uncaught page errors", async () => {
    const errs = [...A.errors, ...B.errors];
    assert(errs.length === 0, "page errors: " + errs.join(" | "));
  });

  await browser.close();
  stopServer();
  await sleep(300);
  try { fs.unlinkSync(DATA); } catch {}
  const serverErrors = serverLog.join("").split("\n").filter((l) => /Error|error/.test(l) && !/sponsor/i.test(l));
  if (serverErrors.length) { console.log("server errors:\n" + serverErrors.join("\n")); failed++; }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
