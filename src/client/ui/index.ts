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
import { setMuted, isMuted, sfx } from "./notify";
import { startCoach } from "./coach";
import { initAgenda } from "./agenda";
import { initMural } from "./mural";
import { initStats } from "./stats";
import { initMedia } from "./media";
import { REACTIONS, STATUS_META } from "../../shared/messages";
import type { WeatherView } from "../scenes/fx";
import { auth } from "../api";
import type { SpaceInfo } from "../api";

let scene: OfficeScene | null = null;

export function initUI(space: SpaceInfo) {
  $("#hud").hidden = false;
  net.spaceInfo = space;
  bus.on("scene:ready", (s: OfficeScene) => { scene = s; });

  // ---- top bar
  $("#space-name").textContent = space.name;
  if (space.logoUrl) { const img = document.createElement("img"); img.id = "space-logo"; img.src = space.logoUrl; img.alt = ""; $("#space-name").prepend(img); }
  renderMapSelect(space.maps);
  bus.on("maps:changed", renderMapSelect);
  bus.on("map:switched", () => { renderMapSelect(net.welcome.maps); $("#zone-indicator").textContent = "Área comum"; });
  $<HTMLSelectElement>("#map-select").addEventListener("change", (e) => { const id = (e.target as HTMLSelectElement).value; if (id && id !== net.state.mapId) net.switchMap(id); });
  $("#me-button").textContent = net.me?.name ?? "";
  $("#me-button").addEventListener("click", () => bus.emit("ui:profile"));
  let statusTimer: any = null;
  const statusSel = $<HTMLSelectElement>("#status-select");
  statusSel.addEventListener("change", (e) => {
    const v = (e.target as HTMLSelectElement).value;
    clearTimeout(statusTimer);
    if (v === "__custom") {
      const text = prompt("Status (texto livre, até 60 caracteres):", net.me?.statusText ?? "") ?? "";
      net.setStatus(net.me?.status === "__custom" ? "available" : net.me?.status ?? "available", text);
      auth.update({ statusText: text }).catch(() => {});
      statusSel.value = net.me?.status && net.me.status !== "__custom" ? net.me.status : "available";
      return;
    }
    net.setStatus(v);
    const auto = STATUS_META[v]?.autoMinutes;
    if (auto) { toast(`${STATUS_META[v].icon} ${STATUS_META[v].label}: volta para disponível em ${auto} min`); statusTimer = setTimeout(() => { net.setStatus("available"); statusSel.value = "available"; toast("Status voltou para disponível"); }, auto * 60000); }
  });
  bus.on("latency", (ms: number) => { $("#latency").textContent = `${ms} ms`; });
  const WX_ICON: Record<string, string> = { clear: "☀️", cloudy: "⛅", fog: "🌫️", rain: "🌧️", storm: "⛈️", snow: "❄️" };
  let lastWeather: WeatherView | null = null;
  const renderClock = (w: WeatherView | null) => {
    lastWeather = w ?? lastWeather;
    const el = $("#clock");
    const tz = lastWeather?.timezone;
    let time = "--:--";
    try { time = new Intl.DateTimeFormat("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(new Date()); } catch { time = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
    el.querySelector(".time")!.textContent = time;
    if (lastWeather) {
      const night = !lastWeather.isDay && lastWeather.kind === "clear";
      el.querySelector(".wx")!.textContent = night ? "🌙" : (WX_ICON[lastWeather.kind] ?? "⛅");
      el.querySelector(".temp")!.textContent = `${lastWeather.temp}° · ${lastWeather.city}${lastWeather.source === "simulado" ? " (simulado)" : ""}`;
      el.title = `${lastWeather.city}: ${lastWeather.kind}, ${lastWeather.temp}°C, umidade ${lastWeather.humidity ?? "-"}%, vento ${lastWeather.wind ?? "-"} km/h. Nasce ${lastWeather.sunrise}, põe ${lastWeather.sunset}. Fonte: ${lastWeather.source}.`;
    }
  };
  bus.on("weather", renderClock);
  bus.on("clock", renderClock);
  renderClock(null);
  bus.on("me:moved", (info: { spotlight: boolean; zone: Zone | null }) => {
    const e = $("#zone-indicator");
    if (info.spotlight) { e.textContent = "🎤 Spotlight: todos ouvem você"; e.style.background = "#854d0e"; }
    else if (info.zone) { e.textContent = `🔒 ${info.zone.name}`; e.style.background = info.zone.color + "66"; }
    else { e.textContent = "Área comum"; e.style.background = ""; }
  });
  bus.on("zone", (z: { id: string; name: string }) => toast(z.id ? `Você entrou em ${z.name}` : "Você saiu da zona privada"));
  bus.on("portal", async (p: { mapId: string; mapName: string; x: number; y: number }) => { sfx("portal"); toast(`Indo para ${p.mapName}…`, 1500); await net.switchMap(p.mapId, p.x, p.y); });
  bus.on("system", (m: { text: string }) => { if (/entrou em/.test(m.text)) sfx("join"); });
  bus.on("ghost", (g: boolean) => { $('#toolbar button[data-action="ghost"]').classList.toggle("active", g); toast(g ? "👻 Modo fantasma: você atravessa pessoas" : "Modo fantasma desligado", 1500); });
  if (!net.canBuild) $('#toolbar button[data-action="build"]').hidden = true; else $('#toolbar button[data-action="build"]').hidden = false;
  $('#toolbar button[data-action="stats"]').hidden = !net.canBuild;
  const rbar = $("#reaction-bar");
  for (const r of REACTIONS) { const b = document.createElement("button"); b.textContent = r.icon; b.title = r.label; b.addEventListener("click", () => { net.reaction(r.id); rbar.hidden = true; }); rbar.appendChild(b); }
  bus.on("reaction", (m: { id: string; name: string }) => { if (m.name !== net.me?.name) toast(`${REACTIONS.find((r) => r.id === m.id)?.icon ?? ""} ${m.name}`, 1500); });

  // ---- toolbar
  document.querySelectorAll<HTMLButtonElement>("#toolbar button").forEach((b) => b.addEventListener("click", () => {
    sfx("click");
    const a = b.dataset.action!;
    if (a === "avatar") openProfile();
    if (a === "chat") togglePanel("chat");
    if (a === "participants") togglePanel("participants");
    if (a === "members") bus.emit("ui:toggle-members");
    if (a === "agenda") bus.emit("ui:toggle-agenda");
    if (a === "mural") bus.emit("ui:toggle-mural");
    if (a === "stats") bus.emit("ui:toggle-stats");
    if (a === "reactions") { $("#reaction-bar").hidden = !$("#reaction-bar").hidden; }
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
    $("#help").hidden = true; $("#player-card").hidden = true; $("#emote-bar").hidden = true; $("#reaction-bar").hidden = true;
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
  initAgenda(space.slug);
  initMural(space.slug);
  initStats(space.slug);
  initMedia(space.slug);
  initJoystick();
  startMinimap();

  $("#build-tools").querySelectorAll<HTMLButtonElement>("[data-brush]").forEach((b) => b.addEventListener("click", () => {
    $("#build-tools").querySelectorAll("[data-brush]").forEach((x) => x.classList.toggle("active", x === b));
    bus.emit("ui:build", { brush: Number(b.dataset.brush) });
  }));
  $("#build-undo").addEventListener("click", () => bus.emit("ui:undo"));
  bus.on("ui:toggle-help", () => {});
  startCoach();

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
    <label class="row"><input type="checkbox" name="mute" ${isMuted() ? "checked" : ""} /> Silenciar sons</label>
    <div class="row"><button class="primary">Salvar</button><button data-a="tour">Rever o tour</button><button data-a="logout">Sair da conta</button></div></div>`);
  wrap.querySelector('[data-a="tour"]')!.addEventListener("click", () => { closeModal(); startCoach(true); });
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
