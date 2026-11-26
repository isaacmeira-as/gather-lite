import { Client, Room, getStateCallbacks } from "@colyseus/sdk";
import { bus } from "./bus";
import type { Zone, Interactable } from "../shared/map";

export interface PlayerView {
  id: string; name: string; color: string; skin: number; x: number; y: number; dir: number;
  status: string; emote: string; zone: string; sitting: boolean; connected: boolean; joinedAt: number;
}
export interface OfficeStateView {
  width: number; height: number;
  floor: number[]; objects: number[];
  players: Map<string, PlayerView>;
  notes: Map<string, string>;
}

export interface WelcomeInfo { id: string; map: { zones: Zone[]; interactables: Interactable[]; spawn: { x: number; y: number } } }

function endpoint() {
  const fromEnv = (import.meta as any).env?.VITE_SERVER as string | undefined;
  if (fromEnv) return fromEnv;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  // In dev (vite on 5173) the server runs on 2567; in prod both share the origin.
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
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  async join(options: { name: string; color: string; skin: number }) {
    const welcome = new Promise<WelcomeInfo>((resolve) => {
      const once = (w: WelcomeInfo) => { resolve(w); };
      this._welcomeResolver = once;
    });
    this.room = await this.client.joinOrCreate<OfficeStateView>("office", options);
    this.sessionId = this.room.sessionId;
    this.$ = getStateCallbacks(this.room);

    this.room.onMessage("welcome", (w: WelcomeInfo) => { this.welcome = w; this._welcomeResolver?.(w); bus.emit("welcome", w); });
    this.room.onMessage("chat", (m) => bus.emit("chat", m));
    this.room.onMessage("system", (m) => bus.emit("system", m));
    this.room.onMessage("zone", (m) => bus.emit("zone", m));
    this.room.onMessage("pong", (t: number) => { this.latency = Date.now() - t; bus.emit("latency", this.latency); });
    this.room.onLeave((code) => { bus.emit("disconnected", code); if (this.pingTimer) clearInterval(this.pingTimer); });
    this.room.onDrop(() => bus.emit("toast", "Conexão caiu, tentando reconectar…"));
    this.room.onReconnect(() => bus.emit("toast", "Reconectado!"));
    window.addEventListener("beforeunload", () => { try { this.room.leave(true); } catch {} });
    this.room.onError((code, msg) => bus.emit("error", { code, msg }));

    this.pingTimer = setInterval(() => this.room.send("ping", Date.now()), 5000);
    await welcome;
    try { localStorage.setItem("gather-lite:reconnect", this.room.reconnectionToken); } catch {}
    return this.room;
  }
  private _welcomeResolver: ((w: WelcomeInfo) => void) | null = null;

  get state() { return this.room.state; }
  get me() { return this.state.players.get(this.sessionId); }
  send(type: string, data?: any) { this.room.send(type, data); }

  move(dir: number) { this.send("move", { dir }); }
  face(dir: number) { this.send("face", { dir }); }
  chat(text: string, scope: "nearby" | "everyone" | "dm" = "nearby", to?: string) { this.send("chat", { text, scope, to }); }
  setStatus(status: string) { this.send("status", { status }); }
  emote(emote: string) { this.send("emote", { emote }); }
  interact(id: string) { this.send("interact", { id }); }
  note(id: string, text: string) { this.send("note", { id, text }); }
  build(layer: "floor" | "objects", x: number, y: number, tile: number) { this.send("build", { layer, x, y, tile }); }
  teleport(x: number, y: number) { this.send("teleport", { x, y }); }
}

export const net = new Net();
