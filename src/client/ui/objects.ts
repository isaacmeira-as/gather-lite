import { net } from "../net";
import { bus } from "../bus";
import { $, esc, toast, el } from "./common";
import { beep } from "./notify";
import type { Interactable } from "../../shared/map";

let cleanup: (() => void) | null = null;

export function initObjects() {
  bus.on("interactable", (it: Interactable | null) => {
    const hint = $("#interact-hint");
    hint.hidden = !it;
    if (it) hint.querySelector("span")!.textContent = it.title;
  });
  bus.on("interact", (it: Interactable) => openInteractable(it));
  $("#modal-close").addEventListener("click", closeModal);
  $("#modal").addEventListener("click", (e) => { if (e.target === $("#modal")) closeModal(); });
}

export function openModal(title: string, body: HTMLElement | string, onClose?: () => void) {
  closeModal();
  $("#modal-title").textContent = title;
  const b = $("#modal-body");
  if (typeof body === "string") b.innerHTML = body; else b.appendChild(body);
  cleanup = onClose ?? null;
  $("#modal").hidden = false;
}
export function closeModal() {
  cleanup?.(); cleanup = null;
  $("#modal-body").innerHTML = "";
  $("#modal").hidden = true;
}

export function openInteractable(it: Interactable) {
  switch (it.kind) {
    case "emote": net.interact(it.id); toast(`${it.emote} ${it.title}`); return;
    case "link": window.open(it.url, "_blank"); return;
    case "note": openModal(it.title, `<pre>${esc(it.text ?? "")}</pre>`); return;
    case "image": openModal(it.title, `<img src="${esc(it.url ?? "")}" alt="${esc(it.title)}" /><p class="muted small center"><a href="${esc(it.url ?? "")}" target="_blank">abrir original</a></p>`); return;
    case "iframe": openModal(it.title, `<iframe src="${esc(it.url ?? "")}" allow="autoplay; fullscreen; camera; microphone" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe><p class="muted small">Se a página não carregar aqui, <a href="${esc(it.url ?? "")}" target="_blank">abra em nova aba</a>.</p>`); return;
    case "board": return openBoard(it);
    case "poll": return openPoll(it);
    case "timer": return openTimer(it);
  }
}

function openBoard(it: Interactable) {
  const ta = document.createElement("textarea");
  ta.placeholder = "Escreva aqui. Todo mundo vê o mesmo quadro.";
  ta.value = net.state.notes.get(it.id) ?? "";
  let t: any;
  ta.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => net.note(it.id, ta.value), 300); });
  ta.addEventListener("keydown", (e) => e.stopPropagation());
  const unsub = net.$(net.state).notes.onChange((v: string, k: string) => { if (k === it.id && v !== ta.value && document.activeElement !== ta) ta.value = v; });
  const wrap = el(`<div></div>`);
  wrap.appendChild(ta);
  wrap.appendChild(el(`<p class="muted small">Salvo automaticamente e sincronizado com todo mundo.</p>`));
  openModal(it.title, wrap, unsub);
}

function openPoll(it: Interactable) {
  const options = it.options ?? [];
  const wrap = el(`<div><p><b>${esc(it.text ?? "")}</b></p><div class="poll-options"></div><p class="muted small poll-total"></p></div>`);
  const box = wrap.querySelector(".poll-options")!;
  const render = () => {
    let st: any = {};
    try { st = JSON.parse(net.state.objectState.get(`poll:${it.id}`) ?? "{}"); } catch {}
    const votes: Record<string, number> = st.votes ?? {};
    const counts = options.map((_, i) => Object.values(votes).filter((v) => v === i).length);
    const total = counts.reduce((a, b) => a + b, 0);
    const mine = votes[net.welcome.userId];
    box.innerHTML = "";
    options.forEach((o, i) => {
      const pct = total ? Math.round((counts[i] / total) * 100) : 0;
      const d = el(`<div class="poll-option ${mine === i ? "mine" : ""}"><div class="bar" style="width:${pct}%"></div><span>${esc(o)}</span><span class="count">${counts[i]} · ${pct}%</span></div>`);
      d.addEventListener("click", () => net.send("poll:vote", { id: it.id, option: i }));
      box.appendChild(d);
    });
    wrap.querySelector(".poll-total")!.textContent = `${total} voto${total === 1 ? "" : "s"}`;
  };
  if (net.canBuild) { const b = el(`<button class="sm">Zerar enquete</button>`); b.addEventListener("click", () => net.send("poll:reset", { id: it.id })); wrap.appendChild(b); }
  render();
  const unsub = net.$(net.state).objectState.onChange((_v: string, k: string) => { if (k === `poll:${it.id}`) render(); });
  openModal(it.title, wrap, unsub);
}

function openTimer(it: Interactable) {
  const wrap = el(`<div class="center"><div class="timer-display">25:00</div><div class="row" style="justify-content:center"><input type="number" min="1" max="1440" value="25" style="width:80px" /> min <button class="primary" data-t="start">▶ Iniciar</button><button data-t="stop">⏸ Pausar</button><button data-t="reset">↺ Zerar</button></div><p class="muted small">Todo mundo nesta sala vê o mesmo timer.</p></div>`);
  const display = wrap.querySelector(".timer-display") as HTMLElement;
  const minutes = wrap.querySelector("input") as HTMLInputElement;
  minutes.addEventListener("keydown", (e) => e.stopPropagation());
  let doneBeeped = false;
  const read = () => { try { return JSON.parse(net.state.objectState.get(`timer:${it.id}`) ?? "null") ?? { running: false, endsAt: 0, remaining: 25 * 60 }; } catch { return { running: false, endsAt: 0, remaining: 25 * 60 }; } };
  const tick = () => {
    const st = read();
    const secs = st.running ? Math.max(0, Math.round((st.endsAt - Date.now()) / 1000)) : st.remaining;
    display.textContent = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
    display.classList.toggle("done", st.running && secs === 0);
    if (st.running && secs === 0 && !doneBeeped) { doneBeeped = true; beep("timer"); }
    if (secs > 0) doneBeeped = false;
  };
  wrap.querySelectorAll<HTMLButtonElement>("[data-t]").forEach((b) => b.addEventListener("click", () => {
    const action = b.dataset.t as any;
    const seconds = Math.max(1, Number(minutes.value) || 25) * 60;
    net.send("timer", { id: it.id, action, seconds: action === "start" && !read().running && read().remaining === 25 * 60 ? seconds : action === "reset" ? seconds : undefined });
  }));
  tick();
  const iv = setInterval(tick, 250);
  const unsub = net.$(net.state).objectState.onChange((_v: string, k: string) => { if (k === `timer:${it.id}`) tick(); });
  openModal(it.title, wrap, () => { clearInterval(iv); unsub(); });
}
