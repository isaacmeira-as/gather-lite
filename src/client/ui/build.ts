import { net } from "../net";
import { bus } from "../bus";
import { spaces } from "../api";
import { F, O, FLOOR_NAMES, OBJECT_NAMES, TILE } from "../../shared/tiles";
import { INTERACTABLE_KINDS } from "../../shared/map";
import { drawTileset, TILESET_COLS } from "../textures/tiles";
import { $, esc, el, toast } from "./common";
import type { OfficeScene } from "../scenes/OfficeScene";

type Tab = "objects" | "floor" | "zones" | "interactables" | "portals" | "maps";
let tab: Tab = "objects";
let tile: number = O.WALL;
let tilesetCanvas: HTMLCanvasElement | null = null;
let scene: OfficeScene | null = null;
let slug = "";
let active = false;
const ZONE_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#84cc16"];

export function initBuild(spaceSlug: string) {
  slug = spaceSlug;
  bus.on("scene:ready", (s: OfficeScene) => { scene = s; if (active) { bus.emit("ui:build", buildCfg()); render(); } });
  bus.on("map:changed", () => { if (active && ["zones", "interactables", "portals"].includes(tab)) render(); });
  bus.on("ui:toggle-build", () => toggleBuild());
  $("#build-tabs").querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((b) => b.addEventListener("click", () => {
    tab = b.dataset.tab as Tab;
    if (tab === "floor") tile = F.WOOD; else if (tab === "objects") tile = O.WALL;
    $("#build-tabs").querySelectorAll("[data-tab]").forEach((x) => x.classList.toggle("active", x === b));
    render();
    bus.emit("ui:build", buildCfg());
  }));
  bus.on("build:hover", (t: { x: number; y: number }) => { $("#build-coords").textContent = `tile ${t.x}, ${t.y}`; });
  bus.on("build:zone-rect", (r: { x: number; y: number; w: number; h: number }) => zoneForm(r));
  bus.on("build:pick", (p: { tool: string; x: number; y: number }) => {
    if (p.tool === "spawn") { net.send("spawn:set", { x: p.x, y: p.y }); toast("Spawn atualizado"); }
    if (p.tool === "interactable") interactableForm(p.x, p.y);
    if (p.tool === "portal") portalForm(p.x, p.y);
  });
}

function buildCfg() {
  const tool = tab === "zones" ? "zone" : tab === "interactables" ? "interactable" : tab === "portals" ? "portal" : "tile";
  return { active, tool, layer: tab === "floor" ? "floor" : "objects", tile };
}

export function toggleBuild(show?: boolean) {
  if (!net.canBuild) { toast("Só moderadores e o dono podem editar o mapa."); return; }
  const panel = $("#build-panel");
  active = show === undefined ? !!panel.hidden : show;
  panel.hidden = !active;
  $('#toolbar button[data-action="build"]').classList.toggle("active", active);
  if (active) render();
  bus.emit("ui:build", buildCfg());
}

function render() {
  const body = $("#build-body");
  body.innerHTML = "";
  if (tab === "objects" || tab === "floor") return renderPalette(body);
  if (tab === "zones") return renderZones(body);
  if (tab === "interactables") return renderInteractables(body);
  if (tab === "portals") return renderPortals(body);
  if (tab === "maps") return renderMaps(body);
}

function tileThumb(id: number) {
  tilesetCanvas ??= drawTileset(document.createElement("canvas"));
  const c = document.createElement("canvas");
  c.width = TILE; c.height = TILE;
  c.getContext("2d")!.drawImage(tilesetCanvas, (id % TILESET_COLS) * TILE, Math.floor(id / TILESET_COLS) * TILE, TILE, TILE, 0, 0, TILE, TILE);
  return c;
}

function renderPalette(body: HTMLElement) {
  body.appendChild(el(`<p class="muted small pad">Clique ou arraste para pintar. Botão direito apaga.</p>`));
  const pal = el(`<div class="palette"></div>`);
  const ids = tab === "floor" ? Object.values(F).filter((v) => v !== F.NONE) : Object.values(O);
  const names = tab === "floor" ? FLOOR_NAMES : OBJECT_NAMES;
  for (const id of ids) {
    const b = document.createElement("button");
    b.appendChild(tileThumb(id));
    b.appendChild(document.createTextNode(names[id] ?? String(id)));
    b.classList.toggle("active", id === tile);
    b.addEventListener("click", () => { tile = id; render(); bus.emit("ui:build", buildCfg()); });
    pal.appendChild(b);
  }
  body.appendChild(pal);
  const spawn = el(`<div class="pad"><button class="sm">📍 Definir spawn (clique no mapa)</button></div>`);
  spawn.querySelector("button")!.addEventListener("click", () => { bus.emit("ui:build", { ...buildCfg(), tool: "spawn" }); toast("Clique no tile onde as pessoas devem aparecer"); });
  body.appendChild(spawn);
}

function renderZones(body: HTMLElement) {
  body.appendChild(el(`<p class="muted small pad">Arraste no mapa para desenhar uma zona privada. Só quem está dentro ouve a conversa.</p>`));
  const ul = el(`<ul class="list"></ul>`);
  for (const z of scene?.mapData.zones ?? []) {
    const li = el(`<li><span class="dot" style="background:${z.color}"></span><span class="grow">${esc(z.name)} <span class="muted small">${z.w}×${z.h} em ${z.x},${z.y}</span></span><button class="sm" data-a="edit">✏️</button><button class="sm danger" data-a="del">×</button></li>`);
    li.querySelector('[data-a="edit"]')!.addEventListener("click", () => zoneForm({ x: z.x, y: z.y, w: z.w, h: z.h }, z));
    li.querySelector('[data-a="del"]')!.addEventListener("click", () => net.send("zone:remove", { id: z.id }));
    ul.appendChild(li);
  }
  body.appendChild(ul);
}

function zoneForm(r: { x: number; y: number; w: number; h: number }, existing?: { id: string; name: string; color: string }) {
  const body = $("#build-body");
  body.innerHTML = "";
  const f = el(`<form class="form"><b>${existing ? "Editar zona" : "Nova zona"}</b><span class="muted small">${r.w}×${r.h} tiles em ${r.x},${r.y}</span>
    <label>Nome <input name="name" required maxlength="40" value="${esc(existing?.name ?? "")}" /></label>
    <span class="label">Cor</span><div class="swatches"></div>
    <div class="row"><button type="submit" class="primary">Salvar</button><button type="button" data-a="cancel">Cancelar</button></div></form>`);
  let color = existing?.color ?? ZONE_COLORS[(scene?.mapData.zones.length ?? 0) % ZONE_COLORS.length];
  const sw = f.querySelector(".swatches")!;
  const renderSw = () => { sw.innerHTML = ""; for (const c of ZONE_COLORS) { const d = el(`<div class="swatch ${c === color ? "active" : ""}" style="background:${c}"></div>`); d.addEventListener("click", () => { color = c; renderSw(); }); sw.appendChild(d); } };
  renderSw();
  f.addEventListener("submit", (e) => { e.preventDefault(); const name = (f.querySelector('[name="name"]') as HTMLInputElement).value.trim(); if (!name) return; net.send("zone:set", { id: existing?.id, name, color, ...r }); render(); });
  f.querySelector('[data-a="cancel"]')!.addEventListener("click", () => render());
  body.appendChild(f);
  (f.querySelector('[name="name"]') as HTMLInputElement).focus();
}

function renderInteractables(body: HTMLElement) {
  body.appendChild(el(`<p class="muted small pad">Clique em um tile do mapa para criar um objeto interativo (nota, iframe, enquete, timer…). Normalmente em cima de um móvel.</p>`));
  const ul = el(`<ul class="list"></ul>`);
  for (const it of scene?.mapData.interactables ?? []) {
    const li = el(`<li><span class="grow">${esc(it.title)} <span class="muted small">${it.kind} · ${it.x},${it.y}</span></span><button class="sm" data-a="edit">✏️</button><button class="sm danger" data-a="del">×</button></li>`);
    li.querySelector('[data-a="edit"]')!.addEventListener("click", () => interactableForm(it.x, it.y, it));
    li.querySelector('[data-a="del"]')!.addEventListener("click", () => net.send("interactable:remove", { id: it.id }));
    ul.appendChild(li);
  }
  body.appendChild(ul);
}

function interactableForm(x: number, y: number, existing?: any) {
  const body = $("#build-body");
  body.innerHTML = "";
  const f = el(`<form class="form"><b>${existing ? "Editar objeto" : "Novo objeto"} <span class="muted small">em ${x},${y}</span></b>
    <label>Tipo <select name="kind">${INTERACTABLE_KINDS.map((k) => `<option value="${k.kind}" ${existing?.kind === k.kind ? "selected" : ""}>${k.label}</option>`).join("")}</select></label>
    <label>Título <input name="title" required maxlength="60" value="${esc(existing?.title ?? "")}" /></label>
    <label data-f="url">URL <input name="url" maxlength="500" value="${esc(existing?.url ?? "")}" placeholder="https://…" /></label>
    <label data-f="text">Texto <textarea name="text" rows="4">${esc(existing?.text ?? "")}</textarea></label>
    <label data-f="options">Opções (uma por linha) <textarea name="options" rows="3">${esc((existing?.options ?? []).join("\n"))}</textarea></label>
    <label data-f="emote">Emote <input name="emote" maxlength="4" value="${esc(existing?.emote ?? "")}" placeholder="☕" /></label>
    <div class="row"><button type="submit" class="primary">Salvar</button><button type="button" data-a="cancel">Cancelar</button></div></form>`);
  const kindSel = f.querySelector('[name="kind"]') as HTMLSelectElement;
  const refresh = () => { const needs = INTERACTABLE_KINDS.find((k) => k.kind === kindSel.value)!.needs as string[]; f.querySelectorAll<HTMLElement>("[data-f]").forEach((l) => (l.hidden = !needs.includes(l.dataset.f!))); };
  kindSel.addEventListener("change", refresh); refresh();
  f.querySelectorAll("input, textarea").forEach((i) => i.addEventListener("keydown", (e) => e.stopPropagation()));
  f.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = (n: string) => (f.querySelector(`[name="${n}"]`) as HTMLInputElement).value;
    net.send("interactable:set", { id: existing?.id, x, y, kind: kindSel.value, title: v("title"), url: v("url"), text: v("text"), emote: v("emote"), options: v("options").split("\n").map((s) => s.trim()).filter(Boolean) });
    render();
  });
  f.querySelector('[data-a="cancel"]')!.addEventListener("click", () => render());
  body.appendChild(f);
}

function renderPortals(body: HTMLElement) {
  body.appendChild(el(`<p class="muted small pad">Clique em um tile para criar um portal para outra sala deste espaço.</p>`));
  const ul = el(`<ul class="list"></ul>`);
  const maps = net.welcome.maps;
  for (const p of scene?.mapData.portals ?? []) {
    const li = el(`<li><span class="grow">${esc(p.label || "portal")} <span class="muted small">${p.x},${p.y} → ${esc(maps.find((m) => m.id === p.targetMapId)?.name ?? "?")} (${p.targetX},${p.targetY})</span></span><button class="sm" data-a="edit">✏️</button><button class="sm danger" data-a="del">×</button></li>`);
    li.querySelector('[data-a="edit"]')!.addEventListener("click", () => portalForm(p.x, p.y, p));
    li.querySelector('[data-a="del"]')!.addEventListener("click", () => net.send("portal:remove", { id: p.id }));
    ul.appendChild(li);
  }
  body.appendChild(ul);
}

function portalForm(x: number, y: number, existing?: any) {
  const body = $("#build-body");
  body.innerHTML = "";
  const maps = net.welcome.maps;
  const f = el(`<form class="form"><b>${existing ? "Editar portal" : "Novo portal"} <span class="muted small">em ${x},${y}</span></b>
    <label>Sala de destino <select name="map">${maps.map((m) => `<option value="${m.id}" ${existing?.targetMapId === m.id ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select></label>
    <div class="row"><label>X <input name="tx" type="number" min="0" value="${existing?.targetX ?? 1}" style="width:80px" /></label><label>Y <input name="ty" type="number" min="0" value="${existing?.targetY ?? 1}" style="width:80px" /></label></div>
    <label>Rótulo <input name="label" maxlength="40" value="${esc(existing?.label ?? "")}" /></label>
    <div class="row"><button type="submit" class="primary">Salvar</button><button type="button" data-a="cancel">Cancelar</button></div></form>`);
  f.querySelectorAll("input").forEach((i) => i.addEventListener("keydown", (e) => e.stopPropagation()));
  f.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = (n: string) => (f.querySelector(`[name="${n}"]`) as HTMLInputElement).value;
    net.send("portal:set", { id: existing?.id, x, y, targetMapId: v("map"), targetX: Number(v("tx")), targetY: Number(v("ty")), label: v("label") });
    render();
  });
  f.querySelector('[data-a="cancel"]')!.addEventListener("click", () => render());
  body.appendChild(f);
}

function renderMaps(body: HTMLElement) {
  const maps = net.welcome.maps;
  const ul = el(`<ul class="list"></ul>`);
  for (const m of maps) {
    const cur = m.id === net.state.mapId;
    const li = el(`<li><span class="grow">${cur ? "▶ " : ""}${esc(m.name)} ${m.is_default ? '<span class="role">padrão</span>' : ""}</span>
      ${cur ? "" : '<button class="sm" data-a="go">Ir</button>'}<button class="sm" data-a="rename">✏️</button>${m.is_default ? "" : '<button class="sm" data-a="default">★</button>'}<button class="sm danger" data-a="del">×</button></li>`);
    li.querySelector('[data-a="go"]')?.addEventListener("click", () => net.switchMap(m.id));
    li.querySelector('[data-a="rename"]')!.addEventListener("click", async () => { const name = prompt("Novo nome da sala:", m.name); if (!name) return; await spaces.updateMap(slug, m.id, { name }); if (cur) net.send("map:rename", { name }); await refreshMaps(); });
    li.querySelector('[data-a="default"]')?.addEventListener("click", async () => { await spaces.updateMap(slug, m.id, { isDefault: true }); await refreshMaps(); });
    li.querySelector('[data-a="del"]')!.addEventListener("click", async () => { if (maps.length <= 1) return toast("O espaço precisa de pelo menos uma sala."); if (!confirm(`Apagar a sala "${m.name}"?`)) return; try { await spaces.deleteMap(slug, m.id); await refreshMaps(); if (cur) net.switchMap(net.welcome.maps[0].id); } catch (e: any) { toast(e.message); } });
    ul.appendChild(li);
  }
  body.appendChild(ul);
  const f = el(`<form class="form"><b>Nova sala</b><div class="row"><input name="name" placeholder="Nome" required maxlength="40" style="flex:1" />
    <select name="template"><option value="blank">Vazia</option><option value="office">Escritório</option><option value="garden">Jardim</option></select><button class="primary">Criar</button></div></form>`);
  f.querySelector("input")!.addEventListener("keydown", (e) => e.stopPropagation());
  f.addEventListener("submit", async (e) => { e.preventDefault(); const name = (f.querySelector('[name="name"]') as HTMLInputElement).value.trim(); const template = (f.querySelector('[name="template"]') as HTMLSelectElement).value; const { map } = await spaces.createMap(slug, name, template); await refreshMaps(); toast(`Sala "${map.name}" criada`); });
  body.appendChild(f);
  const io = el(`<div class="form"><b>Importar / exportar</b><div class="row"><button class="sm" data-a="export">⬇ Exportar JSON desta sala</button><label class="sm"><input type="file" accept="application/json" hidden /><button class="sm" type="button" data-a="import">⬆ Importar JSON</button></label></div><p class="muted small">O JSON exportado pode ser editado à mão ou gerado a partir do Tiled (camadas "floor" e "objects" com os ids deste tileset).</p></div>`);
  io.querySelector('[data-a="export"]')!.addEventListener("click", () => {
    const data = { ...scene!.mapData, name: net.state.mapName };
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${net.state.mapName}.json`; a.click();
  });
  const file = io.querySelector("input[type=file]") as HTMLInputElement;
  io.querySelector('[data-a="import"]')!.addEventListener("click", () => file.click());
  file.addEventListener("change", async () => {
    const f = file.files?.[0]; if (!f) return;
    try { const data = JSON.parse(await f.text()); if (!confirm("Substituir a sala atual pelo mapa importado?")) return; net.send("map:import", data); } catch { toast("Arquivo inválido"); }
  });
  body.appendChild(io);
}

async function refreshMaps() {
  const { space } = await spaces.get(slug);
  net.welcome.maps = space.maps;
  bus.emit("maps:changed", space.maps);
  render();
}
