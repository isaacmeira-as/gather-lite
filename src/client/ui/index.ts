import { net } from "../net";
import { bus } from "../bus";
import { EMOTES } from "../../shared/messages";
import type { Zone } from "../../shared/map";
import { drawTileset, TILE_COLORS } from "../textures/tiles";
import type { OfficeScene } from "../scenes/OfficeScene";
import { $, toast, el } from "./common";
import { initChat, togglePanel } from "./chat";
import { initParticipants } from "./participants";
import { initObjects, openModal, closeModal } from "./objects";
import { initBuild, toggleBuild } from "./build";
import { initMembers } from "./members";
import { initJoystick } from "./joystick";
import { avatarEditor } from "./avatar";
import { setMuted, isMuted } from "./notify";
import { auth } from "../api";
import type { SpaceInfo } from "../api";

let scene: OfficeScene | null = null;

export function initUI(space: SpaceInfo) {
  $("#hud").hidden = false;
  net.spaceInfo = space;
  bus.on("scene:ready", (s: OfficeScene) => { scene = s; });

  // ---- top bar
  $("#space-name").textContent = space.name;
  renderMapSelect(space.maps);
  bus.on("maps:changed", renderMapSelect);
  bus.on("map:switched", () => { renderMapSelect(net.welcome.maps); $("#zone-indicator").textContent = "Área comum"; });
  $<HTMLSelectElement>("#map-select").addEventListener("change", (e) => { const id = (e.target as HTMLSelectElement).value; if (id && id !== net.state.mapId) net.switchMap(id); });
  $("#me-button").textContent = net.me?.name ?? "";
  $("#me-button").addEventListener("click", () => bus.emit("ui:profile"));
  $<HTMLSelectElement>("#status-select").addEventListener("change", (e) => net.setStatus((e.target as HTMLSelectElement).value));
  bus.on("latency", (ms: number) => { $("#latency").textContent = `${ms} ms`; });
  bus.on("me:moved", (info: { spotlight: boolean; zone: Zone | null }) => {
    const e = $("#zone-indicator");
    if (info.spotlight) { e.textContent = "🎤 Spotlight: todos ouvem você"; e.style.background = "#854d0e"; }
    else if (info.zone) { e.textContent = `🔒 ${info.zone.name}`; e.style.background = info.zone.color + "66"; }
    else { e.textContent = "Área comum"; e.style.background = ""; }
  });
  bus.on("zone", (z: { id: string; name: string }) => toast(z.id ? `Você entrou em ${z.name}` : "Você saiu da zona privada"));
  bus.on("portal", async (p: { mapId: string; mapName: string; x: number; y: number }) => { toast(`Indo para ${p.mapName}…`, 1500); await net.switchMap(p.mapId, p.x, p.y); });
  bus.on("ghost", (g: boolean) => { $('#toolbar button[data-action="ghost"]').classList.toggle("active", g); toast(g ? "👻 Modo fantasma: você atravessa pessoas" : "Modo fantasma desligado", 1500); });
  if (!net.canBuild) $('#toolbar button[data-action="build"]').hidden = true; else $('#toolbar button[data-action="build"]').hidden = false;

  // ---- toolbar
  document.querySelectorAll<HTMLButtonElement>("#toolbar button").forEach((b) => b.addEventListener("click", () => {
    const a = b.dataset.action!;
    if (a === "avatar") openProfile();
    if (a === "chat") togglePanel("chat");
    if (a === "participants") togglePanel("participants");
    if (a === "members") bus.emit("ui:toggle-members");
    if (a === "build") toggleBuild();
    if (a === "emotes") toggleEmotes();
    if (a === "minimap") toggleMinimap();
    if (a === "ghost") net.ghost(!net.me?.ghost);
    if (a === "help") $("#help").hidden = !$("#help").hidden;
  }));
  document.querySelectorAll<HTMLButtonElement>("[data-close]").forEach((b) => b.addEventListener("click", () => { const id = b.dataset.close!; if (id === "build") toggleBuild(false); else $(`#${id}`).hidden = true; }));
  $("#help-close").addEventListener("click", () => ($("#help").hidden = true));
  bus.on("ui:toggle-participants", () => togglePanel("participants"));
  bus.on("ui:toggle-emotes", () => toggleEmotes());
  bus.on("ui:toggle-minimap", () => toggleMinimap());
  bus.on("ui:toggle-help", () => ($("#help").hidden = !$("#help").hidden));
  bus.on("ui:escape", () => { closeModal(); $("#help").hidden = true; $("#player-card").hidden = true; $("#emote-bar").hidden = true; if (!$("#build-panel").hidden) toggleBuild(false); });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!$("#modal").hidden) { closeModal(); e.stopPropagation(); }
    $("#help").hidden = true; $("#player-card").hidden = true; $("#emote-bar").hidden = true;
  }, true);
  bus.on("toast", (t: string) => toast(t));
  bus.on("ui:profile", openProfile);

  // ---- emotes
  const bar = $("#emote-bar");
  EMOTES.forEach((e, i) => {
    const b = document.createElement("button");
    b.innerHTML = `${e}<small>${i + 1}</small>`;
    b.addEventListener("click", () => { net.emote(e); bar.hidden = true; });
    bar.appendChild(b);
  });
  bus.on("ui:emote-index", (i: number) => { if (EMOTES[i]) net.emote(EMOTES[i]); });

  initChat(space.slug);
  initParticipants(() => scene);
  initObjects();
  initBuild(space.slug);
  initMembers(space.slug);
  initJoystick();
  startMinimap();

  bus.on("disconnected", (code: number) => { toast(`Conexão encerrada (${code}). Recarregue a página.`, 10000); $("#zone-indicator").textContent = "⚠️ desconectado"; });
}

function renderMapSelect(maps: { id: string; name: string }[]) {
  const sel = $<HTMLSelectElement>("#map-select");
  sel.innerHTML = maps.map((m) => `<option value="${m.id}">${m.name}</option>`).join("");
  sel.value = net.state.mapId;
}
function toggleEmotes() { $("#emote-bar").hidden = !$("#emote-bar").hidden; }
function toggleMinimap() { $("#minimap").hidden = !$("#minimap").hidden; document.body.classList.toggle("minimap", !$("#minimap").hidden); }

function openProfile() {
  const me = net.me!;
  let avatar: any = {};
  try { avatar = JSON.parse(me.avatar); } catch {}
  const wrap = el(`<div class="col"><label>Nome <input name="name" maxlength="24" value="" /></label><div class="editor"></div>
    <label class="row"><input type="checkbox" name="mute" ${isMuted() ? "checked" : ""} /> Silenciar sons de notificação</label>
    <div class="row"><button class="primary">Salvar</button><button data-a="logout">Sair da conta</button></div></div>`);
  (wrap.querySelector('[name="name"]') as HTMLInputElement).value = me.name;
  wrap.querySelector("input")!.addEventListener("keydown", (e) => e.stopPropagation());
  const ed = avatarEditor(wrap.querySelector(".editor") as HTMLElement, avatar, () => {});
  wrap.querySelector("button.primary")!.addEventListener("click", async () => {
    const name = (wrap.querySelector('[name="name"]') as HTMLInputElement).value.trim() || me.name;
    setMuted((wrap.querySelector('[name="mute"]') as HTMLInputElement).checked);
    net.send("profile", { name, avatar: ed.get() });
    try { await auth.update({ name, avatar: ed.get() }); } catch {}
    $("#me-button").textContent = name;
    closeModal();
    toast("Perfil salvo");
  });
  wrap.querySelector('[data-a="logout"]')!.addEventListener("click", () => { localStorage.removeItem("gather-lite:token"); location.href = "/"; });
  openModal("Seu personagem", wrap);
}

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
    for (const p of m.portals) { c.fillStyle = "#d8b4fe"; c.fillRect(p.x * sx, p.y * sy, sx, sy); }
    for (const p of net.state.players.values()) { c.fillStyle = p.id === net.sessionId ? "#fff" : p.color; c.fillRect(p.x * sx - 1, p.y * sy - 1, sx + 2, sy + 2); }
  };
  canvas.addEventListener("click", (e) => {
    if (!scene) return;
    const r = canvas.getBoundingClientRect();
    bus.emit("ui:goto", { x: Math.floor(((e.clientX - r.left) / r.width) * scene.mapData.width), y: Math.floor(((e.clientY - r.top) / r.height) * scene.mapData.height) });
  });
  setInterval(draw, 400);
}
