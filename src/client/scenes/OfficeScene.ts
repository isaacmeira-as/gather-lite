import Phaser from "phaser";
import { net, PlayerView, ZoneView, InteractableView, PortalView } from "../net";
import { bus } from "../bus";
import { TILE, DIR, isSolid, O, F, TALL_OBJECTS } from "../../shared/tiles";
import { MapData, Interactable, Zone, Portal, canHear, findPath, interactableNear, zoneAt, isSpotlight, inBounds, idx, stepTarget, isWalkable } from "../../shared/map";
import { drawTileset, V, TILESET_COLS, TILESET_ROWS } from "../textures/tiles";
import { drawAvatarSheet, AV_W, AV_H, AV_FRAMES_PER_DIR } from "../textures/avatars";
import { normalizeAvatar, avatarKey } from "../../shared/avatar";
import { ensureFxTextures, Lighting, Weather, WeatherView, darknessFor, poof, dust, reactionFx } from "./fx";
import { drawPetSheet, PET_W, PET_H } from "../textures/pets";
import { sfx } from "../ui/notify";

const STEP_MS = 130;
const BUBBLE_MS = 5000;
/** Automation (Playwright) runs on a software GPU: skip the expensive effects unless ?fx=1 is given. */
export const LOW_FX = typeof navigator !== "undefined" && (navigator as any).webdriver && !new URLSearchParams(location.search).has("fx");
const STATUS_COLORS: Record<string, number> = { available: 0x22c55e, busy: 0xf59e0b, dnd: 0xef4444 };
const FONT = "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif";
const NEAREST = Phaser.Textures.FilterMode.NEAREST;
const VARIANTS: Record<number, number[]> = { [F.GRASS]: [F.GRASS, F.GRASS, V.GRASS_B, V.GRASS_C], [F.WOOD]: [F.WOOD, F.WOOD, V.WOOD_B], [F.STONE]: [F.STONE, V.STONE_B], [F.CARPET_BLUE]: [F.CARPET_BLUE, V.CARPET_BLUE_B], [F.PATH]: [F.PATH, V.PATH_B] };
const hash2 = (x: number, y: number) => ((x * 73856093) ^ (y * 19349663)) >>> 0;
const ANIMATED: Record<number, number> = { [F.WATER]: V.WATER_B, [O.FOUNTAIN]: V.FOUNTAIN_B, [O.COMPUTER]: V.COMPUTER_B, [O.ARCADE]: V.ARCADE_B, [O.SPOTLIGHT]: V.SPOTLIGHT_B };

export type BuildTool = "tile" | "erase" | "zone" | "interactable" | "portal" | "spawn";

class PlayerSprite extends Phaser.GameObjects.Container {
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  nameText: Phaser.GameObjects.Text;
  roleText: Phaser.GameObjects.Text;
  statusDot: Phaser.GameObjects.Arc;
  emoteText: Phaser.GameObjects.Text;
  bubble: Phaser.GameObjects.Container;
  bubbleText: Phaser.GameObjects.Text;
  bubbleBg: Phaser.GameObjects.Graphics;
  bubbleTimer?: Phaser.Time.TimerEvent;
  tween?: Phaser.Tweens.Tween;
  breathe?: Phaser.Tweens.Tween;
  pet: Phaser.GameObjects.Image | null = null;
  petFrame = 0;
  texKey: string;
  view: PlayerView;
  tileX: number;
  tileY: number;
  prevTileX: number;
  prevTileY: number;

  constructor(scene: OfficeScene, view: PlayerView) {
    super(scene, view.x * TILE + TILE / 2, view.y * TILE + TILE / 2);
    this.view = view;
    this.tileX = view.x;
    this.tileY = view.y;
    this.prevTileX = view.x;
    this.prevTileY = view.y;
    this.texKey = scene.ensureAvatarTexture(view.avatar);
    this.shadow = scene.add.ellipse(0, 11, 20, 8, 0x000000, 0.28);
    this.sprite = scene.add.sprite(0, 12, this.texKey, `0-0`).setOrigin(0.5, 1);
    this.nameText = scene.add.text(0, -32, view.name, { fontFamily: FONT, fontSize: "10px", fontStyle: "600", color: "#ffffff", stroke: "#0b1220", strokeThickness: 3, resolution: 4 }).setOrigin(0.5, 1);
    this.roleText = scene.add.text(0, -32, "", { fontFamily: FONT, fontSize: "8px", color: "#facc15", stroke: "#0b1220", strokeThickness: 2, resolution: 4 }).setOrigin(0, 1);
    this.statusDot = scene.add.circle(0, -36, 2.5, 0x22c55e).setStrokeStyle(1, 0x0b1220, 0.8);
    this.emoteText = scene.add.text(0, -40, "", { fontSize: "16px", resolution: 4 }).setOrigin(0.5, 1).setVisible(false);
    this.bubbleBg = scene.add.graphics();
    this.bubbleText = scene.add.text(0, 0, "", { fontFamily: FONT, fontSize: "9px", fontStyle: "500", color: "#111827", wordWrap: { width: 110 }, resolution: 4, align: "center" }).setOrigin(0.5, 1);
    this.bubble = scene.add.container(0, -50, [this.bubbleBg, this.bubbleText]).setVisible(false);
    this.add([this.shadow, this.sprite, this.nameText, this.roleText, this.statusDot, this.emoteText, this.bubble]);
    this.layoutName();
    scene.add.existing(this);
    this.setDepth(this.y);
    this.startBreathing();
    this.setupPet();
  }

  setupPet() {
    let cfg: any = {}; try { cfg = JSON.parse(this.view.avatar); } catch {}
    const pet = Number(cfg.pet) || 0;
    this.pet?.destroy(); this.pet = null;
    if (!pet) return;
    const scene = this.scene as OfficeScene;
    const key = `pet-${pet}`;
    if (!scene.textures.exists(key)) { const tex = scene.textures.addCanvas(key, drawPetSheet(document.createElement("canvas"), pet))!; tex.setFilter(NEAREST); tex.add("0", 0, 0, 0, PET_W, PET_H); tex.add("1", 0, PET_W, 0, PET_W, PET_H); }
    this.pet = scene.add.image(this.x - 14, this.y + 6, key, "0").setDepth(this.y - 1);
  }

  updatePet() {
    if (!this.pet) return;
    const tx = this.prevTileX * TILE + TILE / 2 + (this.prevTileX === this.tileX && this.prevTileY === this.tileY ? -14 : 0);
    const ty = this.prevTileY * TILE + TILE / 2 + 6;
    const dx = tx - this.pet.x, dy = ty - this.pet.y;
    if (Math.abs(dx) + Math.abs(dy) > 1) { this.pet.x += dx * 0.15; this.pet.y += dy * 0.15; this.pet.setFlipX(dx < 0); if (Math.floor(this.scene.time.now / 160) % 2 !== this.petFrame) { this.petFrame ^= 1; this.pet.setFrame(String(this.petFrame)); } }
    this.pet.setDepth(this.pet.y + 4);
  }

  destroy(fromScene?: boolean) { this.pet?.destroy(); super.destroy(fromScene); }

  startBreathing() {
    this.breathe?.stop();
    this.breathe = this.scene.tweens.add({ targets: this.sprite, scaleY: 1.025, scaleX: 0.985, duration: 1400, yoyo: true, repeat: -1, ease: "Sine.InOut" });
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

  setTexture(key: string) { this.texKey = key; this.sprite.setTexture(key, `${this.view.dir}-0`); this.setupPet(); }

  setFacing(dir: number) {
    if (!this.sprite?.anims) return;
    if (this.view.sitting) this.sprite.setFrame("sit-0"); // sitting always faces the camera
    else if (!this.sprite.anims.isPlaying) this.sprite.setFrame(`${dir}-0`);
  }

  walkTile(x: number, y: number, dir: number) {
    const scene = this.scene as OfficeScene;
    const tx = x * TILE + TILE / 2, ty = y * TILE + TILE / 2;
    if (x !== this.tileX || y !== this.tileY) { this.prevTileX = this.tileX; this.prevTileY = this.tileY; }
    this.tileX = x; this.tileY = y;
    this.tween?.stop();
    const far = Math.abs(tx - this.x) > TILE * 2 || Math.abs(ty - this.y) > TILE * 2;
    if (far) { this.setPosition(tx, ty); this.setDepth(ty); this.setFacing(dir); return; }
    if (!this.view.sitting) this.sprite.play(`${this.texKey}-walk-${dir}`, true);
    this.tween = scene.tweens.add({
      targets: this, x: tx, y: ty, duration: STEP_MS, ease: "Linear",
      onUpdate: () => this.setDepth(this.y),
      onComplete: () => {
        this.setDepth(ty);
        scene.time.delayedCall(40, () => { if (!this.scene || !this.sprite?.anims) return; if (!this.tween || !this.tween.isPlaying()) { this.sprite.stop(); this.setFacing(this.view.dir); } });
      },
    });
  }

  showBubble(text: string) {
    this.bubbleText.setText(text.length > 90 ? text.slice(0, 90) + "…" : text);
    const w = this.bubbleText.width + 12, h = this.bubbleText.height + 10;
    this.bubbleBg.clear();
    this.bubbleBg.fillStyle(0x0b1220, 0.25).fillRoundedRect(-w / 2 + 1, -h + 2, w, h, 6);
    this.bubbleBg.fillStyle(0xffffff, 0.97).fillRoundedRect(-w / 2, -h, w, h, 6);
    this.bubbleBg.fillTriangle(-4, 0, 4, 0, 0, 5);
    this.bubbleText.setPosition(0, -5);
    this.bubble.setVisible(true).setScale(0.6).setAlpha(0);
    this.scene.tweens.add({ targets: this.bubble, scale: 1, alpha: 1, duration: 180, ease: "Back.Out" });
    this.bubbleTimer?.remove();
    this.bubbleTimer = this.scene.time.delayedCall(BUBBLE_MS, () => this.scene?.tweens.add({ targets: this.bubble, alpha: 0, duration: 200, onComplete: () => this.bubble.setVisible(false) }));
  }

  showEmote(emote: string) {
    if (!emote) { this.scene?.tweens.add({ targets: this.emoteText, alpha: 0, y: -56, duration: 250, onComplete: () => this.emoteText.setVisible(false) }); return; }
    this.emoteText.setText(emote).setVisible(true).setAlpha(0).setY(-34).setScale(0.5);
    this.scene.tweens.add({ targets: this.emoteText, alpha: 1, y: -48, scale: 1.1, duration: 280, ease: "Back.Out", onComplete: () => this.scene?.tweens.add({ targets: this.emoteText, scale: 1, y: -46, duration: 900, yoyo: true, repeat: 1, ease: "Sine.InOut" }) });
  }
}

export class OfficeScene extends Phaser.Scene {
  mapData!: MapData;
  floorLayer!: Phaser.Tilemaps.TilemapLayer;
  objectLayer!: Phaser.Tilemaps.TilemapLayer;
  tilemap!: Phaser.Tilemaps.Tilemap;
  tall = new Map<number, Phaser.GameObjects.Image>();
  animTiles: { x: number; y: number; layer: "floor" | "objects"; a: number; b: number }[] = [];
  animFrame = 0;
  zoneGfx!: Phaser.GameObjects.Graphics;
  zoneLabels: Phaser.GameObjects.GameObject[] = [];
  markerGfx!: Phaser.GameObjects.Graphics;
  markerLabels: Phaser.GameObjects.GameObject[] = [];
  portalGlows: Phaser.GameObjects.Image[] = [];
  players = new Map<string, PlayerSprite>();
  me: PlayerSprite | null = null;
  keys!: Record<string, Phaser.Input.Keyboard.Key>;
  lastSend = 0;
  virtualDir = -1;
  autoPath: { x: number; y: number }[] | null = null;
  autoPathLastProgress = 0;
  locateTarget: string | null = null;
  followTarget: string | null = null;
  followTick = 0;
  locateGfx!: Phaser.GameObjects.Graphics;
  pathGfx!: Phaser.GameObjects.Graphics;
  build: { active: boolean; tool: BuildTool; layer: "floor" | "objects"; tile: number; brush: number } = { active: false, tool: "tile", layer: "objects", tile: O.WALL, brush: 1 };
  undoStack: { layer: "floor" | "objects"; x: number; y: number; prev: number }[] = [];
  buildCursor!: Phaser.GameObjects.Rectangle;
  gridGfx!: Phaser.GameObjects.Graphics;
  dragStart: { x: number; y: number } | null = null;
  dragGfx!: Phaser.GameObjects.Graphics;
  prompt!: Phaser.GameObjects.Container;
  promptBg!: Phaser.GameObjects.Graphics;
  promptKey!: Phaser.GameObjects.Text;
  promptText!: Phaser.GameObjects.Text;
  promptTween?: Phaser.Tweens.Tween;
  nearbyInteractable: Interactable | null = null;
  nearbyIds = new Set<string>();
  hearingTick = 0;
  pending: { x: number; y: number; at: number } | null = null; // predicted step awaiting server confirmation
  unsubs: (() => void)[] = [];
  lighting!: Lighting;
  weather!: Weather;
  weatherInfo: WeatherView | null = null;
  lightTick = 0;
  private busBound = false;

  constructor() { super("office"); }

  create() {
    const state = net.state;
    this.players.clear();
    this.me = null; this.tall.clear(); this.animTiles = []; this.undoStack = [];
    this.autoPath = null; this.locateTarget = null; this.followTarget = null; this.nearbyInteractable = null; this.nearbyIds = new Set();
    this.mapData = {
      width: state.width, height: state.height,
      floor: Array.from(state.floor), objects: Array.from(state.objects),
      zones: [...state.zones.values()].map(zv), interactables: [...state.interactables.values()].map(iv), portals: [...state.portals.values()].map(pv),
      spawn: { x: state.spawnX, y: state.spawnY },
    };

    if (!this.textures.exists("tiles")) {
      const tex = this.textures.addCanvas("tiles", drawTileset(document.createElement("canvas")))!;
      tex.setFilter(NEAREST);
      // Named frames so single tiles can also be drawn as Images (tall objects, wall faces).
      for (let id = 0; id < TILESET_COLS * TILESET_ROWS; id++) tex.add(String(id), 0, (id % TILESET_COLS) * TILE, Math.floor(id / TILESET_COLS) * TILE, TILE, TILE);
    }
    ensureFxTextures(this);
    this.tilemap = this.make.tilemap({ tileWidth: TILE, tileHeight: TILE, width: this.mapData.width, height: this.mapData.height });
    const tileset = this.tilemap.addTilesetImage("tiles", "tiles", TILE, TILE, 0, 0, 0)!;
    this.floorLayer = this.tilemap.createBlankLayer("floor", tileset)!;
    this.objectLayer = this.tilemap.createBlankLayer("objects", tileset)!.setDepth(1);
    for (let y = 0; y < this.mapData.height; y++) for (let x = 0; x < this.mapData.width; x++) this.renderTile(x, y);
    this.zoneGfx = this.add.graphics().setDepth(0.5);
    this.markerGfx = this.add.graphics().setDepth(0.9);
    this.pathGfx = this.add.graphics().setDepth(0.6);
    this.locateGfx = this.add.graphics().setDepth(0.7);
    this.gridGfx = this.add.graphics().setDepth(0.8).setVisible(false);
    this.dragGfx = this.add.graphics().setDepth(4999);
    this.buildCursor = this.add.rectangle(0, 0, TILE, TILE).setStrokeStyle(2, 0xfacc15).setOrigin(0).setDepth(5000).setVisible(false);
    // Interaction prompt: dark pill with a white "X" keycap and the object's name.
    this.promptBg = this.add.graphics();
    this.promptKey = this.add.text(0, 0, "X", { fontFamily: FONT, fontSize: "8px", fontStyle: "700", color: "#0b1220", resolution: 4 }).setOrigin(0.5);
    this.promptText = this.add.text(0, 0, "", { fontFamily: FONT, fontSize: "8px", fontStyle: "600", color: "#ffffff", resolution: 4 }).setOrigin(0, 0.5);
    this.prompt = this.add.container(0, 0, [this.promptBg, this.promptKey, this.promptText]).setDepth(6000).setVisible(false);
    this.drawZones();
    this.drawMarkers();
    this.lighting = new Lighting(this, this.mapData);
    this.weather = new Weather(this, this.mapData);
    this.applyWeather(state.weather);
    this.time.addEvent({ delay: 550, loop: true, callback: () => this.tickAnimatedTiles() });
    this.time.addEvent({ delay: 1000, loop: true, callback: () => bus.emit("clock", this.weatherInfo) });

    this.cameras.main.setBounds(0, 0, this.mapData.width * TILE, this.mapData.height * TILE);
    this.cameras.main.setZoom(this.registry.get("zoom") ?? (window.innerWidth < 700 ? 1.5 : 2));
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.fadeIn(350, 11, 18, 32);

    const $ = net.$;
    this.unsubs.forEach((u) => u()); this.unsubs = [];
    this.unsubs.push($(state).players.onAdd((p, key) => this.addPlayer(p, key)));
    this.unsubs.push($(state).players.onRemove((_p, key) => this.removePlayer(key)));
    this.unsubs.push($(state).floor.onChange((v, i) => this.setTile("floor", i, v)));
    this.unsubs.push($(state).objects.onChange((v, i) => this.setTile("objects", i, v)));
    this.unsubs.push($(state).listen("weather", (w: string) => this.applyWeather(w)));
    this.unsubs.push($(state).listen("timeMode", () => this.lightTick = 0));
    const bindCollection = (coll: any, list: () => any[], set: (l: any[]) => void, conv: (v: any) => any, after: () => void) => {
      this.unsubs.push(coll.onAdd((item: any, key: string) => {
        set(list().filter((z) => z.id !== key).concat(conv(item))); after();
        this.unsubs.push($(item).onChange(() => { set(list().filter((z) => z.id !== key).concat(conv(item))); after(); }));
      }));
      this.unsubs.push(coll.onRemove((_item: any, key: string) => { set(list().filter((z) => z.id !== key)); after(); }));
    };
    bindCollection($(state).zones, () => this.mapData.zones, (l) => (this.mapData.zones = l), zv, () => { this.drawZones(); bus.emit("map:changed"); });
    bindCollection($(state).interactables, () => this.mapData.interactables, (l) => (this.mapData.interactables = l), iv, () => { this.drawMarkers(); this.onMeMoved(); bus.emit("map:changed"); });
    bindCollection($(state).portals, () => this.mapData.portals, (l) => (this.mapData.portals = l), pv, () => { this.drawMarkers(); bus.emit("map:changed"); });
    this.unsubs.push($(state).listen("spawnX", (v: number) => { this.mapData.spawn.x = v; this.drawMarkers(); }));
    this.unsubs.push($(state).listen("spawnY", (v: number) => { this.mapData.spawn.y = v; this.drawMarkers(); }));

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
    bus.on("ui:undo", () => this.undo());
    bus.on("ui:goto", (t: { x: number; y: number }) => this.walkTo(t.x, t.y));
    bus.on("ui:zoom", (delta: number) => this.setZoom(this.cameras.main.zoom + delta));
    bus.on("joystick", (dir: number) => { this.virtualDir = dir; });
    bus.on("zone", (z: { id: string }) => { if (z.id) this.cameras.main.flash(180, 255, 255, 255, true); });
    bus.on("reaction", (m: { id: string; x: number; y: number }) => reactionFx(this, m.id, m.x * TILE + TILE / 2, m.y * TILE + TILE / 2));
    bus.on("map:leaving", () => this.cameras.main.fadeOut(220, 11, 18, 32));
  }

  setZoom(z: number) { const v = Phaser.Math.Clamp(z, 0.75, 4); this.cameras.main.setZoom(v); this.registry.set("zoom", v); }

  // ------------------------------------------------------------ rendering
  /** Decides how a map tile looks: wall faces, tall objects as sprites, animated frames. */
  renderTile(x: number, y: number) {
    const i = idx(this.mapData, x, y);
    const f = this.mapData.floor[i], o = this.mapData.objects[i];
    const variants = VARIANTS[f];
    this.floorLayer.putTileAt(variants ? variants[hash2(x, y) % variants.length] : f, x, y);
    this.animTiles = this.animTiles.filter((t) => !(t.x === x && t.y === y));
    if (ANIMATED[f] && f === F.WATER) this.animTiles.push({ x, y, layer: "floor", a: f, b: ANIMATED[f] });
    const old = this.tall.get(i);
    if (old) { old.destroy(); this.tall.delete(i); }
    this.objectLayer.removeTileAt(x, y);
    if (!o) return;
    let visual = o;
    if (o === O.WALL) {
      const below = y + 1 < this.mapData.height ? this.mapData.objects[idx(this.mapData, x, y + 1)] : O.WALL;
      const belowSolidWall = below === O.WALL || below === O.WINDOW || below === O.WHITEBOARD || below === O.TV || below === O.PAINTING || below === O.SIGN;
      visual = belowSolidWall ? O.WALL : V.WALL_FACE;
    }
    if (TALL_OBJECTS.has(o) || visual === V.WALL_FACE) {
      const img = this.add.image(x * TILE, y * TILE, "tiles", String(visual)).setOrigin(0).setDepth(y * TILE + TILE - 1);
      this.tall.set(i, img);
      if (visual === V.WALL_FACE || o === O.WINDOW || o === O.BOOKSHELF || o === O.LOCKER || o === O.FRIDGE || o === O.VENDING) this.wallShadow(x, y);
    } else {
      this.objectLayer.putTileAt(visual, x, y);
      if (ANIMATED[o]) this.animTiles.push({ x, y, layer: "objects", a: o, b: ANIMATED[o] });
    }
    // Wall above a face needs re-evaluation when the tile below changes.
  }

  shadowGfx: Phaser.GameObjects.Graphics | null = null;
  shadowCells = new Set<number>();
  /** Soft ambient-occlusion strip under wall faces and tall furniture. */
  wallShadow(x: number, y: number) {
    this.shadowGfx ??= this.add.graphics().setDepth(0.45);
    const i = idx(this.mapData, x, y);
    if (this.shadowCells.has(i)) return;
    this.shadowCells.add(i);
    this.shadowGfx.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.28, 0.28, 0, 0);
    this.shadowGfx.fillRect(x * TILE, (y + 1) * TILE, TILE, 9);
  }

  tickAnimatedTiles() {
    this.animFrame ^= 1;
    for (const t of this.animTiles) {
      const id = this.animFrame ? t.b : t.a;
      if (t.layer === "floor") this.floorLayer.putTileAt(id, t.x, t.y); else this.objectLayer.putTileAt(id, t.x, t.y);
    }
    for (const g of this.portalGlows) g.setAlpha(this.animFrame ? 0.55 : 0.35);
  }

  setTile(layer: "floor" | "objects", i: number, v: number) {
    if (typeof v !== "number" || !this.floorLayer?.layer) return;
    const x = i % this.mapData.width, y = Math.floor(i / this.mapData.width);
    this.mapData[layer][i] = v;
    this.renderTile(x, y);
    if (y > 0) this.renderTile(x, y - 1); // wall above may switch between top/face
    this.lighting?.collectStatic();
    this.weather?.collectOutdoor();
    bus.emit("map:changed");
  }

  applyWeather(json: string) {
    try { this.weatherInfo = json ? JSON.parse(json) : null; } catch { this.weatherInfo = null; }
    if (!LOW_FX) this.weather.set(this.weatherInfo?.kind ?? "");
    this.lightTick = 0;
    bus.emit("weather", this.weatherInfo);
  }

  drawZones() {
    this.zoneGfx.clear();
    for (const t of this.zoneLabels) t.destroy();
    this.zoneLabels = [];
    for (const z of this.mapData.zones) {
      const c = Phaser.Display.Color.HexStringToColor(z.color).color;
      this.zoneGfx.fillStyle(c, 0.12).fillRect(z.x * TILE, z.y * TILE, z.w * TILE, z.h * TILE);
      this.zoneGfx.lineStyle(2, c, 0.55).strokeRect(z.x * TILE + 1, z.y * TILE + 1, z.w * TILE - 2, z.h * TILE - 2);
      this.zoneLabels.push(this.add.text(z.x * TILE + 3, z.y * TILE + 3, z.name, { fontFamily: FONT, fontSize: "8px", fontStyle: "600", color: "#ffffff", backgroundColor: "#0b1220aa", padding: { x: 4, y: 2 }, resolution: 4 }).setDepth(8000).setAlpha(0.95));
    }
  }

  drawMarkers() {
    this.markerGfx.clear();
    for (const t of this.markerLabels) t.destroy();
    this.markerLabels = [];
    for (const g of this.portalGlows) g.destroy();
    this.portalGlows = [];
    for (const p of this.mapData.portals) {
      this.markerGfx.fillStyle(0xa855f7, 0.35).fillRect(p.x * TILE + 2, p.y * TILE + 2, TILE - 4, TILE - 4);
      this.markerGfx.lineStyle(2, 0xd8b4fe, 0.9).strokeRect(p.x * TILE + 2, p.y * TILE + 2, TILE - 4, TILE - 4);
      const glow = this.add.image(p.x * TILE + TILE / 2, p.y * TILE + TILE / 2, "fx-light").setDisplaySize(64, 64).setTint(0xc084fc).setAlpha(0.4).setDepth(0.95).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: glow, scale: glow.scale * 1.25, duration: 1200, yoyo: true, repeat: -1, ease: "Sine.InOut" });
      this.portalGlows.push(glow);
      this.markerLabels.push(this.add.text(p.x * TILE + TILE / 2, p.y * TILE - 1, `→ ${p.label || "portal"}`, { fontFamily: FONT, fontSize: "7px", color: "#f5f3ff", backgroundColor: "#581c87cc", padding: { x: 3, y: 1 }, resolution: 4 }).setOrigin(0.5, 1).setDepth(2));
    }
    if (!this.build.active) return;
    const s = this.mapData.spawn;
    this.markerGfx.lineStyle(2, 0x22c55e, 1).strokeCircle(s.x * TILE + TILE / 2, s.y * TILE + TILE / 2, 10);
    this.markerLabels.push(this.add.text(s.x * TILE + TILE / 2, s.y * TILE - 1, "spawn", { fontFamily: FONT, fontSize: "7px", color: "#dcfce7", backgroundColor: "#14532dcc", padding: { x: 2, y: 1 }, resolution: 4 }).setOrigin(0.5, 1).setDepth(2));
    for (const it of this.mapData.interactables) {
      this.markerGfx.lineStyle(2, 0xfacc15, 0.9).strokeRect(it.x * TILE + 1, it.y * TILE + 1, TILE - 2, TILE - 2);
      this.markerLabels.push(this.add.text(it.x * TILE + TILE / 2, it.y * TILE + TILE - 1, it.kind, { fontFamily: FONT, fontSize: "6px", color: "#111827", backgroundColor: "#facc15", padding: { x: 2, y: 0 }, resolution: 4 }).setOrigin(0.5, 1).setDepth(2));
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

  // ---------------------------------------------------------------- players
  ensureAvatarTexture(avatarJson: string) {
    let cfg; try { cfg = normalizeAvatar(JSON.parse(avatarJson)); } catch { cfg = normalizeAvatar({}); }
    const key = `av-${avatarKey(cfg)}`;
    if (this.textures.exists(key)) return key;
    const tex = this.textures.addCanvas(key, drawAvatarSheet(document.createElement("canvas"), cfg))!;
    tex.setFilter(NEAREST);
    for (let dir = 0; dir < 4; dir++) {
      for (let f = 0; f < AV_FRAMES_PER_DIR; f++) tex.add(`${dir}-${f}`, 0, f * AV_W, dir * AV_H, AV_W, AV_H);
      this.anims.create({ key: `${key}-walk-${dir}`, frames: [{ key, frame: `${dir}-1` }, { key, frame: `${dir}-2` }, { key, frame: `${dir}-3` }, { key, frame: `${dir}-0` }], frameRate: 11, repeat: -1 });
    }
    for (let dir = 0; dir < 3; dir++) tex.add(`sit-${dir}`, 0, dir * AV_W, 4 * AV_H, AV_W, AV_H);
    return key;
  }

  addPlayer(p: PlayerView, key: string) {
    if (this.players.has(key)) this.removePlayer(key);
    const ps = new PlayerSprite(this, p);
    this.players.set(key, ps);
    ps.setFacing(p.dir);
    ps.setAlpha(p.connected ? 1 : 0.4);
    if (Date.now() - p.joinedAt < 3000) { poof(this, ps.x, ps.y, 0xbfdbfe); ps.setScale(0.2); this.tweens.add({ targets: ps, scale: 1, duration: 320, ease: "Back.Out" }); }
    const $ = net.$;
    const isMe = key === net.sessionId;
    const onPos = () => {
      if (isMe) {
        if (this.pending && this.pending.x === p.x && this.pending.y === p.y) this.pending = null;
        if (ps.tileX === p.x && ps.tileY === p.y) return;
      }
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
      this.cameras.main.startFollow(ps, true, 0.12, 0.12);
      this.unsubs.push($(p).listen("x", () => this.onMeMoved()), $(p).listen("y", () => this.onMeMoved()));
      this.onMeMoved();
    }
    bus.emit("players");
  }

  removePlayer(key: string) {
    if (net.switching) return;
    const ps = this.players.get(key);
    if (!ps) return;
    poof(this, ps.x, ps.y, 0x94a3b8);
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
    if (it) this.showPrompt(it); else { this.prompt.setVisible(false); this.promptTween?.stop(); }
    if (this.autoPath && this.autoPath.length && this.autoPath[0].x === me.x && this.autoPath[0].y === me.y) {
      this.autoPath.shift();
      this.autoPathLastProgress = this.time.now;
      if (!this.autoPath.length) { this.autoPath = null; this.pathGfx.clear(); } else this.drawPath();
    }
    this.updateHearing(true);
    bus.emit("me:moved", { x: me.x, y: me.y, spotlight: isSpotlight(this.mapData, me.x, me.y), zone: zoneAt(this.mapData, me.x, me.y) });
  }

  showPrompt(it: Interactable) {
    const label = it.title.length > 18 ? it.title.slice(0, 17) + "…" : it.title;
    this.promptText.setText(label);
    const keyW = 12, pad = 4, gap = 4;
    const w = pad + keyW + gap + this.promptText.width + pad, h = 16;
    this.promptBg.clear();
    this.promptBg.fillStyle(0x000000, 0.25).fillRoundedRect(-w / 2 + 1, -h / 2 + 2, w, h, 5);
    this.promptBg.fillStyle(0x0b1220, 0.92).fillRoundedRect(-w / 2, -h / 2, w, h, 5);
    this.promptBg.lineStyle(1, 0xffffff, 0.12).strokeRoundedRect(-w / 2, -h / 2, w, h, 5);
    this.promptBg.fillStyle(0xffffff, 1).fillRoundedRect(-w / 2 + pad, -5, keyW, 10, 2);
    this.promptBg.fillStyle(0xcbd5e1, 1).fillRect(-w / 2 + pad, 4, keyW, 1);
    this.promptKey.setPosition(-w / 2 + pad + keyW / 2, 0);
    this.promptText.setPosition(-w / 2 + pad + keyW + gap, 0);
    this.promptBg.fillStyle(0x0b1220, 0.92).fillTriangle(-3, h / 2, 3, h / 2, 0, h / 2 + 4);
    const baseY = it.y * TILE - 10;
    this.prompt.setPosition(it.x * TILE + TILE / 2, baseY).setVisible(true).setAlpha(0);
    this.promptTween?.stop();
    this.tweens.add({ targets: this.prompt, alpha: 1, duration: 150 });
    this.promptTween = this.tweens.add({ targets: this.prompt, y: baseY - 3, duration: 700, yoyo: true, repeat: -1, ease: "Sine.InOut" });
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
      if (Math.abs(ps.alpha - target) > 0.01) this.tweens.add({ targets: ps, alpha: target, duration: 250 });
    }
    let changed = force || ids.size !== this.nearbyIds.size;
    if (!changed) for (const id of ids) if (!this.nearbyIds.has(id)) { changed = true; break; }
    if (changed) { const arrived = [...ids].filter((id) => !this.nearbyIds.has(id)); this.nearbyIds = ids; bus.emit("nearby", [...ids], arrived); }
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
    if (this.uiHasFocus() || e.repeat) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { if (this.build.active) { e.preventDefault(); this.undo(); } return; }
    if (e.ctrlKey || e.metaKey) return;
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
      const ring = this.add.circle(t.x * TILE + TILE / 2, t.y * TILE + TILE / 2, 6).setStrokeStyle(2, 0xffffff, 0.9).setDepth(3);
      this.tweens.add({ targets: ring, scale: 2.2, alpha: 0, duration: 400, onComplete: () => ring.destroy() });
      this.walkTo(t.x, t.y);
    }
  }

  onPointerMove(p: Phaser.Input.Pointer) {
    if (!this.build.active) return;
    const t = this.pointerTile(p);
    const b = this.build.brush;
    this.buildCursor.setPosition((t.x - Math.floor((b - 1) / 2)) * TILE, (t.y - Math.floor((b - 1) / 2)) * TILE).setSize(TILE * b, TILE * b);
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
    const b = this.build.brush;
    const off = Math.floor((b - 1) / 2);
    for (let dy = 0; dy < b; dy++) for (let dx = 0; dx < b; dx++) {
      const x = t.x - off + dx, y = t.y - off + dy;
      if (!inBounds(this.mapData, x, y)) continue;
      const tile = erase ? (layer === "objects" ? 0 : F.GRASS) : this.build.tile;
      const i = idx(this.mapData, x, y);
      if (this.mapData[layer][i] === tile) continue;
      this.undoStack.push({ layer, x, y, prev: this.mapData[layer][i] });
      if (this.undoStack.length > 500) this.undoStack.shift();
      net.build(layer, x, y, tile);
    }
  }

  undo() {
    const u = this.undoStack.pop();
    if (!u) { bus.emit("toast", "Nada para desfazer"); return; }
    net.build(u.layer, u.x, u.y, u.prev);
  }

  tryStep(dir: number, time: number) {
    if (time - this.lastSend < STEP_MS) return;
    const me = net.me!;
    this.lastSend = time;
    net.move(dir);
    const from = { x: this.me!.tileX, y: this.me!.tileY };
    const target = stepTarget(this.mapData, from.x, from.y, dir);
    if (!target) { this.me!.view.dir = dir; this.me!.setFacing(dir); return; }
    if (!me.ghost) for (const [id, ps] of this.players) if (id !== net.sessionId && ps.view.connected && !ps.view.ghost && ps.tileX === target.x && ps.tileY === target.y) return;
    this.me!.view.dir = dir;
    this.me!.walkTile(target.x, target.y, dir);
    this.pending = { x: target.x, y: target.y, at: time };
    const f = this.mapData.floor[idx(this.mapData, target.x, target.y)];
    if (f === F.GRASS || f === F.PATH) dust(this, target.x * TILE + TILE / 2, target.y * TILE + TILE - 4);
    sfx("step");
  }

  update(time: number) {
    if (net.switching) return;
    const me = net.me;
    if (!me || !this.me) return;
    // Reconcile: a predicted step the server never confirmed (collision, cooldown) snaps back.
    if (this.pending && time - this.pending.at > 400) {
      this.pending = null;
      if (this.me.tileX !== me.x || this.me.tileY !== me.y) this.me.walkTile(me.x, me.y, me.dir);
    }
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
        if (d > 1) {
          // Walk to the tile the target just left, so we trail behind instead of blocking.
          const goal = (t.prevTileX !== t.tileX || t.prevTileY !== t.tileY) && isWalkable(this.mapData, t.prevTileX, t.prevTileY) ? { x: t.prevTileX, y: t.prevTileY } : null;
          const path = goal ? findPath(this.mapData, me.x, me.y, goal.x, goal.y) : findPath(this.mapData, me.x, me.y, t.tileX, t.tileY);
          if (path) { if (!goal) path.pop(); this.autoPath = path.length ? path : null; this.autoPathLastProgress = time; this.drawPath(); }
        }
      }
    }
    if (this.autoPath && time - this.lastSend >= STEP_MS && !this.pending) {
      const next = this.autoPath[0];
      const dx = next.x - me.x, dy = next.y - me.y;
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
    for (const ps of this.players.values()) ps.updatePet();
    if (time - this.hearingTick > 150) { this.hearingTick = time; this.updateHearing(); }
    if (!LOW_FX && time - this.lightTick > 120) {
      this.lightTick = time;
      const darkness = darknessFor(this.weatherInfo, net.state.timeMode);
      const tint = this.weather.tintFor(this.weatherInfo?.kind ?? "", darkness);
      this.lighting.draw(darkness, [...this.players.values()].map((p) => ({ x: p.x, y: p.y })), tint);
    }
  }
}

const zv = (z: ZoneView): Zone => ({ id: z.id, name: z.name, x: z.x, y: z.y, w: z.w, h: z.h, color: z.color });
const iv = (i: InteractableView): Interactable => { let options: string[] = []; try { options = JSON.parse(i.options || "[]"); } catch {} return { id: i.id, x: i.x, y: i.y, kind: i.kind as any, title: i.title, url: i.url || undefined, text: i.text || undefined, emote: i.emote || undefined, options }; };
const pv = (p: PortalView): Portal => ({ id: p.id, x: p.x, y: p.y, targetMapId: p.targetMapId, targetX: p.targetX, targetY: p.targetY, label: p.label });
