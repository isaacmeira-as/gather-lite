import Phaser from "phaser";
import { net, PlayerView } from "../net";
import { bus } from "../bus";
import { TILE, DIR, DIR_DELTA, isSolid, O } from "../../shared/tiles";
import { MapData, Interactable, canHear, findPath, interactableNear, zoneAt, isSpotlight, inBounds, idx } from "../../shared/map";
import { drawTileset, TILESET_COLS } from "../textures/tiles";
import { drawAvatarSheet, AV_W, AV_H, AV_FRAMES_PER_DIR } from "../textures/avatars";

const STEP_MS = 130;
const BUBBLE_MS = 5000;

const STATUS_COLORS: Record<string, number> = { available: 0x22c55e, busy: 0xf59e0b, dnd: 0xef4444 };

class PlayerSprite extends Phaser.GameObjects.Container {
  sprite: Phaser.GameObjects.Sprite;
  nameText: Phaser.GameObjects.Text;
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
    this.texKey = scene.ensureAvatarTexture(view.skin, view.color);
    this.sprite = scene.add.sprite(0, 10, this.texKey, `0-0`).setOrigin(0.5, 1);
    this.nameText = scene.add.text(0, -32, view.name, { fontFamily: "ui-sans-serif, system-ui, sans-serif", fontSize: "10px", color: "#ffffff", stroke: "#000000", strokeThickness: 3, resolution: 3 }).setOrigin(0.5, 1);
    this.statusDot = scene.add.circle(0, -36, 2.5, STATUS_COLORS[view.status] ?? 0x22c55e).setStrokeStyle(1, 0x000000, 0.6);
    this.emoteText = scene.add.text(0, -40, "", { fontSize: "16px", resolution: 3 }).setOrigin(0.5, 1).setVisible(false);
    this.bubbleBg = scene.add.graphics();
    this.bubbleText = scene.add.text(0, 0, "", { fontFamily: "ui-sans-serif, system-ui, sans-serif", fontSize: "9px", color: "#111827", wordWrap: { width: 110 }, resolution: 3, align: "center" }).setOrigin(0.5, 1);
    this.bubble = scene.add.container(0, -42, [this.bubbleBg, this.bubbleText]).setVisible(false);
    this.add([this.sprite, this.nameText, this.statusDot, this.emoteText, this.bubble]);
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
  }

  setFacing(dir: number) {
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
    if (far) {
      this.setPosition(tx, ty);
      this.setDepth(ty);
      this.setFacing(dir);
      return;
    }
    if (!this.view.sitting) this.sprite.play(`${this.texKey}-walk-${dir}`, true);
    this.tween = scene.tweens.add({
      targets: this,
      x: tx,
      y: ty,
      duration: STEP_MS,
      onUpdate: () => this.setDepth(this.y),
      onComplete: () => {
        this.setDepth(ty);
        // stop walking only if no further movement is queued
        scene.time.delayedCall(40, () => {
          if (!this.tween || !this.tween.isPlaying()) {
            this.sprite.stop();
            this.setFacing(this.view.dir);
          }
        });
      },
    });
  }

  showBubble(text: string) {
    this.bubbleText.setText(text.length > 90 ? text.slice(0, 90) + "…" : text);
    const w = this.bubbleText.width + 10;
    const h = this.bubbleText.height + 8;
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
  zoneLabels: Phaser.GameObjects.Text[] = [];
  players = new Map<string, PlayerSprite>();
  me: PlayerSprite | null = null;
  keys!: Record<string, Phaser.Input.Keyboard.Key>;
  lastSend = 0;
  autoPath: { x: number; y: number }[] | null = null;
  autoPathLastProgress = 0;
  locateTarget: string | null = null;
  locateGfx!: Phaser.GameObjects.Graphics;
  pathGfx!: Phaser.GameObjects.Graphics;
  build: { active: boolean; layer: "floor" | "objects"; tile: number } = { active: false, layer: "objects", tile: O.WALL };
  buildCursor!: Phaser.GameObjects.Rectangle;
  gridGfx!: Phaser.GameObjects.Graphics;
  promptText!: Phaser.GameObjects.Text;
  nearbyInteractable: Interactable | null = null;
  nearbyIds = new Set<string>();
  hearingTick = 0;

  constructor() { super("office"); }

  create() {
    const state = net.state;
    this.mapData = {
      width: state.width,
      height: state.height,
      floor: Array.from(state.floor),
      objects: Array.from(state.objects),
      zones: net.welcome.map.zones,
      interactables: net.welcome.map.interactables,
      spawn: net.welcome.map.spawn,
    };

    // Tileset + layers
    const tilesCanvas = drawTileset(document.createElement("canvas"));
    this.textures.addCanvas("tiles", tilesCanvas);
    this.tilemap = this.make.tilemap({ tileWidth: TILE, tileHeight: TILE, width: this.mapData.width, height: this.mapData.height });
    const tileset = this.tilemap.addTilesetImage("tiles", "tiles", TILE, TILE, 0, 0, 0)!;
    this.floorLayer = this.tilemap.createBlankLayer("floor", tileset)!;
    this.objectLayer = this.tilemap.createBlankLayer("objects", tileset)!.setDepth(1);
    for (let y = 0; y < this.mapData.height; y++) {
      for (let x = 0; x < this.mapData.width; x++) {
        const i = idx(this.mapData, x, y);
        this.floorLayer.putTileAt(this.mapData.floor[i], x, y);
        const o = this.mapData.objects[i];
        if (o) this.objectLayer.putTileAt(o, x, y);
      }
    }
    this.zoneGfx = this.add.graphics().setDepth(0.5);
    this.drawZones();
    this.pathGfx = this.add.graphics().setDepth(0.6);
    this.locateGfx = this.add.graphics().setDepth(0.7);
    this.gridGfx = this.add.graphics().setDepth(0.8).setVisible(false);
    this.buildCursor = this.add.rectangle(0, 0, TILE, TILE).setStrokeStyle(2, 0xfacc15).setOrigin(0).setDepth(5000).setVisible(false);
    this.promptText = this.add.text(0, 0, "X", { fontFamily: "ui-sans-serif, system-ui, sans-serif", fontSize: "10px", color: "#111827", backgroundColor: "#facc15", padding: { x: 4, y: 2 }, resolution: 3 }).setOrigin(0.5, 1).setDepth(6000).setVisible(false);

    // Camera
    this.cameras.main.setBounds(0, 0, this.mapData.width * TILE, this.mapData.height * TILE);
    this.cameras.main.setZoom(2);
    this.cameras.main.setRoundPixels(true);

    // Players
    const $ = net.$;
    $(state).players.onAdd((p, key) => this.addPlayer(p, key));
    $(state).players.onRemove((_p, key) => this.removePlayer(key));
    $(state).floor.onChange((v, i) => this.setTile("floor", i, v));
    $(state).objects.onChange((v, i) => this.setTile("objects", i, v));

    // Input
    const kb = this.input.keyboard!;
    kb.disableGlobalCapture();
    this.keys = kb.addKeys({ up: "UP", down: "DOWN", left: "LEFT", right: "RIGHT", w: "W", a: "A", s: "S", d: "D" }) as any;
    kb.on("keydown", (e: KeyboardEvent) => this.onKeyDown(e));
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => this.onPointerDown(p));
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => this.onPointerMove(p));
    this.input.on("wheel", (_p: any, _o: any, _dx: number, dy: number) => {
      const z = Phaser.Math.Clamp(this.cameras.main.zoom - Math.sign(dy) * 0.25, 1, 4);
      this.cameras.main.setZoom(z);
    });
    this.input.mouse?.disableContextMenu();

    bus.on("chat", (m) => {
      const ps = this.players.get(m.from);
      if (ps && m.scope !== "dm") ps.showBubble(m.text);
    });
    bus.on("ui:locate", (id: string | null) => { this.locateTarget = id === this.locateTarget ? null : id; this.locateGfx.clear(); });
    bus.on("ui:build", (cfg: { active: boolean; layer?: "floor" | "objects"; tile?: number }) => {
      this.build.active = cfg.active;
      if (cfg.layer) this.build.layer = cfg.layer;
      if (cfg.tile !== undefined) this.build.tile = cfg.tile;
      this.gridGfx.setVisible(cfg.active);
      this.buildCursor.setVisible(cfg.active);
      if (cfg.active) this.drawGrid();
      this.autoPath = null;
    });
    bus.on("ui:goto", (t: { x: number; y: number }) => this.walkTo(t.x, t.y));
    bus.on("ui:zoom", (delta: number) => this.cameras.main.setZoom(Phaser.Math.Clamp(this.cameras.main.zoom + delta, 1, 4)));
    bus.emit("scene:ready", this);
  }

  // ---------------------------------------------------------------- players
  ensureAvatarTexture(skin: number, color: string) {
    const key = `av-${skin}-${color.replace("#", "")}`;
    if (this.textures.exists(key)) return key;
    const canvas = drawAvatarSheet(document.createElement("canvas"), skin, color);
    const tex = this.textures.addCanvas(key, canvas)!;
    for (let dir = 0; dir < 4; dir++) {
      for (let f = 0; f < AV_FRAMES_PER_DIR; f++) tex.add(`${dir}-${f}`, 0, f * AV_W, dir * AV_H, AV_W, AV_H);
      this.anims.create({
        key: `${key}-walk-${dir}`,
        frames: [{ key, frame: `${dir}-1` }, { key, frame: `${dir}-0` }, { key, frame: `${dir}-2` }, { key, frame: `${dir}-0` }],
        frameRate: 12,
        repeat: -1,
      });
    }
    for (let dir = 0; dir < AV_FRAMES_PER_DIR; dir++) tex.add(`sit-${dir}`, 0, dir * AV_W, 4 * AV_H, AV_W, AV_H);
    return key;
  }

  addPlayer(p: PlayerView, key: string) {
    const ps = new PlayerSprite(this, p);
    this.players.set(key, ps);
    ps.setFacing(p.dir);
    ps.setAlpha(p.connected ? 1 : 0.4);
    const $ = net.$;
    $(p).listen("x", () => ps.walkTile(p.x, p.y, p.dir));
    $(p).listen("y", () => ps.walkTile(p.x, p.y, p.dir));
    $(p).listen("dir", (d: number) => ps.setFacing(d));
    $(p).listen("sitting", () => { ps.sprite.stop(); ps.setFacing(p.dir); });
    $(p).listen("emote", (e: string) => ps.showEmote(e));
    $(p).listen("status", () => { ps.layoutName(); bus.emit("players"); });
    $(p).listen("name", () => { ps.layoutName(); bus.emit("players"); });
    $(p).listen("zone", () => bus.emit("players"));
    $(p).listen("connected", (c: boolean) => { ps.setAlpha(c ? 1 : 0.4); bus.emit("players"); });
    if (key === net.sessionId) {
      this.me = ps;
      this.cameras.main.startFollow(ps, true, 0.15, 0.15);
      $(p).listen("x", () => this.onMeMoved());
      $(p).listen("y", () => this.onMeMoved());
      this.onMeMoved();
    }
    bus.emit("players");
  }

  removePlayer(key: string) {
    const ps = this.players.get(key);
    if (!ps) return;
    ps.destroy();
    this.players.delete(key);
    if (this.locateTarget === key) { this.locateTarget = null; this.locateGfx.clear(); }
    bus.emit("players");
  }

  onMeMoved() {
    const me = net.me!;
    const it = interactableNear(this.mapData, me.x, me.y);
    if (it?.id !== this.nearbyInteractable?.id) {
      this.nearbyInteractable = it;
      bus.emit("interactable", it);
    }
    if (it) {
      this.promptText.setPosition(it.x * TILE + TILE / 2, it.y * TILE - 2).setVisible(true);
    } else this.promptText.setVisible(false);
    // auto path progress
    if (this.autoPath && this.autoPath.length && this.autoPath[0].x === me.x && this.autoPath[0].y === me.y) {
      this.autoPath.shift();
      this.autoPathLastProgress = this.time.now;
      if (!this.autoPath.length) { this.autoPath = null; this.pathGfx.clear(); }
      else this.drawPath();
    }
    this.updateHearing(true);
    bus.emit("me:moved", { x: me.x, y: me.y, spotlight: isSpotlight(this.mapData, me.x, me.y), zone: zoneAt(this.mapData, me.x, me.y) });
  }

  updateHearing(force = false) {
    const me = net.me;
    if (!me) return;
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
    if (changed) { this.nearbyIds = ids; bus.emit("nearby", [...ids]); }
  }

  // ------------------------------------------------------------------ map
  setTile(layer: "floor" | "objects", i: number, v: number) {
    const x = i % this.mapData.width;
    const y = Math.floor(i / this.mapData.width);
    this.mapData[layer][i] = v;
    if (layer === "floor") this.floorLayer.putTileAt(v, x, y);
    else if (v) this.objectLayer.putTileAt(v, x, y);
    else this.objectLayer.removeTileAt(x, y);
    bus.emit("map:changed");
  }

  drawZones() {
    this.zoneGfx.clear();
    for (const t of this.zoneLabels) t.destroy();
    this.zoneLabels = [];
    for (const z of this.mapData.zones) {
      const c = Phaser.Display.Color.HexStringToColor(z.color).color;
      this.zoneGfx.fillStyle(c, 0.14);
      this.zoneGfx.fillRect(z.x * TILE, z.y * TILE, z.w * TILE, z.h * TILE);
      this.zoneGfx.lineStyle(1, c, 0.6);
      this.zoneGfx.strokeRect(z.x * TILE + 0.5, z.y * TILE + 0.5, z.w * TILE - 1, z.h * TILE - 1);
      const label = this.add.text(z.x * TILE + 2, z.y * TILE + 2, z.name, { fontFamily: "ui-sans-serif, system-ui, sans-serif", fontSize: "8px", color: "#ffffff", backgroundColor: "#00000099", padding: { x: 3, y: 1 }, resolution: 3 }).setDepth(2).setAlpha(0.95);
      this.zoneLabels.push(label);
    }
  }

  drawGrid() {
    this.gridGfx.clear();
    this.gridGfx.lineStyle(1, 0xffffff, 0.15);
    for (let x = 0; x <= this.mapData.width; x++) this.gridGfx.lineBetween(x * TILE, 0, x * TILE, this.mapData.height * TILE);
    for (let y = 0; y <= this.mapData.height; y++) this.gridGfx.lineBetween(0, y * TILE, this.mapData.width * TILE, y * TILE);
  }

  drawPath() {
    this.pathGfx.clear();
    if (!this.autoPath) return;
    this.pathGfx.fillStyle(0xffffff, 0.5);
    for (const n of this.autoPath) this.pathGfx.fillCircle(n.x * TILE + TILE / 2, n.y * TILE + TILE / 2, 3);
  }

  walkTo(tx: number, ty: number) {
    const me = net.me;
    if (!me) return;
    const path = findPath(this.mapData, me.x, me.y, tx, ty);
    if (!path) { bus.emit("toast", "Não dá para chegar aí."); return; }
    // Drop the final node when it's not walkable (e.g. clicking a desk): stop next to it.
    const last = path[path.length - 1];
    if (last && isSolid(this.mapData.floor[idx(this.mapData, last.x, last.y)], this.mapData.objects[idx(this.mapData, last.x, last.y)])) path.pop();
    this.autoPath = path.length ? path : null;
    this.autoPathLastProgress = this.time.now;
    this.drawPath();
  }

  // ---------------------------------------------------------------- input
  uiHasFocus() {
    const el = document.activeElement as HTMLElement | null;
    return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
  }

  onKeyDown(e: KeyboardEvent) {
    if (this.uiHasFocus()) return;
    if (e.repeat) return;
    switch (e.key.toLowerCase()) {
      case "x":
        if (this.nearbyInteractable) bus.emit("interact", this.nearbyInteractable);
        break;
      case "enter": bus.emit("ui:focus-chat"); e.preventDefault(); break;
      case "escape": bus.emit("ui:escape"); break;
      case "b": bus.emit("ui:toggle-build"); break;
      case "p": bus.emit("ui:toggle-participants"); break;
      case "e": bus.emit("ui:toggle-emotes"); break;
      case "m": bus.emit("ui:toggle-minimap"); break;
      case "?": case "h": bus.emit("ui:toggle-help"); break;
      case "+": case "=": bus.emit("ui:zoom", 0.25); break;
      case "-": bus.emit("ui:zoom", -0.25); break;
      default: {
        const n = Number(e.key);
        if (n >= 1 && n <= 9) bus.emit("ui:emote-index", n - 1);
      }
    }
  }

  pointerTile(p: Phaser.Input.Pointer) {
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    return { x: Math.floor(w.x / TILE), y: Math.floor(w.y / TILE) };
  }

  onPointerDown(p: Phaser.Input.Pointer) {
    const t = this.pointerTile(p);
    if (!inBounds(this.mapData, t.x, t.y)) return;
    if (this.build.active) { this.paint(t, p.rightButtonDown()); return; }
    if (p.leftButtonDown()) {
      // Clicking a player opens their card; clicking the map walks there.
      for (const [id, ps] of this.players) {
        if (ps.tileX === t.x && ps.tileY === t.y && id !== net.sessionId) { bus.emit("ui:player-card", id); return; }
      }
      this.walkTo(t.x, t.y);
    }
  }

  onPointerMove(p: Phaser.Input.Pointer) {
    if (!this.build.active) return;
    const t = this.pointerTile(p);
    this.buildCursor.setPosition(t.x * TILE, t.y * TILE);
    bus.emit("build:hover", t);
    if (p.isDown && inBounds(this.mapData, t.x, t.y)) this.paint(t, p.rightButtonDown());
  }

  paint(t: { x: number; y: number }, erase: boolean) {
    const layer = this.build.layer;
    const tile = erase ? (layer === "objects" ? 0 : 4) : this.build.tile;
    const i = idx(this.mapData, t.x, t.y);
    if (this.mapData[layer][i] === tile) return;
    net.build(layer, t.x, t.y, tile);
  }

  update(time: number) {
    const me = net.me;
    if (!me || !this.me) return;
    if (!this.uiHasFocus() && !this.build.active) {
      let dir = -1;
      const k = this.keys;
      if (k.up.isDown || k.w.isDown) dir = DIR.UP;
      else if (k.down.isDown || k.s.isDown) dir = DIR.DOWN;
      else if (k.left.isDown || k.a.isDown) dir = DIR.LEFT;
      else if (k.right.isDown || k.d.isDown) dir = DIR.RIGHT;
      if (dir >= 0) {
        this.autoPath = null; this.pathGfx.clear();
        if (time - this.lastSend >= STEP_MS) { net.move(dir); this.lastSend = time; }
      }
    }
    if (this.autoPath && time - this.lastSend >= STEP_MS) {
      const next = this.autoPath[0];
      const dx = next.x - me.x, dy = next.y - me.y;
      const dir = dx === 1 ? DIR.RIGHT : dx === -1 ? DIR.LEFT : dy === 1 ? DIR.DOWN : dy === -1 ? DIR.UP : -1;
      if (dir < 0 || time - this.autoPathLastProgress > 1500) { this.autoPath = null; this.pathGfx.clear(); }
      else { net.move(dir); this.lastSend = time; }
    }
    if (this.locateTarget) {
      const target = this.players.get(this.locateTarget);
      if (target && time - this.hearingTick > 150) {
        const path = findPath(this.mapData, me.x, me.y, target.tileX, target.tileY);
        this.locateGfx.clear();
        if (path) {
          this.locateGfx.lineStyle(3, 0xfacc15, 0.9);
          this.locateGfx.beginPath();
          this.locateGfx.moveTo(this.me.x, this.me.y + 8);
          for (const n of path) this.locateGfx.lineTo(n.x * TILE + TILE / 2, n.y * TILE + TILE / 2);
          this.locateGfx.strokePath();
        }
        if (path && path.length <= 1) { this.locateTarget = null; this.locateGfx.clear(); bus.emit("ui:locate-done"); }
      }
    }
    if (time - this.hearingTick > 150) { this.hearingTick = time; this.updateHearing(); }
  }
}
