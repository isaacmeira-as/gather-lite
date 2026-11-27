import { Client, Room, getStateCallbacks } from "@colyseus/sdk";
import { bus } from "./bus";
import { getToken } from "./api";

export interface PlayerView {
  id: string; userId: string; name: string; color: string; avatar: string; role: string; x: number; y: number; dir: number;
  status: string; statusText: string; mediaGroup: string; emote: string; zone: string; sitting: boolean; ghost: boolean; connected: boolean; joinedAt: number;
}
export interface ZoneView { id: string; name: string; x: number; y: number; w: number; h: number; color: string }
export interface InteractableView { id: string; x: number; y: number; kind: string; title: string; url: string; text: string; emote: string; options: string }
export interface PortalView { id: string; x: number; y: number; targetMapId: string; targetX: number; targetY: number; label: string }
export interface OfficeStateView {
  spaceId: string; spaceName: string; mapId: string; mapName: string;
  width: number; height: number; spawnX: number; spawnY: number; weather: string; timeMode: string;
  floor: number[]; objects: number[];
  zones: Map<string, ZoneView>; interactables: Map<string, InteractableView>; portals: Map<string, PortalView>;
  players: Map<string, PlayerView>;
  notes: Map<string, string>;
  objectState: Map<string, string>;
}
export interface WelcomeInfo { id: string; userId: string; role: string; spaceId: string; mapId: string; maps: { id: string; name: string; is_default: number }[]; media: boolean }

function endpoint() {
  const fromEnv = (import.meta as any).env?.VITE_SERVER as string | undefined;
  if (fromEnv) return fromEnv;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const port = location.port === "5173" ? "2567" : location.port;
  return `${proto}://${location.hostname}${port ? ":" + port : ""}`;
}

export class Net {
  client = new Client(endpoint());
  room!: Room<OfficeStateView>;
  $!: ReturnType<typeof getStateCallbacks<OfficeStateView>>;
  sessionId = "";
  welcome!: WelcomeInfo;
  latency = 0;
  switching = false;
  spaceInfo: any = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private unloadHandler = () => { try { this.room?.leave(true); } catch {} };

  async join(opts: { spaceId: string; mapId: string; spawnX?: number; spawnY?: number }) {
    const token = getToken() ?? "";
    this.client.auth.token = token;
    let resolveWelcome!: (w: WelcomeInfo) => void;
    const welcome = new Promise<WelcomeInfo>((r) => (resolveWelcome = r));
    const room = await this.client.joinOrCreate<OfficeStateView>("office", { ...opts, token });
    this.room = room;
    this.sessionId = room.sessionId;
    this.$ = getStateCallbacks(room);

    room.onMessage("welcome", (w: WelcomeInfo) => { this.welcome = w; resolveWelcome(w); bus.emit("welcome", w); });
    room.onMessage("chat", (m) => bus.emit("chat", m));
    room.onMessage("system", (m) => bus.emit("system", m));
    room.onMessage("zone", (m) => bus.emit("zone", m));
    room.onMessage("portal", (m) => bus.emit("portal", m));
    room.onMessage("summon", (m) => bus.emit("summon", m));
    room.onMessage("wave", (m) => bus.emit("wave", m));
    room.onMessage("kicked", (m) => bus.emit("kicked", m));
    room.onMessage("reaction", (m) => bus.emit("reaction", m));
    room.onMessage("refresh", (m) => bus.emit("refresh", m));
    room.onMessage("event:reminder", (m) => bus.emit("event:reminder", m));
    room.onMessage("draw:stroke", (m) => bus.emit("draw:stroke", m));
    room.onMessage("draw:clear", (m) => bus.emit("draw:clear", m));
    room.onMessage("pong", (t: number) => { this.latency = Date.now() - t; bus.emit("latency", this.latency); });
    room.onLeave((code) => { if (this.pingTimer) clearInterval(this.pingTimer); if (!this.switching) bus.emit("disconnected", code); });
    room.onDrop(() => bus.emit("toast", "Conexão caiu, tentando reconectar…"));
    room.onReconnect(() => bus.emit("toast", "Reconectado!"));
    window.removeEventListener("beforeunload", this.unloadHandler);
    window.addEventListener("beforeunload", this.unloadHandler);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => this.room.send("ping", Date.now()), 5000);
    await welcome;
    return room;
  }

  /** Leave the current map and join another one (portal / map picker). */
  async switchMap(mapId: string, x?: number, y?: number) {
    if (this.switching) return;
    this.switching = true;
    const spaceId = this.state.spaceId;
    bus.emit("map:leaving");
    await new Promise((r) => setTimeout(r, 230));
    try {
      try { await this.room.leave(true); } catch {}
      await this.join({ spaceId, mapId, spawnX: x, spawnY: y });
      bus.emit("map:switched");
    } finally {
      this.switching = false;
    }
  }

  get state() { return this.room?.state as OfficeStateView; }
  get me() { return this.state?.players?.get(this.sessionId); }
  get role() { return this.welcome?.role ?? "guest"; }
  get canBuild() { return this.role === "owner" || this.role === "moderator"; }
  send(type: string, data?: any) { this.room.send(type, data); }

  move(dir: number) { this.send("move", { dir }); }
  face(dir: number) { this.send("face", { dir }); }
  chat(text: string, scope: "nearby" | "everyone" | "dm" = "nearby", to?: string) { this.send("chat", { text, scope, to }); }
  setStatus(status: string, text?: string) { this.send("status", { status, text }); }
  reaction(id: string) { this.send("reaction", { id }); }
  emote(emote: string) { this.send("emote", { emote }); }
  interact(id: string) { this.send("interact", { id }); }
  note(id: string, text: string) { this.send("note", { id, text }); }
  build(layer: "floor" | "objects", x: number, y: number, tile: number) { this.send("build", { layer, x, y, tile }); }
  teleport(x: number, y: number) { this.send("teleport", { x, y }); }
  ghost(on: boolean) { this.send("ghost", { ghost: on }); }
}

export const net = new Net();
