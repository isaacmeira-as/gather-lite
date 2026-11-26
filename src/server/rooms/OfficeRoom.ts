import { Room, Client } from "@colyseus/core";
import fs from "node:fs";
import path from "node:path";
import { OfficeState, Player } from "./OfficeState";
import { buildDefaultMap, MapData, stepTarget, zoneAt, canHear, isSpotlight, idx, inBounds, interactableNear } from "../../shared/map";
import { F, O, SITTABLE, DIR_DELTA, isSolid } from "../../shared/tiles";
import { ChatIn, ChatOut, BuildIn, STATUSES, EMOTES } from "../../shared/messages";

const STEP_MS = 130;           // one tile per 130ms (~7.7 tiles/s)
const EMOTE_MS = 3000;
const MAX_CHAT = 500;
const DATA_FILE = process.env.OFFICE_DATA ?? path.join(process.cwd(), "data", "office.json");

interface JoinOptions { name?: string; color?: string; skin?: number }

export class OfficeRoom extends Room<{ state: OfficeState }> {
  maxClients = 200;
  autoDispose = false;

  private map!: MapData;
  private lastStep = new Map<string, number>();
  private emoteTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private chatSeq = 0;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  onCreate() {
    this.map = buildDefaultMap();
    const state = new OfficeState();
    state.width = this.map.width;
    state.height = this.map.height;

    // Restore persisted edits (build mode, notes) when available.
    const saved = this.loadData();
    if (saved?.floor?.length === this.map.floor.length) this.map.floor = saved.floor;
    if (saved?.objects?.length === this.map.objects.length) this.map.objects = saved.objects;
    state.floor.push(...this.map.floor);
    state.objects.push(...this.map.objects);
    for (const [k, v] of Object.entries(saved?.notes ?? {})) state.notes.set(k, String(v));

    this.setState(state);
    this.patchRate = 50;

    this.onMessage("move", (client, msg: { dir: number }) => this.handleMove(client, msg));
    this.onMessage("face", (client, msg: { dir: number }) => {
      const p = this.state.players.get(client.sessionId);
      if (p && DIR_DELTA[msg?.dir]) p.dir = msg.dir;
    });
    this.onMessage("chat", (client, msg: ChatIn) => this.handleChat(client, msg));
    this.onMessage("status", (client, msg: { status: string }) => {
      const p = this.state.players.get(client.sessionId);
      if (p && (STATUSES as readonly string[]).includes(msg?.status)) p.status = msg.status;
    });
    this.onMessage("emote", (client, msg: { emote: string }) => {
      const p = this.state.players.get(client.sessionId);
      if (p && EMOTES.includes(msg?.emote)) this.setEmote(p, msg.emote);
    });
    this.onMessage("interact", (client, msg: { id: string }) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      const it = interactableNear(this.map, p.x, p.y);
      if (it && it.id === msg?.id && it.kind === "emote" && it.emote) this.setEmote(p, it.emote);
    });
    this.onMessage("note", (client, msg: { id: string; text: string }) => {
      if (!msg || typeof msg.id !== "string" || typeof msg.text !== "string") return;
      const it = this.map.interactables.find((i) => i.id === msg.id && i.kind === "board");
      if (!it) return;
      this.state.notes.set(msg.id, msg.text.slice(0, 5000));
      this.scheduleSave();
    });
    this.onMessage("build", (client, msg: BuildIn) => this.handleBuild(client, msg));
    this.onMessage("teleport", (client, msg: { x: number; y: number }) => {
      // Used by "locate -> go" and by tests; still validated against the map.
      const p = this.state.players.get(client.sessionId);
      if (!p || !Number.isInteger(msg?.x) || !Number.isInteger(msg?.y)) return;
      if (!inBounds(this.map, msg.x, msg.y)) return;
      const i = idx(this.map, msg.x, msg.y);
      if (isSolid(this.map.floor[i], this.map.objects[i])) return;
      p.x = msg.x; p.y = msg.y;
      this.afterMove(client, p);
    });
    this.onMessage("ping", (client, t: number) => client.send("pong", t));
  }

  onJoin(client: Client, options: JoinOptions = {}) {
    const p = new Player();
    p.id = client.sessionId;
    p.name = sanitizeName(options.name) || `Visitante ${this.state.players.size + 1}`;
    p.color = /^#[0-9a-fA-F]{6}$/.test(options.color ?? "") ? options.color! : randomColor();
    p.skin = Number.isInteger(options.skin) ? Math.max(0, Math.min(5, options.skin!)) : 0;
    const spawn = this.freeSpawn();
    p.x = spawn.x;
    p.y = spawn.y;
    p.joinedAt = Date.now();
    this.state.players.set(client.sessionId, p);
    this.afterMove(client, p, true);
    this.broadcast("system", { text: `${p.name} entrou no escritório`, ts: Date.now() }, { except: client });
    client.send("welcome", { id: client.sessionId, map: { zones: this.map.zones, interactables: this.map.interactables, spawn: this.map.spawn } });
  }

  async onLeave(client: Client, code?: number) {
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    p.connected = false;
    // 4000 = consented leave (room.leave(true) on the client). Anything else is
    // a dropped socket: keep the avatar for 20s so a refresh/network blip can resume.
    if (code !== 4000) {
      try {
        await this.allowReconnection(client, 20);
        p.connected = true;
        return;
      } catch {
        // timed out, fall through
      }
    }
    this.removePlayer(client.sessionId);
  }

  onDispose() {
    this.flushSave();
  }

  // ---------------------------------------------------------------------
  private handleMove(client: Client, msg: { dir: number }) {
    const p = this.state.players.get(client.sessionId);
    if (!p || !DIR_DELTA[msg?.dir]) return;
    p.dir = msg.dir;
    const now = Date.now();
    const last = this.lastStep.get(client.sessionId) ?? 0;
    if (now - last < STEP_MS) return;
    const target = stepTarget(this.map, p.x, p.y, msg.dir);
    if (!target) return;
    this.lastStep.set(client.sessionId, now);
    p.x = target.x;
    p.y = target.y;
    this.afterMove(client, p);
  }

  private afterMove(client: Client, p: Player, silent = false) {
    const z = zoneAt(this.map, p.x, p.y);
    const zoneId = z?.id ?? "";
    if (p.zone !== zoneId) {
      p.zone = zoneId;
      if (!silent) client.send("zone", { id: zoneId, name: z?.name ?? "" });
    }
    p.sitting = SITTABLE.has(this.map.objects[idx(this.map, p.x, p.y)]);
  }

  private handleChat(client: Client, msg: ChatIn) {
    const p = this.state.players.get(client.sessionId);
    if (!p || typeof msg?.text !== "string") return;
    const text = msg.text.trim().slice(0, MAX_CHAT);
    if (!text) return;
    const base: ChatOut = {
      id: ++this.chatSeq,
      from: p.id,
      fromName: p.name,
      fromColor: p.color,
      text,
      scope: "nearby",
      ts: Date.now(),
    };

    if (msg.scope === "dm" && msg.to) {
      const target = this.clients.find((c) => c.sessionId === msg.to);
      if (!target) return client.send("system", { text: "Essa pessoa não está mais aqui.", ts: Date.now() });
      const out = { ...base, scope: "dm" as const, to: msg.to };
      target.send("chat", out);
      client.send("chat", out);
      return;
    }

    if (msg.scope === "everyone") {
      this.broadcast("chat", { ...base, scope: "everyone" });
      return;
    }

    if (isSpotlight(this.map, p.x, p.y)) {
      this.broadcast("chat", { ...base, scope: "spotlight" });
      return;
    }

    const scope = p.zone ? "zone" : "nearby";
    for (const c of this.clients) {
      const other = this.state.players.get(c.sessionId);
      if (!other) continue;
      if (c === client || canHear(this.map, p, other)) c.send("chat", { ...base, scope });
    }
  }

  private handleBuild(client: Client, msg: BuildIn) {
    if (!msg || !inBounds(this.map, msg.x, msg.y) || !Number.isInteger(msg.tile)) return;
    const i = idx(this.map, msg.x, msg.y);
    if (msg.layer === "floor") {
      if (!Object.values(F).includes(msg.tile as any)) return;
      this.map.floor[i] = msg.tile;
      this.state.floor[i] = msg.tile;
    } else if (msg.layer === "objects") {
      if (!Object.values(O).includes(msg.tile as any)) return;
      this.map.objects[i] = msg.tile;
      this.state.objects[i] = msg.tile;
    } else return;

    // If someone is now standing inside a solid tile, push them to the spawn.
    for (const [sid, p] of this.state.players) {
      if (p.x === msg.x && p.y === msg.y && !stepTarget(this.map, p.x, p.y, 0) && !stepTarget(this.map, p.x, p.y, 3) && !stepTarget(this.map, p.x, p.y, 1) && !stepTarget(this.map, p.x, p.y, 2)) {
        const s = this.freeSpawn();
        p.x = s.x; p.y = s.y;
        const c = this.clients.find((c) => c.sessionId === sid);
        if (c) this.afterMove(c, p);
      }
      p.sitting = SITTABLE.has(this.map.objects[idx(this.map, p.x, p.y)]);
    }
    this.scheduleSave();
  }

  private setEmote(p: Player, emote: string) {
    p.emote = emote;
    const old = this.emoteTimers.get(p.id);
    if (old) clearTimeout(old);
    this.emoteTimers.set(p.id, setTimeout(() => {
      const cur = this.state.players.get(p.id);
      if (cur) cur.emote = "";
      this.emoteTimers.delete(p.id);
    }, EMOTE_MS));
  }

  private removePlayer(sessionId: string) {
    const p = this.state.players.get(sessionId);
    if (!p) return;
    this.state.players.delete(sessionId);
    this.lastStep.delete(sessionId);
    const t = this.emoteTimers.get(sessionId);
    if (t) clearTimeout(t);
    this.broadcast("system", { text: `${p.name} saiu`, ts: Date.now() });
  }

  private freeSpawn() {
    const { x, y } = this.map.spawn;
    const taken = new Set<string>();
    for (const p of this.state.players.values()) taken.add(`${p.x},${p.y}`);
    // Spiral out from spawn until a free, walkable tile is found.
    for (let r = 0; r < 6; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const tx = x + dx, ty = y + dy;
        if (!taken.has(`${tx},${ty}`) && stepTarget(this.map, tx - 1, ty, 2)) return { x: tx, y: ty };
      }
    }
    return { x, y };
  }

  // ---------------------------------------------------------------------
  private loadData(): { floor?: number[]; objects?: number[]; notes?: Record<string, string> } | null {
    try {
      if (!fs.existsSync(DATA_FILE)) return null;
      return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    } catch (e) {
      console.warn("Could not read", DATA_FILE, e);
      return null;
    }
  }

  private scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => this.flushSave(), 1000);
  }

  private flushSave() {
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    try {
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
      const notes: Record<string, string> = {};
      for (const [k, v] of this.state.notes) notes[k] = v;
      fs.writeFileSync(DATA_FILE, JSON.stringify({ floor: [...this.map.floor], objects: [...this.map.objects], notes }));
    } catch (e) {
      console.warn("Could not save", DATA_FILE, e);
    }
  }
}

function sanitizeName(n?: string) {
  return (n ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 24);
}

const COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"];
function randomColor() {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}
