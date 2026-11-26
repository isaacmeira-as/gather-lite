import { net } from "../net";
import { bus } from "../bus";
import { spaces } from "../api";
import { $, esc, toast } from "./common";
import { beep, setBadge, getBadge } from "./notify";

let dmTarget: string | null = null;
let unread = 0;
export const getDmTarget = () => dmTarget;

export function initChat(slug: string) {
  const form = $<HTMLFormElement>("#chat-form");
  const input = $<HTMLInputElement>("#chat-input");
  const scopeSel = $<HTMLSelectElement>("#chat-scope");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    if (dmTarget) net.chat(text, "dm", dmTarget); else net.chat(text, scopeSel.value as any);
    input.value = "";
  });
  input.addEventListener("keydown", (e) => { if (e.key === "Escape") { input.blur(); togglePanel("chat", false); } e.stopPropagation(); });
  bus.on("ui:focus-chat", () => { togglePanel("chat", true); input.focus(); });
  $("#chat-dm-cancel").addEventListener("click", (e) => { e.preventDefault(); setDm(null); });

  bus.on("chat", (m) => {
    const mine = m.from === net.sessionId;
    addMessage(renderMessage(m, mine), m.scope);
    if (!mine) {
      if ($("#chat").hidden) { unread++; updateChatBadge(); }
      if (m.scope === "dm" || document.hidden) { beep("message"); if (document.hidden) setBadge(getBadge() + 1); }
    }
  });
  bus.on("system", (m) => addMessage(esc(m.text), "system"));
  bus.on("map:switched", () => addMessage(`Você entrou em ${esc(net.state.mapName)}`, "system"));

  // History from the database (everything this user was allowed to see).
  spaces.history(slug).then(({ messages }) => {
    if (!messages.length) return;
    const box = $("#chat-messages");
    const frag = document.createDocumentFragment();
    for (const m of messages) {
      const d = document.createElement("div");
      d.className = `msg history ${m.scope}`;
      d.innerHTML = renderMessage({ ...m, from: m.from === net.welcome.userId ? net.sessionId : m.from }, m.from === net.welcome.userId, true);
      frag.appendChild(d);
    }
    const sep = document.createElement("div"); sep.className = "msg system"; sep.textContent = "— histórico —";
    box.prepend(sep); box.prepend(frag);
  }).catch(() => {});
}

function readable(hex: string) {
  // Dark shirts (e.g. #111827) are unreadable on the dark chat background.
  const n = parseInt((hex ?? "").replace("#", ""), 16);
  if (Number.isNaN(n)) return "#93c5fd";
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum < 0.3 ? "#93c5fd" : hex;
}
function renderMessage(m: any, mine: boolean, history = false) {
  const toName = m.toName ?? net.state.players.get(m.to)?.name ?? "?";
  const scopeLabel: Record<string, string> = { nearby: "perto", zone: "zona", everyone: "todos", spotlight: "🎤 spotlight", dm: mine ? "para " + esc(toName) : "direta" };
  const time = history ? `<span class="scope">${new Date(m.ts).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>` : "";
  return `<span class="who" style="color:${esc(readable(m.fromColor))}">${esc(mine ? "Você" : m.fromName)}</span><span class="scope">${scopeLabel[m.scope] ?? esc(m.scope)}</span>${time} ${esc(m.text)}`;
}

export function addMessage(html: string, cls = "") {
  const box = $("#chat-messages");
  const e = document.createElement("div");
  e.className = `msg ${cls}`;
  e.innerHTML = html;
  box.appendChild(e);
  while (box.children.length > 400) box.firstChild?.remove();
  box.scrollTop = box.scrollHeight;
}
function updateChatBadge() { $('#toolbar button[data-action="chat"]').textContent = unread ? `💬${unread}` : "💬"; }

export function setDm(id: string | null) {
  dmTarget = id;
  const row = $("#chat-dm");
  row.hidden = !id;
  if (id) row.querySelector("b")!.textContent = net.state.players.get(id)?.name ?? "?";
  $("#chat-scope").hidden = !!id;
}

export function togglePanel(id: string, show?: boolean) {
  const e = $(`#${id}`);
  e.hidden = show === undefined ? !e.hidden : !show;
  if (id === "chat" && !e.hidden) { unread = 0; updateChatBadge(); $("#chat-messages").scrollTop = 1e9; }
}
