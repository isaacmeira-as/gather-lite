import { net } from "../net";
import { bus } from "../bus";
import { EMOTES } from "../../shared/messages";
import { F, O, FLOOR_NAMES, OBJECT_NAMES, TILE } from "../../shared/tiles";
import type { Interactable, Zone } from "../../shared/map";
import { drawTileset, TILESET_COLS, TILE_COLORS } from "../textures/tiles";
import type { OfficeScene } from "../scenes/OfficeScene";

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

let scene: OfficeScene | null = null;
let dmTarget: string | null = null;
let unread = 0;

export function initUI() {
  $("#hud").hidden = false;
  bus.on("scene:ready", (s: OfficeScene) => { scene = s; renderParticipants(); startMinimap(); });

  // ---- top bar
  $("#me-name").textContent = net.me?.name ?? "";
  $<HTMLSelectElement>("#status-select").addEventListener("change", (e) => net.setStatus((e.target as HTMLSelectElement).value));
  bus.on("latency", (ms: number) => { $("#latency").textContent = `${ms} ms`; });
  bus.on("me:moved", (info: { spotlight: boolean; zone: Zone | null }) => {
    const el = $("#zone-indicator");
    if (info.spotlight) { el.textContent = "🎤 Spotlight: todos ouvem você"; el.style.background = "#854d0e"; }
    else if (info.zone) { el.textContent = `🔒 ${info.zone.name}`; el.style.background = info.zone.color + "66"; }
    else { el.textContent = "Área comum"; el.style.background = ""; }
  });
  bus.on("zone", (z: { id: string; name: string }) => toast(z.id ? `Você entrou em ${z.name}` : "Você saiu da zona privada"));

  // ---- toolbar
  document.querySelectorAll<HTMLButtonElement>("#toolbar button").forEach((b) => {
    b.addEventListener("click", () => {
      const a = b.dataset.action!;
      if (a === "chat") togglePanel("chat");
      if (a === "participants") togglePanel("participants");
      if (a === "build") toggleBuild();
      if (a === "emotes") toggleEmotes();
      if (a === "minimap") toggleMinimap();
      if (a === "help") $("#help").hidden = !$("#help").hidden;
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-close]").forEach((b) => b.addEventListener("click", () => {
    const id = b.dataset.close!;
    if (id === "build") toggleBuild(false); else $(`#${id}`).hidden = true;
  }));
  $("#help-close").addEventListener("click", () => ($("#help").hidden = true));
  bus.on("ui:toggle-participants", () => togglePanel("participants"));
  bus.on("ui:toggle-build", () => toggleBuild());
  bus.on("ui:toggle-emotes", () => toggleEmotes());
  bus.on("ui:toggle-minimap", () => toggleMinimap());
  bus.on("ui:toggle-help", () => ($("#help").hidden = !$("#help").hidden));
  bus.on("ui:escape", () => {
    $("#modal").hidden = true; $("#help").hidden = true; $("#player-card").hidden = true; $("#emote-bar").hidden = true;
    if (!$("#build-panel").hidden) toggleBuild(false);
  });
  bus.on("toast", (t: string) => toast(t));

  // ---- emotes
  const bar = $("#emote-bar");
  EMOTES.forEach((e, i) => {
    const b = document.createElement("button");
    b.innerHTML = `${e}<small>${i + 1}</small>`;
    b.title = `Emote ${i + 1}`;
    b.addEventListener("click", () => { net.emote(e); bar.hidden = true; });
    bar.appendChild(b);
  });
  bus.on("ui:emote-index", (i: number) => { if (EMOTES[i]) net.emote(EMOTES[i]); });

  // ---- interactables
  bus.on("interactable", (it: Interactable | null) => {
    const hint = $("#interact-hint");
    hint.hidden = !it;
    if (it) hint.querySelector("span")!.textContent = it.title;
  });
  bus.on("interact", (it: Interactable) => openInteractable(it));
  $("#interact-hint").addEventListener("click", () => { if (scene?.nearbyInteractable) openInteractable(scene.nearbyInteractable); });
  $("#modal-close").addEventListener("click", closeModal);
  // Escape must work even while a textarea/input inside a modal has focus.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!$("#modal").hidden) { closeModal(); e.stopPropagation(); }
    $("#help").hidden = true; $("#player-card").hidden = true; $("#emote-bar").hidden = true;
  }, true);
  $("#modal").addEventListener("click", (e) => { if (e.target === $("#modal")) closeModal(); });

  initChat();
  initParticipants();
  initBuild();

  bus.on("disconnected", (code: number) => {
    toast(`Conexão perdida (${code}). Recarregue a página.`);
    $("#zone-indicator").textContent = "⚠️ desconectado";
  });
}

// --------------------------------------------------------------------- utils
function togglePanel(id: string, show?: boolean) {
  const el = $(`#${id}`);
  el.hidden = show === undefined ? !el.hidden : !show;
  if (id === "chat" && !el.hidden) { unread = 0; updateChatBadge(); $("#chat-messages").scrollTop = 1e9; }
}
export function toast(text: string, ms = 2600) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = text;
  $("#toasts").appendChild(t);
  setTimeout(() => t.remove(), ms);
}
function toggleEmotes() { $("#emote-bar").hidden = !$("#emote-bar").hidden; }
function toggleMinimap() { $("#minimap").hidden = !$("#minimap").hidden; document.body.classList.toggle("minimap", !$("#minimap").hidden); }

// ---------------------------------------------------------------------- chat
function initChat() {
  const form = $<HTMLFormElement>("#chat-form");
  const input = $<HTMLInputElement>("#chat-input");
  const scopeSel = $<HTMLSelectElement>("#chat-scope");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    if (dmTarget) net.chat(text, "dm", dmTarget);
    else net.chat(text, scopeSel.value as any);
    input.value = "";
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { input.blur(); togglePanel("chat", false); }
    e.stopPropagation();
  });
  bus.on("ui:focus-chat", () => { togglePanel("chat", true); input.focus(); });
  $("#chat-dm-cancel").addEventListener("click", (e) => { e.preventDefault(); setDm(null); });

  bus.on("chat", (m) => {
    const mine = m.from === net.sessionId;
    const scopeLabel: Record<string, string> = { nearby: "perto", zone: "zona", everyone: "todos", spotlight: "🎤 spotlight", dm: mine ? "para " + (net.state.players.get(m.to)?.name ?? "?") : "direta" };
    addMessage(`<span class="who" style="color:${esc(m.fromColor)}">${esc(mine ? "Você" : m.fromName)}</span><span class="scope">${scopeLabel[m.scope] ?? m.scope}</span> ${esc(m.text)}`, m.scope);
    if ($("#chat").hidden && !mine) { unread++; updateChatBadge(); }
  });
  bus.on("system", (m) => { addMessage(esc(m.text), "system"); });
}
function addMessage(html: string, cls = "") {
  const box = $("#chat-messages");
  const el = document.createElement("div");
  el.className = `msg ${cls}`;
  el.innerHTML = html;
  box.appendChild(el);
  while (box.children.length > 300) box.firstChild?.remove();
  box.scrollTop = box.scrollHeight;
}
function updateChatBadge() {
  const b = $('#toolbar button[data-action="chat"]');
  b.textContent = unread ? `💬${unread}` : "💬";
}
function setDm(id: string | null) {
  dmTarget = id;
  const row = $("#chat-dm");
  row.hidden = !id;
  if (id) row.querySelector("b")!.textContent = net.state.players.get(id)?.name ?? "?";
  $("#chat-scope").hidden = !!id;
}

// --------------------------------------------------------------- participants
function initParticipants() {
  bus.on("players", renderParticipants);
  bus.on("nearby", (ids: string[]) => {
    $("#nearby-list").textContent = ids.length ? ids.map((i) => net.state.players.get(i)?.name).filter(Boolean).join(", ") : "ninguém";
    renderParticipants();
  });
  bus.on("ui:player-card", (id: string) => openPlayerCard(id));
  bus.on("ui:locate-done", () => { toast("Você chegou!"); renderParticipants(); });
  const card = $("#player-card");
  card.querySelectorAll<HTMLButtonElement>("[data-pc]").forEach((b) => b.addEventListener("click", () => {
    const id = card.dataset.id!;
    if (b.dataset.pc === "locate") { bus.emit("ui:locate", id); toast(`Siga a linha amarela até ${net.state.players.get(id)?.name}`); }
    if (b.dataset.pc === "dm") { setDm(id); togglePanel("chat", true); $<HTMLInputElement>("#chat-input").focus(); }
    card.hidden = true;
  }));
}
const STATUS_LABEL: Record<string, string> = { available: "disponível", busy: "ocupado", dnd: "não perturbe" };
function renderParticipants() {
  const list = $("#participants-list");
  const players = [...net.state.players.values()].sort((a, b) => (a.id === net.sessionId ? -1 : b.id === net.sessionId ? 1 : a.name.localeCompare(b.name)));
  $("#participants-count").textContent = `(${players.length})`;
  list.innerHTML = players.map((p) => {
    const zone = p.zone ? scene?.mapData.zones.find((z) => z.id === p.zone)?.name : "";
    const near = scene?.nearbyIds.has(p.id);
    return `<li data-id="${p.id}" class="${p.connected ? "" : "away"}">
      <span class="dot" style="background:${esc(p.color)}"></span>
      <div style="flex:1"><div>${esc(p.name)} ${p.id === net.sessionId ? '<span class="you">(você)</span>' : ""} ${near ? "👂" : ""}</div>
      <div class="meta">${STATUS_LABEL[p.status] ?? p.status}${zone ? " · " + esc(zone) : ""}${p.connected ? "" : " · reconectando…"}</div></div>
      ${scene?.locateTarget === p.id ? "📍" : ""}
    </li>`;
  }).join("");
  list.querySelectorAll<HTMLLIElement>("li").forEach((li) => li.addEventListener("click", () => { if (li.dataset.id !== net.sessionId) openPlayerCard(li.dataset.id!); }));
}
function openPlayerCard(id: string) {
  const p = net.state.players.get(id);
  if (!p) return;
  const card = $("#player-card");
  card.dataset.id = id;
  card.querySelector(".pc-name")!.textContent = p.name;
  const zone = p.zone ? scene?.mapData.zones.find((z) => z.id === p.zone)?.name : "área comum";
  card.querySelector(".pc-meta")!.textContent = `${STATUS_LABEL[p.status] ?? p.status} · ${zone}`;
  card.hidden = false;
}

// --------------------------------------------------------------------- modal
function openInteractable(it: Interactable) {
  const body = $("#modal-body");
  $("#modal-title").textContent = it.title;
  body.innerHTML = "";
  if (it.kind === "emote") { net.interact(it.id); toast(`${it.emote} ${it.title}`); return; }
  if (it.kind === "note") body.innerHTML = `<pre>${esc(it.text ?? "")}</pre>`;
  if (it.kind === "link") { window.open(it.url, "_blank"); return; }
  if (it.kind === "iframe") body.innerHTML = `<iframe src="${esc(it.url ?? "")}" allow="autoplay; fullscreen" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe><p class="muted small">Se a página não carregar aqui, <a href="${esc(it.url ?? "")}" target="_blank">abra em nova aba</a>.</p>`;
  if (it.kind === "board") {
    const ta = document.createElement("textarea");
    ta.placeholder = "Escreva aqui. Todo mundo vê o mesmo quadro.";
    ta.value = net.state.notes.get(it.id) ?? "";
    let t: any;
    ta.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => net.note(it.id, ta.value), 300); });
    ta.addEventListener("keydown", (e) => e.stopPropagation());
    const unsub = net.$(net.state).notes.onChange((v: string, k: string) => { if (k === it.id && v !== ta.value && document.activeElement !== ta) ta.value = v; });
    body.appendChild(ta);
    const hint = document.createElement("p"); hint.className = "muted small"; hint.textContent = "Salvo automaticamente e sincronizado com todo mundo.";
    body.appendChild(hint);
    (body as any)._cleanup = unsub;
  }
  $("#modal").hidden = false;
}
function closeModal() {
  const body = $("#modal-body") as any;
  body._cleanup?.(); body._cleanup = null;
  body.innerHTML = "";
  $("#modal").hidden = true;
}

// --------------------------------------------------------------------- build
let buildLayer: "floor" | "objects" = "objects";
let buildTile: number = O.WALL;
let tilesetCanvas: HTMLCanvasElement | null = null;
function initBuild() {
  $("#build-panel").querySelectorAll<HTMLButtonElement>("[data-layer]").forEach((b) => b.addEventListener("click", () => {
    buildLayer = b.dataset.layer as any;
    buildTile = buildLayer === "floor" ? F.WOOD : O.WALL;
    $("#build-panel").querySelectorAll("[data-layer]").forEach((x) => x.classList.toggle("active", x === b));
    renderPalette();
    bus.emit("ui:build", { active: true, layer: buildLayer, tile: buildTile });
  }));
  bus.on("build:hover", (t: { x: number; y: number }) => { $("#build-coords").textContent = `tile ${t.x}, ${t.y}`; });
}
function toggleBuild(show?: boolean) {
  const panel = $("#build-panel");
  const active: boolean = show === undefined ? !!panel.hidden : show;
  panel.hidden = !active;
  $('#toolbar button[data-action="build"]').classList.toggle("active", active);
  if (active) renderPalette();
  bus.emit("ui:build", { active, layer: buildLayer, tile: buildTile });
}
function renderPalette() {
  if (!tilesetCanvas) tilesetCanvas = drawTileset(document.createElement("canvas"));
  const pal = $("#build-palette");
  pal.innerHTML = "";
  const ids = buildLayer === "floor" ? Object.values(F).filter((v) => v !== F.NONE) : Object.values(O);
  const names = buildLayer === "floor" ? FLOOR_NAMES : OBJECT_NAMES;
  for (const id of ids) {
    const b = document.createElement("button");
    const c = document.createElement("canvas");
    c.width = TILE; c.height = TILE;
    c.getContext("2d")!.drawImage(tilesetCanvas, (id % TILESET_COLS) * TILE, Math.floor(id / TILESET_COLS) * TILE, TILE, TILE, 0, 0, TILE, TILE);
    b.appendChild(c);
    b.appendChild(document.createTextNode(names[id] ?? String(id)));
    b.classList.toggle("active", id === buildTile);
    b.addEventListener("click", () => { buildTile = id; renderPalette(); bus.emit("ui:build", { active: true, layer: buildLayer, tile: id }); });
    pal.appendChild(b);
  }
}

// ------------------------------------------------------------------- minimap
function startMinimap() {
  const canvas = $<HTMLCanvasElement>("#minimap");
  const draw = () => {
    if (canvas.hidden || !scene) return;
    const m = scene.mapData;
    const sx = canvas.width / m.width, sy = canvas.height / m.height;
    const c = canvas.getContext("2d")!;
    for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
      const o = m.objects[y * m.width + x];
      c.fillStyle = TILE_COLORS[o || m.floor[y * m.width + x]] ?? "#000";
      c.fillRect(x * sx, y * sy, sx, sy);
    }
    for (const z of m.zones) { c.fillStyle = z.color + "88"; c.fillRect(z.x * sx, z.y * sy, z.w * sx, z.h * sy); }
    for (const p of net.state.players.values()) {
      c.fillStyle = p.id === net.sessionId ? "#fff" : p.color;
      c.fillRect(p.x * sx - 1, p.y * sy - 1, sx + 2, sy + 2);
    }
  };
  canvas.addEventListener("click", (e) => {
    if (!scene) return;
    const r = canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * scene.mapData.width);
    const y = Math.floor(((e.clientY - r.top) / r.height) * scene.mapData.height);
    bus.emit("ui:goto", { x, y });
  });
  setInterval(draw, 400);
  draw();
}
