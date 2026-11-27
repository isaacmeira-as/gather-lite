import { Room, Client, ServerError } from "@colyseus/core";
import { OfficeState, Player, ZoneS, InteractableS, PortalS } from "./OfficeState";
import { MapData, stepTarget, zoneAt, canHear, isSpotlight, idx, inBounds, interactableNear, portalAt, normalizeMap, Zone, Interactable, Portal, INTERACTABLE_KINDS, isWalkable } from "../../shared/map";
import { F, O, SITTABLE, DIR_DELTA, isSolid, isValidObject } from "../../shared/tiles";
import { ChatIn, ChatOut, BuildIn, STATUSES, EMOTES } from "../../shared/messages";
import { normalizeAvatar } from "../../shared/avatar";
import { userFromToken, AuthUser } from "../auth";
import * as S from "../spaces";
import { getWeather, WeatherInfo, simulated } from "../weather";
import { conversationGroups } from "../../shared/groups";
import { REACTIONS } from "../../shared/messages";
import { mediaEnabled } from "../media";

const STEP_MS = 130;
const EMOTE_MS = 3000;
const MAX_CHAT = 500;
const CHAT_MIN_INTERVAL = 250;

interface JoinOptions { token?: string; spaceId: string; mapId?: string; spawnX?: number; spawnY?: number }
interface ClientAuth { user: AuthUser; role: S.Role }

export class OfficeRoom extends Room<{ state: OfficeState }> {
  maxClients = 200;
  autoDispose = true;
  maxMessagesPerSecond = 60;

  private map!: MapData;
  private space!: S.SpaceRow;
  private mapRow!: S.MapRow;
  private lastStep = new Map<string, number>();
  private lastChat = new Map<string, number>();
  private emoteTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private chatSeq = 0;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private visits = new Map<string, number>();
  private groupsDirty = true;
  private lastReminder = new Set<string>();

  static async onAuth(token: string, options: JoinOptions): Promise<ClientAuth> {
    const user = userFromToken(token || options?.token);
    if (!user) throw new ServerError(401, "faça login para entrar");
    const space = S.getSpace(options.spaceId);
    if (!space) throw new ServerError(404, "espaço não encontrado");
    const role = S.effectiveRole(space, user.id);
    if (!role) throw new ServerError(403, S.isBanned(space.id, user.id) ? "você foi banido deste espaço" : "espaço privado: peça um convite");
    return { user, role };
  }

  onCreate(options: JoinOptions) {
    const space = S.getSpace(options.spaceId);
    if (!space) throw new ServerError(404, "espaço não encontrado");
    const mapRow = options.mapId ? S.getMap(options.mapId) : S.defaultMap(space.id);
    if (!mapRow || mapRow.space_id !== space.id) throw new ServerError(404, "mapa não encontrado");
    this.space = space;
    this.mapRow = mapRow;
    const map = S.loadMapData(mapRow.id);
    if (!map) throw new ServerError(500, "mapa corrompido");
    this.map = map;

    const state = new OfficeState();
    state.spaceId = space.id;
    state.spaceName = space.name;
    state.mapId = mapRow.id;
    state.mapName = mapRow.name;
    this.syncMapToState(state, true);
    const objState = S.allObjectState(space.id);
    for (const [k, v] of Object.entries(objState)) {
      if (k.startsWith("note:")) state.notes.set(k.slice(5), String(v));
      else state.objectState.set(k, JSON.stringify(v));
    }
    this.setState(state);
    this.patchRate = 50;
    this.refreshWeather();
    this.clock.setInterval(() => this.refreshWeather(), 5 * 60 * 1000);
    this.clock.setInterval(() => this.recomputeGroups(), 400);
    this.clock.setInterval(() => this.checkReminders(), 30 * 1000);
    this.presence.subscribe(`space:${space.id}`, this.onSpaceSettings);
    this.presence.subscribe(`space:${space.id}`, this.onSpaceEvent);

    // --- movement & presence
    this.onMessage("move", (client, msg: { dir: number }) => this.handleMove(client, msg));
    this.onMessage("face", (client, msg: { dir: number }) => { const p = this.player(client); if (p && DIR_DELTA[msg?.dir]) p.dir = msg.dir; });
    this.onMessage("ghost", (client, msg: { ghost: boolean }) => { const p = this.player(client); if (p) p.ghost = !!msg?.ghost; });
    this.onMessage("status", (client, msg: { status: string; text?: string }) => {
      const p = this.player(client);
      if (!p) return;
      if ((STATUSES as readonly string[]).includes(msg?.status)) p.status = msg.status;
      if (typeof msg?.text === "string") p.statusText = msg.text.replace(/[\u0000-\u001f<>]/g, "").slice(0, 60);
    });
    this.onMessage("reaction", (client, msg: { id: string }) => {
      const p = this.player(client);
      if (!p || !REACTIONS.some((r) => r.id === msg?.id)) return;
      const now = Date.now();
      if (now - (this.lastChat.get("rx:" + client.sessionId) ?? 0) < 1500) return;
      this.lastChat.set("rx:" + client.sessionId, now);
      this.broadcast("reaction", { id: msg.id, x: p.x, y: p.y, from: p.id, name: p.name });
    });
    // --- games (state lives in objectState, persisted)
    this.onMessage("ttt:move", (client, msg: { id: string; cell: number }) => {
      const p = this.player(client);
      const it = this.state.interactables.get(msg?.id);
      if (!p || !it || it.kind !== "game" || !Number.isInteger(msg.cell) || msg.cell < 0 || msg.cell > 8) return;
      const key = `ttt:${it.id}`;
      const g = this.objState(key) ?? { board: Array(9).fill(""), players: {}, turn: "X", winner: "" };
      if (g.winner) return;
      if (!g.players.X) { g.players.X = p.userId; g.names = { ...(g.names ?? {}), X: p.name }; }
      else if (!g.players.O && g.players.X !== p.userId) { g.players.O = p.userId; g.names = { ...(g.names ?? {}), O: p.name }; }
      const mark = g.players.X === p.userId ? "X" : g.players.O === p.userId ? "O" : "";
      if (!mark || mark !== g.turn || g.board[msg.cell]) return;
      g.board[msg.cell] = mark;
      const L = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
      if (L.some(([a, b, c]) => g.board[a] && g.board[a] === g.board[b] && g.board[a] === g.board[c])) g.winner = mark;
      else if (g.board.every((c: string) => c)) g.winner = "draw";
      else g.turn = mark === "X" ? "O" : "X";
      this.setObjState(key, g);
    });
    this.onMessage("ttt:reset", (client, msg: { id: string }) => {
      const it = this.state.interactables.get(msg?.id);
      if (it?.kind === "game") this.setObjState(`ttt:${it.id}`, { board: Array(9).fill(""), players: {}, turn: "X", winner: "" });
    });
    this.onMessage("draw:stroke", (client, msg: { id: string; points: number[]; color: string; size: number }) => {
      const p = this.player(client);
      const it = this.state.interactables.get(msg?.id);
      if (!p || !it || it.kind !== "draw" || !Array.isArray(msg.points) || msg.points.length < 2 || msg.points.length > 400) return;
      const stroke = { points: msg.points.map((v) => Math.max(0, Math.min(1000, Number(v) | 0))), color: /^#[0-9a-fA-F]{6}$/.test(msg.color) ? msg.color : "#111827", size: Math.max(1, Math.min(24, Number(msg.size) || 3)) };
      const key = `draw:${it.id}`;
      const d = this.objState(key) ?? { strokes: [] };
      d.strokes.push(stroke);
      if (d.strokes.length > 600) d.strokes.shift();
      this.setObjState(key, d);
      this.broadcast("draw:stroke", { id: it.id, stroke }, { except: client });
    });
    this.onMessage("draw:clear", (client, msg: { id: string }) => {
      const it = this.state.interactables.get(msg?.id);
      if (it?.kind === "draw") { this.setObjState(`draw:${it.id}`, { strokes: [] }); this.broadcast("draw:clear", { id: it.id }); }
    });
    this.onMessage("emote", (client, msg: { emote: string }) => { const p = this.player(client); if (p && EMOTES.includes(msg?.emote)) this.setEmote(p, msg.emote); });
    this.onMessage("teleport", (client, msg: { x: number; y: number }) => {
      const p = this.player(client);
      if (!p || !Number.isInteger(msg?.x) || !Number.isInteger(msg?.y) || !isWalkable(this.map, msg.x, msg.y)) return;
      p.x = msg.x; p.y = msg.y;
      this.afterMove(client, p);
    });
    this.onMessage("ping", (client, t: number) => client.send("pong", t));
    this.onMessage("profile", (client, msg: { name?: string; avatar?: any }) => {
      const p = this.player(client);
      const { user } = this.auth(client);
      if (!p) return;
      if (typeof msg?.name === "string") { const nm = msg.name.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 24); if (nm) { p.name = nm; user.name = nm; } }
      if (msg?.avatar) { const av = normalizeAvatar(msg.avatar); p.avatar = JSON.stringify(av); p.color = av.shirt; user.avatar = av; }
      S.updateUserProfile(user.id, user.name, user.avatar);
    });

    // --- chat & social
    this.onMessage("chat", (client, msg: ChatIn) => this.handleChat(client, msg));
    this.onMessage("summon", (client, msg: { to: string }) => {
      const p = this.player(client);
      const target = this.clients.find((c) => c.sessionId === msg?.to);
      if (!p || !target) return;
      target.send("summon", { from: p.id, name: p.name, x: p.x, y: p.y, mapId: this.state.mapId });
    });
    this.onMessage("wave", (client, msg: { to: string }) => {
      const p = this.player(client);
      const target = this.clients.find((c) => c.sessionId === msg?.to);
      if (!p || !target) return;
      this.setEmote(p, "👋");
      target.send("wave", { from: p.id, name: p.name });
    });

    // --- objects
    this.onMessage("interact", (client, msg: { id: string }) => {
      const p = this.player(client);
      if (!p) return;
      const it = interactableNear(this.map, p.x, p.y);
      if (it && it.id === msg?.id && it.kind === "emote" && it.emote) this.setEmote(p, it.emote);
    });
    this.onMessage("note", (client, msg: { id: string; text: string }) => {
      if (!msg || typeof msg.id !== "string" || typeof msg.text !== "string") return;
      if (!this.state.interactables.has(msg.id)) return;
      const text = msg.text.slice(0, 5000);
      this.state.notes.set(msg.id, text);
      S.setObjectState(this.space.id, `note:${msg.id}`, text);
    });
    this.onMessage("poll:vote", (client, msg: { id: string; option: number }) => {
      const p = this.player(client);
      const it = this.state.interactables.get(msg?.id);
      if (!p || !it || it.kind !== "poll" || !Number.isInteger(msg.option)) return;
      const options = JSON.parse(it.options || "[]") as string[];
      if (msg.option < 0 || msg.option >= options.length) return;
      const key = `poll:${it.id}`;
      const cur = this.objState(key) ?? { votes: {} };
      cur.votes[p.userId] = msg.option;
      this.setObjState(key, cur);
    });
    this.onMessage("poll:reset", (client, msg: { id: string }) => {
      if (!S.can.moderate(this.auth(client).role)) return;
      const it = this.state.interactables.get(msg?.id);
      if (it?.kind === "poll") this.setObjState(`poll:${it.id}`, { votes: {} });
    });
    this.onMessage("timer", (client, msg: { id: string; action: "start" | "stop" | "reset"; seconds?: number }) => {
      const it = this.state.interactables.get(msg?.id);
      if (!it || it.kind !== "timer") return;
      const key = `timer:${it.id}`;
      const cur = this.objState(key) ?? { running: false, endsAt: 0, remaining: 25 * 60 };
      if (msg.action === "start") {
        const secs = Number.isFinite(msg.seconds) ? Math.max(5, Math.min(24 * 3600, msg.seconds!)) : cur.remaining;
        this.setObjState(key, { running: true, endsAt: Date.now() + secs * 1000, remaining: secs });
      } else if (msg.action === "stop" && cur.running) {
        this.setObjState(key, { running: false, endsAt: 0, remaining: Math.max(0, Math.round((cur.endsAt - Date.now()) / 1000)) });
      } else if (msg.action === "reset") {
        this.setObjState(key, { running: false, endsAt: 0, remaining: Number.isFinite(msg.seconds) ? Math.max(5, msg.seconds!) : 25 * 60 });
      }
    });

    // --- mapmaker (moderator+)
    this.onMessage("build", (client, msg: BuildIn) => { if (this.canBuild(client)) this.handleBuild(msg); });
    this.onMessage("zone:set", (client, z: Zone) => {
      if (!this.canBuild(client) || !z || typeof z.name !== "string") return;
      const id = typeof z.id === "string" && z.id ? z.id.slice(0, 40) : `z_${Date.now().toString(36)}`;
      const zone: Zone = { id, name: z.name.slice(0, 40) || "Zona", x: z.x | 0, y: z.y | 0, w: Math.max(1, z.w | 0), h: Math.max(1, z.h | 0), color: /^#[0-9a-fA-F]{6}$/.test(z.color) ? z.color : "#3b82f6" };
      if (!inBounds(this.map, zone.x, zone.y)) return;
      this.map.zones = this.map.zones.filter((o) => o.id !== id).concat(zone);
      this.syncMapToState(this.state);
      this.refreshZones();
      this.scheduleSave();
    });
    this.onMessage("zone:remove", (client, msg: { id: string }) => {
      if (!this.canBuild(client)) return;
      this.map.zones = this.map.zones.filter((o) => o.id !== msg?.id);
      this.syncMapToState(this.state);
      this.refreshZones();
      this.scheduleSave();
    });
    this.onMessage("interactable:set", (client, it: Interactable) => {
      if (!this.canBuild(client) || !it || !INTERACTABLE_KINDS.some((k) => k.kind === it.kind)) return;
      if (!inBounds(this.map, it.x | 0, it.y | 0)) return;
      const id = typeof it.id === "string" && it.id ? it.id.slice(0, 40) : `i_${Date.now().toString(36)}`;
      const clean: Interactable = { id, x: it.x | 0, y: it.y | 0, kind: it.kind, title: String(it.title ?? "").slice(0, 60) || "Objeto", url: typeof it.url === "string" ? it.url.slice(0, 500) : undefined, text: typeof it.text === "string" ? it.text.slice(0, 5000) : undefined, emote: typeof it.emote === "string" ? it.emote.slice(0, 4) : undefined, options: Array.isArray(it.options) ? it.options.slice(0, 10).map((o) => String(o).slice(0, 60)).filter(Boolean) : undefined };
      this.map.interactables = this.map.interactables.filter((o) => o.id !== id && !(o.x === clean.x && o.y === clean.y)).concat(clean);
      this.syncMapToState(this.state);
      this.scheduleSave();
    });
    this.onMessage("interactable:remove", (client, msg: { id: string }) => {
      if (!this.canBuild(client)) return;
      this.map.interactables = this.map.interactables.filter((o) => o.id !== msg?.id);
      this.syncMapToState(this.state);
      this.scheduleSave();
    });
    this.onMessage("portal:set", (client, p: Portal) => {
      if (!this.canBuild(client) || !p || typeof p.targetMapId !== "string") return;
      const target = S.getMap(p.targetMapId);
      if (!target || target.space_id !== this.space.id || !inBounds(this.map, p.x | 0, p.y | 0)) return;
      const id = typeof p.id === "string" && p.id ? p.id.slice(0, 40) : `p_${Date.now().toString(36)}`;
      const clean: Portal = { id, x: p.x | 0, y: p.y | 0, targetMapId: p.targetMapId, targetX: p.targetX | 0, targetY: p.targetY | 0, label: typeof p.label === "string" ? p.label.slice(0, 40) : target.name };
      this.map.portals = this.map.portals.filter((o) => o.id !== id && !(o.x === clean.x && o.y === clean.y)).concat(clean);
      this.syncMapToState(this.state);
      this.scheduleSave();
    });
    this.onMessage("portal:remove", (client, msg: { id: string }) => {
      if (!this.canBuild(client)) return;
      this.map.portals = this.map.portals.filter((o) => o.id !== msg?.id);
      this.syncMapToState(this.state);
      this.scheduleSave();
    });
    this.onMessage("spawn:set", (client, msg: { x: number; y: number }) => {
      if (!this.canBuild(client) || !isWalkable(this.map, msg?.x | 0, msg?.y | 0)) return;
      this.map.spawn = { x: msg.x | 0, y: msg.y | 0 };
      this.syncMapToState(this.state);
      this.scheduleSave();
    });
    this.onMessage("map:import", (client, data: any) => {
      if (!this.canBuild(client)) return;
      const m = normalizeMap(data);
      if (!m) return client.send("system", { text: "Mapa inválido.", ts: Date.now() });
      this.map = m;
      this.syncMapToState(this.state, true);
      this.refreshZones();
      for (const [sid, p] of this.state.players) {
        if (!isWalkable(this.map, p.x, p.y)) { p.x = m.spawn.x; p.y = m.spawn.y; }
        const c = this.clients.find((c) => c.sessionId === sid); if (c) this.afterMove(c, p);
      }
      this.flushSave();
      this.broadcast("system", { text: `${this.player(client)?.name} importou um novo mapa`, ts: Date.now() });
    });
    this.onMessage("map:rename", (client, msg: { name: string }) => {
      if (!this.canBuild(client) || typeof msg?.name !== "string") return;
      const name = msg.name.trim().slice(0, 40); if (!name) return;
      S.renameMap(this.mapRow.id, name);
      this.state.mapName = name;
    });

    // --- moderation (moderator+)
    this.onMessage("kick", (client, msg: { to: string; ban?: boolean; reason?: string }) => {
      const actor = this.auth(client);
      if (!S.can.moderate(actor.role)) return;
      const target = this.clients.find((c) => c.sessionId === msg?.to);
      const tp = target && this.player(target);
      if (!target || !tp) return;
      const targetRole = this.auth(target).role;
      if (targetRole === "owner" || (targetRole === "moderator" && actor.role !== "owner")) return;
      if (msg.ban) S.ban(this.space.id, tp.userId, String(msg.reason ?? "").slice(0, 200));
      S.logMod(this.space.id, { id: actor.user.id, name: actor.user.name }, msg.ban ? "ban" : "kick", { id: tp.userId, name: tp.name }, String(msg.reason ?? ""));
      target.send("kicked", { ban: !!msg.ban, reason: msg.reason ?? "" });
      this.broadcast("system", { text: `${tp.name} foi ${msg.ban ? "banido" : "removido"} por ${actor.user.name}`, ts: Date.now() }, { except: target });
      setTimeout(() => target.leave(4000), 150);
    });
    this.onMessage("role", (client, msg: { to: string; role: S.Role }) => {
      const actor = this.auth(client);
      if (!S.can.moderate(actor.role) || !["moderator", "member", "guest"].includes(msg?.role)) return;
      if (msg.role === "moderator" && actor.role !== "owner") return;
      const target = this.clients.find((c) => c.sessionId === msg.to);
      const tp = target && this.player(target);
      if (!target || !tp || tp.userId === this.space.owner_id) return;
      S.setRole(this.space.id, tp.userId, msg.role);
      S.logMod(this.space.id, { id: actor.user.id, name: actor.user.name }, "role:" + msg.role, { id: tp.userId, name: tp.name });
      (target.auth as ClientAuth).role = msg.role;
      tp.role = msg.role;
      target.send("system", { text: `Seu papel agora é: ${msg.role}`, ts: Date.now() });
    });
  }

  onJoin(client: Client, options: JoinOptions) {
    const { user, role } = this.auth(client);
    // One avatar per user per room: a second tab replaces the first.
    for (const [sid, other] of this.state.players) {
      if (other.userId === user.id && sid !== client.sessionId) {
        const c = this.clients.find((c) => c.sessionId === sid);
        if (c) { c.send("system", { text: "Você entrou em outra aba.", ts: Date.now() }); c.leave(4000); }
        this.removePlayer(sid, true);
      }
    }
    const avatar = normalizeAvatar(user.avatar);
    const p = new Player();
    p.id = client.sessionId;
    p.userId = user.id;
    p.name = user.name;
    p.color = avatar.shirt;
    p.avatar = JSON.stringify(avatar);
    p.role = role;
    const spawn = Number.isInteger(options.spawnX) && Number.isInteger(options.spawnY) && isWalkable(this.map, options.spawnX!, options.spawnY!)
      ? { x: options.spawnX!, y: options.spawnY! } : this.freeSpawn();
    p.x = spawn.x;
    p.y = spawn.y;
    p.joinedAt = Date.now();
    p.statusText = (user as any).statusText ?? "";
    this.state.players.set(client.sessionId, p);
    this.afterMove(client, p, true);
    this.visits.set(client.sessionId, S.recordVisit(this.space.id, this.mapRow.id, user.id));
    this.groupsDirty = true;
    this.broadcast("system", { text: `${p.name} entrou em ${this.state.mapName}`, ts: Date.now() }, { except: client });
    client.send("welcome", { id: client.sessionId, userId: user.id, role, spaceId: this.space.id, mapId: this.mapRow.id, maps: S.listMaps(this.space.id), media: mediaEnabled() });
  }

  async onLeave(client: Client, code?: number) {
    const p = this.player(client);
    if (!p) return;
    p.connected = false;
    if (code !== 4000) {
      try { await this.allowReconnection(client, 20); p.connected = true; return; } catch {}
    }
    this.removePlayer(client.sessionId);
  }

  onDispose() {
    this.flushSave();
    this.presence.unsubscribe(`space:${this.space.id}`, this.onSpaceSettings);
    this.presence.unsubscribe(`space:${this.space.id}`, this.onSpaceEvent);
    for (const v of this.visits.values()) S.endVisit(v);
  }

  private onSpaceEvent = (what: string) => { if (what === "events" || what === "pins") this.broadcast("refresh", { what }); };

  /** Audio/video conversation groups, pushed into each player's state so clients can join the right LiveKit room. */
  private recomputeGroups() {
    if (!this.groupsDirty) return;
    this.groupsDirty = false;
    const players = [...this.state.players.values()].filter((p) => p.connected).map((p) => ({ id: p.id, x: p.x, y: p.y }));
    const groups = conversationGroups(this.map, this.state.mapId, players);
    for (const p of this.state.players.values()) { const g = groups[p.id] ?? ""; if (p.mediaGroup !== g) p.mediaGroup = g; }
  }

  private checkReminders() {
    const soon = Date.now() + 5 * 60 * 1000;
    for (const ev of S.listEvents(this.space.id, Date.now(), 20)) {
      if (ev.starts_at <= soon && ev.starts_at > Date.now() && !this.lastReminder.has(ev.id)) {
        this.lastReminder.add(ev.id);
        this.broadcast("event:reminder", { id: ev.id, title: ev.title, startsAt: ev.starts_at, mapId: ev.map_id, zoneId: ev.zone_id });
      }
    }
  }

  // Arrow function so the same reference can be unsubscribed without dropping other rooms' listeners.
  private onSpaceSettings = () => {
    this.space = S.getSpace(this.space.id) ?? this.space;
    this.state.spaceName = this.space.name;
    this.refreshWeather();
  };

  private async refreshWeather() {
    try {
      const info: WeatherInfo = await getWeather(this.space.id, this.space.location || "São Paulo");
      const out = { ...info };
      if (this.space.weather_mode && this.space.weather_mode !== "auto") { out.kind = this.space.weather_mode as any; out.source = "manual"; }
      this.state.weather = JSON.stringify(out);
      this.state.timeMode = this.space.time_mode || "auto";
    } catch {
      this.state.weather = JSON.stringify(simulated(this.space.location || "São Paulo"));
    }
  }

  // ------------------------------------------------------------- helpers
  private auth(client: Client) { return client.auth as ClientAuth; }
  private player(client: Client) { return this.state.players.get(client.sessionId); }
  private canBuild(client: Client) { return S.can.build(this.auth(client)?.role); }
  private objState(key: string) { const v = this.state.objectState.get(key); try { return v ? JSON.parse(v) : null; } catch { return null; } }
  private setObjState(key: string, value: any) { this.state.objectState.set(key, JSON.stringify(value)); S.setObjectState(this.space.id, key, value); }

  /** Copies this.map (plain data) into the schema state. */
  private syncMapToState(state: OfficeState, layers = false) {
    state.width = this.map.width;
    state.height = this.map.height;
    state.spawnX = this.map.spawn.x;
    state.spawnY = this.map.spawn.y;
    if (layers) {
      if (state.floor.length === 0) { state.floor.push(...this.map.floor); state.objects.push(...this.map.objects); }
      else {
        // Same-size maps patch in place; a different size needs a fresh array.
        const same = state.floor.length === this.map.floor.length;
        if (!same) { state.floor.clear(); state.objects.clear(); state.floor.push(...this.map.floor); state.objects.push(...this.map.objects); }
        else for (let i = 0; i < this.map.floor.length; i++) { if (state.floor[i] !== this.map.floor[i]) state.floor[i] = this.map.floor[i]; if (state.objects[i] !== this.map.objects[i]) state.objects[i] = this.map.objects[i]; }
      }
    }
    const syncMap = <T extends { id: string }, U extends { id: string }>(list: T[], target: Map<string, U>, make: (t: T) => U, same: (t: T, u: U) => boolean) => {
      const ids = new Set(list.map((i) => i.id));
      for (const k of [...target.keys()]) if (!ids.has(k)) target.delete(k);
      for (const item of list) { const cur = target.get(item.id); if (!cur || !same(item, cur)) target.set(item.id, make(item)); }
    };
    syncMap(this.map.zones, state.zones as any, (z) => Object.assign(new ZoneS(), z), (z, s) => JSON.stringify(z) === JSON.stringify(s.toJSON()));
    syncMap(this.map.interactables, state.interactables as any, (i) => Object.assign(new InteractableS(), { id: i.id, x: i.x, y: i.y, kind: i.kind, title: i.title, url: i.url ?? "", text: i.text ?? "", emote: i.emote ?? "", options: JSON.stringify(i.options ?? []) }), (i, s) => s.x === i.x && s.y === i.y && s.kind === i.kind && s.title === i.title && s.url === (i.url ?? "") && s.text === (i.text ?? "") && s.emote === (i.emote ?? "") && s.options === JSON.stringify(i.options ?? []));
    syncMap(this.map.portals, state.portals as any, (p) => Object.assign(new PortalS(), { ...p, label: p.label ?? "" }), (p, s) => s.x === p.x && s.y === p.y && s.targetMapId === p.targetMapId && s.targetX === p.targetX && s.targetY === p.targetY && s.label === (p.label ?? ""));
  }

  private refreshZones() {
    for (const [sid, p] of this.state.players) { const c = this.clients.find((c) => c.sessionId === sid); if (c) this.afterMove(c, p); }
  }

  private handleMove(client: Client, msg: { dir: number }) {
    const p = this.player(client);
    if (!p || !DIR_DELTA[msg?.dir]) return;
    p.dir = msg.dir;
    const now = Date.now();
    const last = this.lastStep.get(client.sessionId) ?? 0;
    if (now - last < STEP_MS - 15) return;
    const target = stepTarget(this.map, p.x, p.y, msg.dir);
    if (!target) return;
    if (!p.ghost) {
      for (const other of this.state.players.values()) {
        if (other !== p && other.connected && !other.ghost && other.x === target.x && other.y === target.y) return;
      }
    }
    this.lastStep.set(client.sessionId, now);
    p.x = target.x;
    p.y = target.y;
    this.afterMove(client, p);
  }

  private afterMove(client: Client, p: Player, silent = false) {
    this.groupsDirty = true;
    const z = zoneAt(this.map, p.x, p.y);
    const zoneId = z?.id ?? "";
    if (p.zone !== zoneId) {
      p.zone = zoneId;
      if (!silent) client.send("zone", { id: zoneId, name: z?.name ?? "" });
    }
    p.sitting = SITTABLE.has(this.map.objects[idx(this.map, p.x, p.y)]);
    if (p.sitting) p.dir = 0; // sit facing forward
    const portal = portalAt(this.map, p.x, p.y);
    if (portal && !silent) {
      const target = S.getMap(portal.targetMapId);
      if (target && target.space_id === this.space.id) client.send("portal", { mapId: target.id, mapName: target.name, x: portal.targetX, y: portal.targetY });
    }
  }

  private handleChat(client: Client, msg: ChatIn) {
    const p = this.player(client);
    if (!p || typeof msg?.text !== "string") return;
    const now = Date.now();
    if (now - (this.lastChat.get(client.sessionId) ?? 0) < CHAT_MIN_INTERVAL) return;
    this.lastChat.set(client.sessionId, now);
    const text = msg.text.trim().slice(0, MAX_CHAT);
    if (!text) return;
    const base: ChatOut = { id: ++this.chatSeq, from: p.id, fromUserId: p.userId, fromName: p.name, fromColor: p.color, text, scope: "nearby", ts: now };
    const persist = (scope: string, extra: { to?: string; recipients?: string[] } = {}) =>
      S.saveMessage({ spaceId: this.space.id, mapId: this.state.mapId, scope, from: p.userId, fromName: p.name, fromColor: p.color, text, ts: now, ...extra });

    if (msg.scope === "dm" && msg.to) {
      const target = this.clients.find((c) => c.sessionId === msg.to);
      const tp = target && this.player(target);
      if (!target || !tp) return client.send("system", { text: "Essa pessoa não está mais aqui.", ts: now });
      const out = { ...base, scope: "dm" as const, to: msg.to, toUserId: tp.userId, toName: tp.name };
      target.send("chat", out);
      client.send("chat", out);
      persist("dm", { to: tp.userId });
      return;
    }
    if (msg.scope === "everyone") {
      this.broadcast("chat", { ...base, scope: "everyone" });
      persist("everyone");
      return;
    }
    if (isSpotlight(this.map, p.x, p.y)) {
      this.broadcast("chat", { ...base, scope: "spotlight" });
      persist("spotlight");
      return;
    }
    const scope = p.zone ? "zone" : "nearby";
    const recipients: string[] = [];
    for (const c of this.clients) {
      const other = this.player(c);
      if (!other) continue;
      if (c === client || canHear(this.map, p, other)) { c.send("chat", { ...base, scope }); if (c !== client) recipients.push(other.userId); }
    }
    persist(scope, { recipients });
  }

  private handleBuild(msg: BuildIn) {
    if (!msg || !inBounds(this.map, msg.x, msg.y) || !Number.isInteger(msg.tile)) return;
    const i = idx(this.map, msg.x, msg.y);
    if (msg.layer === "floor") {
      if (!Object.values(F).includes(msg.tile as any)) return;
      this.map.floor[i] = msg.tile; this.state.floor[i] = msg.tile;
    } else if (msg.layer === "objects") {
      if (!isValidObject(msg.tile)) return;
      this.map.objects[i] = msg.tile; this.state.objects[i] = msg.tile;
    } else return;
    for (const [sid, p] of this.state.players) {
      if (p.x === msg.x && p.y === msg.y && !isWalkable(this.map, p.x, p.y)) {
        const s = this.freeSpawn(); p.x = s.x; p.y = s.y;
        const c = this.clients.find((c) => c.sessionId === sid); if (c) this.afterMove(c, p);
      }
      p.sitting = SITTABLE.has(this.map.objects[idx(this.map, p.x, p.y)]);
    }
    this.scheduleSave();
  }

  private setEmote(p: Player, emote: string) {
    p.emote = emote;
    const old = this.emoteTimers.get(p.id);
    if (old) clearTimeout(old);
    this.emoteTimers.set(p.id, setTimeout(() => { const cur = this.state.players.get(p.id); if (cur) cur.emote = ""; this.emoteTimers.delete(p.id); }, EMOTE_MS));
  }

  private removePlayer(sessionId: string, silent = false) {
    const p = this.state.players.get(sessionId);
    if (!p) return;
    const v = this.visits.get(sessionId); if (v) { S.endVisit(v); this.visits.delete(sessionId); }
    this.groupsDirty = true;
    this.state.players.delete(sessionId);
    this.lastStep.delete(sessionId);
    const t = this.emoteTimers.get(sessionId);
    if (t) clearTimeout(t);
    if (!silent) this.broadcast("system", { text: `${p.name} saiu`, ts: Date.now() });
  }

  private freeSpawn() {
    const { x, y } = this.map.spawn;
    const taken = new Set<string>();
    for (const p of this.state.players.values()) taken.add(`${p.x},${p.y}`);
    for (let r = 0; r < 8; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const tx = x + dx, ty = y + dy;
        if (!taken.has(`${tx},${ty}`) && isWalkable(this.map, tx, ty)) return { x: tx, y: ty };
      }
    }
    return { x, y };
  }

  private scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => this.flushSave(), 800);
  }
  private flushSave() {
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    try { S.saveMapData(this.mapRow.id, this.map); } catch (e) { console.warn("could not save map", e); }
  }
}
