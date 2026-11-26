import Phaser from "phaser";
import { net, PlayerView, ZoneView, InteractableView, PortalView } from "../net";
import { bus } from "../bus";
import { TILE, DIR, isSolid, O } from "../../shared/tiles";
import { MapData, Interactable, Zone, Portal, canHear, findPath, interactableNear, zoneAt, isSpotlight, inBounds, idx, isWalkable, stepTarget } from "../../shared/map";
import { drawTileset } from "../textures/tiles";
import { drawAvatarSheet, AV_W, AV_H, AV_FRAMES_PER_DIR } from "../textures/avatars";
import { normalizeAvatar, avatarKey } from "../../shared/avatar";

const STEP_MS = 130;
const BUBBLE_MS = 5000;
const STATUS_COLORS: Record<string, number> = { available: 0x22c55e, busy: 0xf59e0b, dnd: 0xef4444 };
const FONT = "ui-sans-serif, system-ui, sans-serif";

export type BuildTool = "tile" | "erase" | "zone" | "interactable" | "portal" | "spawn";

class PlayerSprite extends Phaser.GameObjects.Container {
  sprite: Phaser.GameObjects.Sprite;
  nameText: Phaser.GameObjects.Text;
  roleText: Phaser.GameObjects.Text;
  statusDot: Phaser.GameObjects.Arc;
  emoteText: Phaser.GameObjects.Text;
  bubble: Phaser.GameObjects.Container;
  bubbleText: Phaser.GameObjects.Text;
  bubbleBg: Phaser.GameObjects.Graphics;
  bubbleTimer?: Phaser.Time.TimerEvent;
  tween?: Phaser.Tweens.Tween;
  texKey: string;
  view: PlayerView;
  tileX: number;
  tileY: number;

  constructor(scene: OfficeScene, view: PlayerView) {
    super(scene, view.x * TILE + TILE / 2, view.y * TILE + TILE / 2);
    this.view = view;
    this.tileX = view.x;
    this.tileY = view.y;
    this.texKey = scene.ensureAvatarTexture(view.avatar);
    this.sprite = scene.add.sprite(0, 10, this.texKey, `0-0`).setOrigin(0.5, 1);
    this.nameText = scene.add.text(0, -32, view.name, { fontFamily: FONT, fontSize: "10px", color: "#ffffff", stroke: "#000000", strokeThickness: 3, resolution: 3 }).setOrigin(0.5, 1);
    this.roleText = scene.add.text(0, -32, "", { fontFamily: FONT, fontSize: "7px", color: "#facc15", stroke: "#000000", strokeThickness: 2, resolution: 3 }).setOrigin(0, 1);
    this.statusDot = scene.add.circle(0, -36, 2.5, 0x22c55e).setStrokeStyle(1, 0x000000, 0.6);
    this.emoteText = scene.add.text(0, -40, "", { fontSize: "16px", resolution: 3 }).setOrigin(0.5, 1).setVisible(false);
    this.bubbleBg = scene.add.graphics();
    this.bubbleText = scene.add.text(0, 0, "", { fontFamily: FONT, fontSize: "9px", color: "#111827", wordWrap: { width: 110 }, resolution: 3, align: "center" }).setOrigin(0.5, 1);
    this.bubble = scene.add.container(0, -42, [this.bubbleBg, this.bubbleText]).setVisible(false);
    this.add([this.sprite, this.nameText, this.roleText, this.statusDot, this.emoteText, this.bubble]);
    this.layoutName();
    scene.add.existing(this);
    this.setDepth(this.y);
  }

  layoutName() {
    this.nameText.setText(this.view.name);
    const w = this.nameText.width;
    this.nameText.setX(3);
    this.statusDot.setPosition(-w / 2 - 2, -36);
    this.statusDot.setFillStyle(STATUS_COLORS[this.view.status] ?? 0x22c55e);
    const badge = this.view.role === "owner" ? "★" : this.view.role === "moderator" ? "◆" : "";
    this.roleText.setText(badge).setPosition(w / 2 + 5, -32);
  }

  setTexture(key: string) {
    this.texKey = key;
    this.sprite.setTexture(key, `${this.view.dir}-0`);
  }

  setFacing(dir: number) {
    if (!this.sprite?.anims) return;
    if (this.view.sitting) this.sprite.setFrame(`sit-${Math.min(dir, AV_FRAMES_PER_DIR - 1)}`);
    else if (!this.sprite.anims.isPlaying) this.sprite.setFrame(`${dir}-0`);
  }

  walkTile(x: number, y: number, dir: number) {
    const scene = this.scene as OfficeScene;
    const tx = x * TILE + TILE / 2;
    const ty = y * TILE + TILE / 2;
    this.tileX = x;
    this.tileY = y;
    this.tween?.stop();
    const far = Math.abs(tx - this.x) > TILE * 2 || Math.abs(ty - this.y) > TILE * 2;
    if (far) { this.setPosition(tx, ty); this.setDepth(ty); this.setFacing(dir); return; }
    if (!this.view.sitting) this.sprite.play(`${this.texKey}-walk-${dir}`, true);
    this.tween = scene.tweens.add({
      targets: this, x: tx, y: ty, duration: STEP_MS,
      onUpdate: () => this.setDepth(this.y),
      onComplete: () => {
        this.setDepth(ty);
        scene.time.delayedCall(40, () => { if (!this.scene || !this.sprite?.anims) return; if (!this.tween || !this.tween.isPlaying()) { this.sprite.stop(); this.setFacing(this.view.dir); } });
      },
    });
  }

  showBubble(text: string) {
    this.bubbleText.setText(text.length > 90 ? text.slice(0, 90) + "…" : text);
    const w = this.bubbleText.width + 10, h = this.bubbleText.height + 8;
    this.bubbleBg.clear();
    this.bubbleBg.fillStyle(0xffffff, 0.95);
    this.bubbleBg.fillRoundedRect(-w / 2, -h, w, h, 4);
    this.bubbleBg.fillTriangle(-3, 0, 3, 0, 0, 4);
    this.bubbleText.setPosition(0, -4);
    this.bubble.setVisible(true);
    this.bubbleTimer?.remove();
    this.bubbleTimer = this.scene.time.delayedCall(BUBBLE_MS, () => this.bubble.setVisible(false));
  }

  showEmote(emote: string) {
    if (!emote) { this.emoteText.setVisible(false); return; }
    this.emoteText.setText(emote).setVisible(true).setAlpha(0).setY(-36);
    this.scene.tweens.add({ targets: this.emoteText, alpha: 1, y: -46, duration: 250, ease: "Back.Out" });
  }
}

export class OfficeScene extends Phaser.Scene {
  mapData!: MapData;
  floorLayer!: Phaser.Tilemaps.TilemapLayer;
  objectLayer!: Phaser.Tilemaps.TilemapLayer;
  tilemap!: Phaser.Tilemaps.Tilemap;
  zoneGfx!: Phaser.GameObjects.Graphics;
  zoneLabels: Phaser.GameObjects.GameObject[] = [];
  markerGfx!: Phaser.GameObjects.Graphics;
  markerLabels: Phaser.GameObjects.GameObject[] = [];
  players = new Map<string, PlayerSprite>();
  me: PlayerSprite | null = null;
  keys!: Record<string, Phaser.Input.Keyboard.Key>;
  lastSend = 0;
  virtualDir = -1; // from the touch joystick
  autoPath: { x: number; y: number }[] | null = null;
  autoPathLastProgress = 0;
  locateTarget: string | null = null;
  followTarget: string | null = null;
  followTick = 0;
  locateGfx!: Phaser.GameObjects.Graphics;
  pathGfx!: Phaser.GameObjects.Graphics;
  build: { active: boolean; tool: BuildTool; layer: "floor" | "objects"; tile: number } = { active: false, tool: "tile", layer: "objects", tile: O.WALL };
  buildCursor!: Phaser.GameObjects.Rectangle;
  gridGfx!: Phaser.GameObjects.Graphics;
  dragStart: { x: number; y: number } | null = null;
  dragGfx!: Phaser.GameObjects.Graphics;
  promptText!: Phaser.GameObjects.Text;
  nearbyInteractable: Interactable | null = null;
  nearbyIds = new Set<string>();
  hearingTick = 0;
  unsubs: (() => void)[] = [];

  constructor() { super("office"); }

  create() {
    const state = net.state;
    this.players.clear();
    this.me = null;
    this.autoPath = null; this.locateTarget = null; this.followTarget = null; this.nearbyInteractable = null; this.nearbyIds = new Set();
    this.mapData = {
      width: state.width, height: state.height,
      floor: Array.from(state.floor), objects: Array.from(state.objects),
      zones: [...state.zones.values()].map(zv), interactables: [...state.interactables.values()].map(iv), portals: [...state.portals.values()].map(pv),
      spawn: { x: state.spawnX, y: state.spawnY },
    };

    if (!this.textures.exists("tiles")) this.textures.addCanvas("tiles", drawTileset(document.createElement("canvas")));
    this.tilemap = this.make.tilemap({ tileWidth: TILE, tileHeight: TILE, width: this.mapData.width, height: this.mapData.height });
    const tileset = this.tilemap.addTilesetImage("tiles", "tiles", TILE, TILE, 0, 0, 0)!;
    this.floorLayer = this.tilemap.createBlankLayer("floor", tileset)!;
    this.objectLayer = this.tilemap.createBlankLayer("objects", tileset)!.setDepth(1);
    for (let y = 0; y < this.mapData.height; y++) for (let x = 0; x < this.mapData.width; x++) {
      const i = idx(this.mapData, x, y);
      this.floorLayer.putTileAt(this.mapData.floor[i], x, y);
      if (this.mapData.objects[i]) this.objectLayer.putTileAt(this.mapData.objects[i], x, y);
    }
    this.zoneGfx = this.add.graphics().setDepth(0.5);
    this.markerGfx = this.add.graphics().setDepth(0.9);
    this.pathGfx = this.add.graphics().setDepth(0.6);
    this.locateGfx = this.add.graphics().setDepth(0.7);
    this.gridGfx = this.add.graphics().setDepth(0.8).setVisible(false);
    this.dragGfx = this.add.graphics().setDepth(4999);
    this.buildCursor = this.add.rectangle(0, 0, TILE, TILE).setStrokeStyle(2, 0xfacc15).setOrigin(0).setDepth(5000).setVisible(false);
    this.promptText = this.add.text(0, 0, "X", { fontFamily: FONT, fontSize: "10px", color: "#111827", backgroundColor: "#facc15", padding: { x: 4, y: 2 }, resolution: 3 }).setOrigin(0.5, 1).setDepth(6000).setVisible(false);
    this.drawZones();
    this.drawMarkers();

    this.cameras.main.setBounds(0, 0, this.mapData.width * TILE, this.mapData.height * TILE);
    this.cameras.main.setZoom(this.registry.get("zoom") ?? (window.innerWidth < 700 ? 1.5 : 2));
    this.cameras.main.setRoundPixels(true);

    // ---- state subscriptions
    const $ = net.$;
    this.unsubs.forEach((u) => u()); this.unsubs = [];
    this.unsubs.push($(state).players.onAdd((p, key) => this.addPlayer(p, key)));
    this.unsubs.push($(state).players.onRemove((_p, key) => this.removePlayer(key)));
    this.unsubs.push($(state).floor.onChange((v, i) => this.setTile("floor", i, v)));
    this.unsubs.push($(state).objects.onChange((v, i) => this.setTile("objects", i, v)));
    const bindCollection = (coll: any, list: () => any[], set: (l: any[]) => void, conv: (v: any) => any, after: () => void) => {
      this.unsubs.push(coll.onAdd((item: any, key: string) => {
        set(list().filter((z) => z.id !== key).concat(conv(item)));
        after();
        this.unsubs.push($(item).onChange(() => { set(list().filter((z) => z.id !== key).concat(conv(item))); after(); }));
      }));
      this.unsubs.push(coll.onRemove((_item: any, key: string) => { set(list().filter((z) => z.id !== key)); after(); }));
    };
    bindCollection($(state).zones, () => this.mapData.zones, (l) => (this.mapData.zones = l), zv, () => { this.drawZones(); bus.emit("map:changed"); });
    bindCollection($(state).interactables, () => this.mapData.interactables, (l) => (this.mapData.interactables = l), iv, () => { this.drawMarkers(); this.onMeMoved(); bus.emit("map:changed"); });
    bindCollection($(state).portals, () => this.mapData.portals, (l) => (this.mapData.portals = l), pv, () => { this.drawMarkers(); bus.emit("map:changed"); });
    this.unsubs.push($(state).listen("spawnX", (v: number) => { this.mapData.spawn.x = v; this.drawMarkers(); }));
    this.unsubs.push($(state).listen("spawnY", (v: number) => { this.mapData.spawn.y = v; this.drawMarkers(); }));

    // ---- input
    const kb = this.input.keyboard!;
    kb.disableGlobalCapture();
    kb.removeAllListeners();
    this.keys = kb.addKeys({ up: "UP", down: "DOWN", left: "LEFT", right: "RIGHT", w: "W", a: "A", s: "S", d: "D" }) as any;
    kb.on("keydown", (e: KeyboardEvent) => this.onKeyDown(e));
    this.input.removeAllListeners();
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => this.onPointerDown(p));
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => this.onPointerMove(p));
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => this.onPointerUp(p));
    this.input.on("wheel", (_p: any, _o: any, _dx: number, dy: number) => this.setZoom(this.cameras.main.zoom - Math.sign(dy) * 0.25));
    this.input.mouse?.disableContextMenu();

    this.bindBus();
    bus.emit("scene:ready", this);
  }

  private busBound = false;
  bindBus() {
    if (this.busBound) return;
    this.busBound = true;
    bus.on("chat", (m) => { const ps = this.players.get(m.from); if (ps && m.scope !== "dm") ps.showBubble(m.text); });
    bus.on("ui:locate", (id: string | null) => { this.locateTarget = id === this.locateTarget ? null : id; this.locateGfx.clear(); });
    bus.on("ui:follow", (id: string | null) => { this.followTarget = id === this.followTarget ? null : id; if (!this.followTarget) { this.autoPath = null; this.pathGfx.clear(); } bus.emit("follow:changed", this.followTarget); });
    bus.on("ui:build", (cfg: Partial<typeof this.build>) => {
      Object.assign(this.build, cfg);
      this.gridGfx.setVisible(this.build.active);
      this.buildCursor.setVisible(this.build.active);
      if (this.build.active) this.drawGrid();
      this.drawMarkers();
      this.autoPath = null; this.dragStart = null; this.dragGfx.clear();
    });
    bus.on("ui:goto", (t: { x: number; y: number }) => this.walkTo(t.x, t.y));
    bus.on("ui:zoom", (delta: number) => this.setZoom(this.cameras.main.zoom + delta));
    bus.on("joystick", (dir: number) => { this.virtualDir = dir; });
  }

  setZoom(z: number) { const v = Phaser.Math.Clamp(z, 0.75, 4); this.cameras.main.setZoom(v); this.registry.set("zoom", v); }

  // ---------------------------------------------------------------- players
  ensureAvatarTexture(avatarJson: string) {
    let cfg; try { cfg = normalizeAvatar(JSON.parse(avatarJson)); } catch { cfg = normalizeAvatar({}); }
    const key = `av-${avatarKey(cfg)}`;
    if (this.textures.exists(key)) return key;
    const tex = this.textures.addCanvas(key, drawAvatarSheet(document.createElement("canvas"), cfg))!;
    for (let dir = 0; dir < 4; dir++) {
      for (let f = 0; f < AV_FRAMES_PER_DIR; f++) tex.add(`${dir}-${f}`, 0, f * AV_W, dir * AV_H, AV_W, AV_H);
      this.anims.create({ key: `${key}-walk-${dir}`, frames: [{ key, frame: `${dir}-1` }, { key, frame: `${dir}-0` }, { key, frame: `${dir}-2` }, { key, frame: `${dir}-0` }], frameRate: 12, repeat: -1 });
    }
    for (let dir = 0; dir < AV_FRAMES_PER_DIR; dir++) tex.add(`sit-${dir}`, 0, dir * AV_W, 4 * AV_H, AV_W, AV_H);
    return key;
  }

  addPlayer(p: PlayerView, key: string) {
    if (this.players.has(key)) this.removePlayer(key);
    const ps = new PlayerSprite(this, p);
    this.players.set(key, ps);
    ps.setFacing(p.dir);
    ps.setAlpha(p.connected ? 1 : 0.4);
    const $ = net.$;
    const isMe = key === net.sessionId;
    const onPos = () => {
      if (isMe && ps.tileX === p.x && ps.tileY === p.y) return; // prediction already applied
      ps.walkTile(p.x, p.y, p.dir);
    };
    this.unsubs.push($(p).listen("x", onPos), $(p).listen("y", onPos));
    this.unsubs.push($(p).listen("dir", (d: number) => ps.setFacing(d)));
    this.unsubs.push($(p).listen("sitting", () => { if (!ps.sprite?.anims) return; ps.sprite.stop(); ps.setFacing(p.dir); }));
    this.unsubs.push($(p).listen("emote", (e: string) => ps.showEmote(e)));
    this.unsubs.push($(p).listen("status", () => { ps.layoutName(); bus.emit("players"); }));
    this.unsubs.push($(p).listen("name", () => { ps.layoutName(); bus.emit("players"); }));
    this.unsubs.push($(p).listen("role", () => { ps.layoutName(); bus.emit("players"); }));
    this.unsubs.push($(p).listen("ghost", (g: boolean, prev: boolean) => { ps.sprite.setAlpha(g ? 0.5 : 1); if (isMe && prev !== undefined && prev !== g) bus.emit("ghost", g); }));
    this.unsubs.push($(p).listen("avatar", (a: string) => ps.setTexture(this.ensureAvatarTexture(a))));
    this.unsubs.push($(p).listen("zone", () => bus.emit("players")));
    this.unsubs.push($(p).listen("connected", (c: boolean) => { ps.setAlpha(c ? 1 : 0.4); bus.emit("players"); }));
    if (isMe) {
      this.me = ps;
      this.cameras.main.startFollow(ps, true, 0.15, 0.15);
      this.unsubs.push($(p).listen("x", () => this.onMeMoved()), $(p).listen("y", () => this.onMeMoved()));
      this.onMeMoved();
    }
    bus.emit("players");
  }

  removePlayer(key: string) {
    if (net.switching) return;
    const ps = this.players.get(key);
    if (!ps) return;
    ps.destroy();
    this.players.delete(key);
    if (this.locateTarget === key) { this.locateTarget = null; this.locateGfx.clear(); }
    if (this.followTarget === key) { this.followTarget = null; bus.emit("follow:changed", null); }
    bus.emit("players");
  }

  onMeMoved() {
    const me = net.me;
    if (!me || net.switching) return;
    const it = interactableNear(this.mapData, me.x, me.y);
    if (it?.id !== this.nearbyInteractable?.id) { this.nearbyInteractable = it; bus.emit("interactable", it); }
    if (it) this.promptText.setPosition(it.x * TILE + TILE / 2, it.y * TILE - 2).setVisible(true); else this.promptText.setVisible(false);
    if (this.autoPath && this.autoPath.length && this.autoPath[0].x === me.x && this.autoPath[0].y === me.y) {
      this.autoPath.shift();
      this.autoPathLastProgress = this.time.now;
      if (!this.autoPath.length) { this.autoPath = null; this.pathGfx.clear(); } else this.drawPath();
    }
    this.updateHearing(true);
    bus.emit("me:moved", { x: me.x, y: me.y, spotlight: isSpotlight(this.mapData, me.x, me.y), zone: zoneAt(this.mapData, me.x, me.y) });
  }

  updateHearing(force = false) {
    const me = net.me;
    if (!me || net.switching) return;
    const ids = new Set<string>();
    for (const [id, ps] of this.players) {
      if (id === net.sessionId) continue;
      const hear = canHear(this.mapData, me, ps.view);
      if (hear) ids.add(id);
      const target = (ps.view.connected ? 1 : 0.4) * (hear ? 1 : 0.5);
      if (Math.abs(ps.alpha - target) > 0.01) ps.setAlpha(target);
    }
    let changed = force || ids.size !== this.nearbyIds.size;
    if (!changed) for (const id of ids) if (!this.nearbyIds.has(id)) { changed = true; break; }
    if (changed) {
      const arrived = [...ids].filter((id) => !this.nearbyIds.has(id));
      this.nearbyIds = ids;
      bus.emit("nearby", [...ids], arrived);
    }
  }

  // ------------------------------------------------------------------ map
  setTile(layer: "floor" | "objects", i: number, v: number) {
    if (typeof v !== "number" || !this.floorLayer?.layer) return;
    const x = i % this.mapData.width, y = Math.floor(i / this.mapData.width);
    this.mapData[layer][i] = v;
    if (layer === "floor") this.floorLayer.putTileAt(v, x, y);
    else if (v) this.objectLayer.putTileAt(v, x, y); else this.objectLayer.removeTileAt(x, y);
    bus.emit("map:changed");
  }

  drawZones() {
    this.zoneGfx.clear();
    for (const t of this.zoneLabels) t.destroy();
    this.zoneLabels = [];
    for (const z of this.mapData.zones) {
      const c = Phaser.Display.Color.HexStringToColor(z.color).color;
      this.zoneGfx.fillStyle(c, 0.14).fillRect(z.x * TILE, z.y * TILE, z.w * TILE, z.h * TILE);
      this.zoneGfx.lineStyle(1, c, 0.6).strokeRect(z.x * TILE + 0.5, z.y * TILE + 0.5, z.w * TILE - 1, z.h * TILE - 1);
      this.zoneLabels.push(this.add.text(z.x * TILE + 2, z.y * TILE + 2, z.name, { fontFamily: FONT, fontSize: "8px", color: "#ffffff", backgroundColor: "#00000099", padding: { x: 3, y: 1 }, resolution: 3 }).setDepth(2).setAlpha(0.95));
    }
  }

  /** Portals always; spawn + interactable markers only in build mode. */
  drawMarkers() {
    this.markerGfx.clear();
    for (const t of this.markerLabels) t.destroy();
    this.markerLabels = [];
    for (const p of this.mapData.portals) {
      this.markerGfx.fillStyle(0xa855f7, 0.45).fillRect(p.x * TILE + 2, p.y * TILE + 2, TILE - 4, TILE - 4);
      this.markerGfx.lineStyle(2, 0xd8b4fe, 0.9).strokeRect(p.x * TILE + 2, p.y * TILE + 2, TILE - 4, TILE - 4);
      this.markerLabels.push(this.add.text(p.x * TILE + TILE / 2, p.y * TILE - 1, `→ ${p.label || "portal"}`, { fontFamily: FONT, fontSize: "7px", color: "#f5f3ff", backgroundColor: "#581c87cc", padding: { x: 2, y: 1 }, resolution: 3 }).setOrigin(0.5, 1).setDepth(2));
    }
    if (!this.build.active) return;
    const s = this.mapData.spawn;
    this.markerGfx.lineStyle(2, 0x22c55e, 1).strokeCircle(s.x * TILE + TILE / 2, s.y * TILE + TILE / 2, 10);
    this.markerLabels.push(this.add.text(s.x * TILE + TILE / 2, s.y * TILE - 1, "spawn", { fontFamily: FONT, fontSize: "7px", color: "#dcfce7", backgroundColor: "#14532dcc", padding: { x: 2, y: 1 }, resolution: 3 }).setOrigin(0.5, 1).setDepth(2));
    for (const it of this.mapData.interactables) {
      this.markerGfx.lineStyle(2, 0xfacc15, 0.9).strokeRect(it.x * TILE + 1, it.y * TILE + 1, TILE - 2, TILE - 2);
      this.markerLabels.push(this.add.text(it.x * TILE + TILE / 2, it.y * TILE + TILE - 1, it.kind, { fontFamily: FONT, fontSize: "6px", color: "#111827", backgroundColor: "#facc15", padding: { x: 2, y: 0 }, resolution: 3 }).setOrigin(0.5, 1).setDepth(2));
    }
  }

  drawGrid() {
    this.gridGfx.clear().lineStyle(1, 0xffffff, 0.15);
    for (let x = 0; x <= this.mapData.width; x++) this.gridGfx.lineBetween(x * TILE, 0, x * TILE, this.mapData.height * TILE);
    for (let y = 0; y <= this.mapData.height; y++) this.gridGfx.lineBetween(0, y * TILE, this.mapData.width * TILE, y * TILE);
  }

  drawPath() {
    this.pathGfx.clear();
    if (!this.autoPath) return;
    this.pathGfx.fillStyle(0xffffff, 0.5);
    for (const n of this.autoPath) this.pathGfx.fillCircle(n.x * TILE + TILE / 2, n.y * TILE + TILE / 2, 3);
  }

  walkTo(tx: number, ty: number, quiet = false) {
    const me = net.me;
    if (!me) return false;
    const path = findPath(this.mapData, me.x, me.y, tx, ty);
    if (!path) { if (!quiet) bus.emit("toast", "Não dá para chegar aí."); return false; }
    const last = path[path.length - 1];
    if (last && isSolid(this.mapData.floor[idx(this.mapData, last.x, last.y)], this.mapData.objects[idx(this.mapData, last.x, last.y)])) path.pop();
    this.autoPath = path.length ? path : null;
    this.autoPathLastProgress = this.time.now;
    this.drawPath();
    return true;
  }

  // ---------------------------------------------------------------- input
  uiHasFocus() {
    const el = document.activeElement as HTMLElement | null;
    return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
  }

  onKeyDown(e: KeyboardEvent) {
    if (this.uiHasFocus() || e.repeat || e.ctrlKey || e.metaKey) return;
    switch (e.key.toLowerCase()) {
      case "x": if (this.nearbyInteractable) bus.emit("interact", this.nearbyInteractable); break;
      case "enter": bus.emit("ui:focus-chat"); e.preventDefault(); break;
      case "escape": bus.emit("ui:escape"); break;
      case "b": if (net.canBuild) bus.emit("ui:toggle-build"); break;
      case "p": bus.emit("ui:toggle-participants"); break;
      case "e": bus.emit("ui:toggle-emotes"); break;
      case "m": bus.emit("ui:toggle-minimap"); break;
      case "g": net.ghost(!net.me?.ghost); break;
      case "?": case "h": bus.emit("ui:toggle-help"); break;
      case "+": case "=": this.setZoom(this.cameras.main.zoom + 0.25); break;
      case "-": this.setZoom(this.cameras.main.zoom - 0.25); break;
      default: { const n = Number(e.key); if (n >= 1 && n <= 9) bus.emit("ui:emote-index", n - 1); }
    }
  }

  pointerTile(p: Phaser.Input.Pointer) {
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    return { x: Math.floor(w.x / TILE), y: Math.floor(w.y / TILE) };
  }

  onPointerDown(p: Phaser.Input.Pointer) {
    const t = this.pointerTile(p);
    if (!inBounds(this.mapData, t.x, t.y)) return;
    if (this.build.active) {
      const tool = this.build.tool;
      if (tool === "tile" || tool === "erase") { this.paint(t, p.rightButtonDown() || tool === "erase"); return; }
      if (tool === "zone") { this.dragStart = t; return; }
      bus.emit("build:pick", { tool, x: t.x, y: t.y });
      return;
    }
    if (p.leftButtonDown()) {
      for (const [id, ps] of this.players) if (ps.tileX === t.x && ps.tileY === t.y && id !== net.sessionId) { bus.emit("ui:player-card", id); return; }
      this.followTarget = null; bus.emit("follow:changed", null);
      this.walkTo(t.x, t.y);
    }
  }

  onPointerMove(p: Phaser.Input.Pointer) {
    if (!this.build.active) return;
    const t = this.pointerTile(p);
    this.buildCursor.setPosition(t.x * TILE, t.y * TILE);
    bus.emit("build:hover", t);
    if (this.dragStart) {
      const x = Math.min(this.dragStart.x, t.x), y = Math.min(this.dragStart.y, t.y);
      const w = Math.abs(t.x - this.dragStart.x) + 1, h = Math.abs(t.y - this.dragStart.y) + 1;
      this.dragGfx.clear().fillStyle(0x3b82f6, 0.25).fillRect(x * TILE, y * TILE, w * TILE, h * TILE).lineStyle(2, 0x60a5fa, 1).strokeRect(x * TILE, y * TILE, w * TILE, h * TILE);
      return;
    }
    if (p.isDown && (this.build.tool === "tile" || this.build.tool === "erase") && inBounds(this.mapData, t.x, t.y)) this.paint(t, p.rightButtonDown() || this.build.tool === "erase");
  }

  onPointerUp(p: Phaser.Input.Pointer) {
    if (!this.dragStart) return;
    const t = this.pointerTile(p);
    const x = Math.max(0, Math.min(this.dragStart.x, t.x)), y = Math.max(0, Math.min(this.dragStart.y, t.y));
    const w = Math.abs(t.x - this.dragStart.x) + 1, h = Math.abs(t.y - this.dragStart.y) + 1;
    this.dragStart = null;
    this.dragGfx.clear();
    bus.emit("build:zone-rect", { x, y, w, h });
  }

  paint(t: { x: number; y: number }, erase: boolean) {
    const layer = this.build.layer;
    const tile = erase ? (layer === "objects" ? 0 : this.mapData.floor[idx(this.mapData, t.x, t.y)] === 4 ? 4 : 4) : this.build.tile;
    const i = idx(this.mapData, t.x, t.y);
    if (this.mapData[layer][i] === tile) return;
    net.build(layer, t.x, t.y, tile);
  }

  /** Client-side prediction: move the sprite now, the server confirms (or corrects) shortly after. */
  tryStep(dir: number, time: number) {
    if (time - this.lastSend < STEP_MS) return;
    const me = net.me!;
    this.lastSend = time;
    net.move(dir);
    const from = { x: this.me!.tileX, y: this.me!.tileY };
    const target = stepTarget(this.mapData, from.x, from.y, dir);
    if (!target) { this.me!.setFacing(dir); return; }
    if (!me.ghost) for (const [id, ps] of this.players) if (id !== net.sessionId && ps.view.connected && !ps.view.ghost && ps.tileX === target.x && ps.tileY === target.y) return;
    this.me!.view.dir = dir;
    this.me!.walkTile(target.x, target.y, dir);
  }

  update(time: number) {
    if (net.switching) return;
    const me = net.me;
    if (!me || !this.me) return;
    let dir = -1;
    if (!this.uiHasFocus() && !this.build.active) {
      const k = this.keys;
      if (k.up.isDown || k.w.isDown) dir = DIR.UP;
      else if (k.down.isDown || k.s.isDown) dir = DIR.DOWN;
      else if (k.left.isDown || k.a.isDown) dir = DIR.LEFT;
      else if (k.right.isDown || k.d.isDown) dir = DIR.RIGHT;
    }
    if (dir < 0 && this.virtualDir >= 0 && !this.build.active) dir = this.virtualDir;
    if (dir >= 0) {
      if (this.autoPath) { this.autoPath = null; this.pathGfx.clear(); }
      if (this.followTarget) { this.followTarget = null; bus.emit("follow:changed", null); }
      this.tryStep(dir, time);
    }
    if (this.followTarget && time - this.followTick > 300) {
      this.followTick = time;
      const t = this.players.get(this.followTarget);
      if (t) {
        const d = Math.abs(t.tileX - me.x) + Math.abs(t.tileY - me.y);
        if (d > 1) { const path = findPath(this.mapData, me.x, me.y, t.tileX, t.tileY); if (path) { path.pop(); this.autoPath = path.length ? path : null; this.autoPathLastProgress = time; this.drawPath(); } }
      }
    }
    if (this.autoPath && time - this.lastSend >= STEP_MS) {
      const next = this.autoPath[0];
      const dx = next.x - this.me.tileX, dy = next.y - this.me.tileY;
      const d = dx === 1 ? DIR.RIGHT : dx === -1 ? DIR.LEFT : dy === 1 ? DIR.DOWN : dy === -1 ? DIR.UP : -1;
      if (d < 0 || time - this.autoPathLastProgress > 1500) { this.autoPath = null; this.pathGfx.clear(); }
      else this.tryStep(d, time);
    }
    if (this.locateTarget && time - this.hearingTick > 150) {
      const target = this.players.get(this.locateTarget);
      if (target) {
        const path = findPath(this.mapData, me.x, me.y, target.tileX, target.tileY);
        this.locateGfx.clear();
        if (path) {
          this.locateGfx.lineStyle(3, 0xfacc15, 0.9).beginPath().moveTo(this.me.x, this.me.y + 8);
          for (const n of path) this.locateGfx.lineTo(n.x * TILE + TILE / 2, n.y * TILE + TILE / 2);
          this.locateGfx.strokePath();
        }
        if (path && path.length <= 1) { this.locateTarget = null; this.locateGfx.clear(); bus.emit("ui:locate-done"); }
      }
    }
    if (time - this.hearingTick > 150) { this.hearingTick = time; this.updateHearing(); }
  }
}

const zv = (z: ZoneView): Zone => ({ id: z.id, name: z.name, x: z.x, y: z.y, w: z.w, h: z.h, color: z.color });
const iv = (i: InteractableView): Interactable => { let options: string[] = []; try { options = JSON.parse(i.options || "[]"); } catch {} return { id: i.id, x: i.x, y: i.y, kind: i.kind as any, title: i.title, url: i.url || undefined, text: i.text || undefined, emote: i.emote || undefined, options }; };
const pv = (p: PortalView): Portal => ({ id: p.id, x: p.x, y: p.y, targetMapId: p.targetMapId, targetX: p.targetX, targetY: p.targetY, label: p.label });
