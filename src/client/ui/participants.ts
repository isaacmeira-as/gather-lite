import { net } from "../net";
import { bus } from "../bus";
import { $, esc, toast, ROLE_LABEL, STATUS_LABEL } from "./common";
import { setDm, togglePanel } from "./chat";
import { beep } from "./notify";
import type { OfficeScene } from "../scenes/OfficeScene";

let scene: OfficeScene | null = null;

export function initParticipants(getScene: () => OfficeScene | null) {
  bus.on("scene:ready", (s: OfficeScene) => { scene = s; renderParticipants(); });
  bus.on("players", renderParticipants);
  bus.on("nearby", (ids: string[], arrived: string[]) => {
    $("#nearby-list").textContent = ids.length ? ids.map((i) => net.state.players.get(i)?.name).filter(Boolean).join(", ") : "ninguém";
    if (arrived?.length) {
      const names = arrived.map((i) => net.state.players.get(i)?.name).filter(Boolean);
      if (names.length && net.me?.status !== "dnd") { beep("nearby"); toast(`${names.join(", ")} chegou perto de você`, 2000); }
    }
    renderParticipants();
  });
  bus.on("ui:player-card", (id: string) => openPlayerCard(id));
  bus.on("ui:locate-done", () => { toast("Você chegou!"); renderParticipants(); });
  bus.on("follow:changed", (id: string | null) => {
    const pill = $("#follow-pill");
    pill.hidden = !id;
    if (id) pill.querySelector("b")!.textContent = net.state.players.get(id)?.name ?? "?";
    renderParticipants();
  });
  $("#follow-stop").addEventListener("click", (e) => { e.preventDefault(); bus.emit("ui:follow", null); });
  bus.on("wave", (m: { from: string; name: string }) => { beep("wave"); toast(`👋 ${m.name} acenou para você`, 3000, { label: "Acenar de volta", onClick: () => net.send("wave", { to: m.from }) }); });
  bus.on("summon", (m: { from: string; name: string; x: number; y: number; mapId: string }) => {
    beep("summon");
    toast(`📣 ${m.name} está chamando você`, 8000, { label: "Ir até lá", onClick: async () => {
      if (m.mapId !== net.state.mapId) { await net.switchMap(m.mapId, m.x, m.y); return; }
      bus.emit("ui:goto", { x: m.x, y: m.y });
    } });
  });
  bus.on("kicked", (m: { ban: boolean; reason: string }) => {
    alert(m.ban ? `Você foi banido deste espaço. ${m.reason}` : `Você foi removido da sala. ${m.reason}`);
    location.href = "/";
  });
}

export function renderParticipants() {
  if (!net.state) return;
  const list = $("#participants-list");
  const players = [...net.state.players.values()].sort((a, b) => (a.id === net.sessionId ? -1 : b.id === net.sessionId ? 1 : a.name.localeCompare(b.name)));
  $("#participants-count").textContent = `(${players.length})`;
  list.innerHTML = players.map((p) => {
    const zone = p.zone ? scene?.mapData.zones.find((z) => z.id === p.zone)?.name : "";
    const near = scene?.nearbyIds.has(p.id);
    return `<li data-id="${p.id}" class="${p.connected ? "" : "away"}">
      <span class="dot" style="background:${esc(p.color)}"></span>
      <div style="flex:1"><div>${esc(p.name)} ${p.id === net.sessionId ? '<span class="you">(você)</span>' : ""} <span class="role ${p.role}">${ROLE_LABEL[p.role] ?? p.role}</span> ${near ? "👂" : ""} ${p.ghost ? "👻" : ""}</div>
      <div class="meta">${STATUS_LABEL[p.status] ?? p.status}${zone ? " · " + esc(zone) : ""}${p.connected ? "" : " · reconectando…"}</div></div>
      ${scene?.locateTarget === p.id ? "📍" : ""}${scene?.followTarget === p.id ? "🚶" : ""}
    </li>`;
  }).join("");
  list.querySelectorAll<HTMLLIElement>("li").forEach((li) => li.addEventListener("click", () => { if (li.dataset.id !== net.sessionId) openPlayerCard(li.dataset.id!); else bus.emit("ui:profile"); }));
}

export function openPlayerCard(id: string) {
  const p = net.state.players.get(id);
  if (!p) return;
  const card = $("#player-card");
  card.dataset.id = id;
  card.querySelector(".pc-name")!.textContent = p.name;
  const zone = p.zone ? scene?.mapData.zones.find((z) => z.id === p.zone)?.name : "área comum";
  card.querySelector(".pc-meta")!.textContent = `${ROLE_LABEL[p.role] ?? p.role} · ${STATUS_LABEL[p.status] ?? p.status} · ${zone}`;
  const actions = card.querySelector(".pc-actions") as HTMLElement;
  actions.innerHTML = "";
  const add = (label: string, fn: () => void, cls = "") => { const b = document.createElement("button"); b.textContent = label; b.className = cls; b.addEventListener("click", () => { fn(); card.hidden = true; }); actions.appendChild(b); };
  add("📍 Localizar", () => { bus.emit("ui:locate", id); toast(`Siga a linha amarela até ${p.name}`); });
  add("🚶 Seguir", () => bus.emit("ui:follow", id));
  add("✉️ Mensagem", () => { setDm(id); togglePanel("chat", true); $<HTMLInputElement>("#chat-input").focus(); });
  add("👋 Acenar", () => net.send("wave", { to: id }));
  add("📣 Chamar aqui", () => { net.send("summon", { to: id }); toast(`Pedido enviado para ${p.name}`); });
  const myRole = net.role;
  const canMod = myRole === "owner" || myRole === "moderator";
  const targetProtected = p.role === "owner" || (p.role === "moderator" && myRole !== "owner");
  if (canMod && !targetProtected) {
    if (myRole === "owner" && p.role !== "moderator") add("◆ Tornar moderador", () => net.send("role", { to: id, role: "moderator" }));
    if (p.role === "moderator" || p.role === "guest") add("Tornar membro", () => net.send("role", { to: id, role: "member" }));
    add("⛔ Remover", () => { if (confirm(`Remover ${p.name} da sala?`)) net.send("kick", { to: id }); }, "danger");
    add("🚫 Banir", () => { const reason = prompt(`Motivo do banimento de ${p.name}:`) ?? ""; net.send("kick", { to: id, ban: true, reason }); }, "danger");
  }
  add("Fechar", () => {});
  card.hidden = false;
}
