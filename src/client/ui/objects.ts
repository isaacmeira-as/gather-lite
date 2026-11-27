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
    case "game": return openTicTacToe(it);
    case "draw": return openDrawBoard(it);
    case "radio": return openRadio(it);
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

// ------------------------------------------------------------------ games
function openTicTacToe(it: Interactable) {
  const wrap = el(`<div class="center"><p class="muted small ttt-status"></p><div class="ttt"></div><div class="row" style="justify-content:center;margin-top:10px"><button class="sm" data-a="reset">↺ Reiniciar</button></div></div>`);
  const grid = wrap.querySelector(".ttt")!;
  const status = wrap.querySelector(".ttt-status")!;
  const read = () => { try { return JSON.parse(net.state.objectState.get(`ttt:${it.id}`) ?? "null") ?? { board: Array(9).fill(""), players: {}, turn: "X", winner: "" }; } catch { return { board: Array(9).fill(""), players: {}, turn: "X", winner: "" }; } };
  const render = () => {
    const g = read();
    grid.innerHTML = "";
    g.board.forEach((c: string, i: number) => { const d = el(`<button class="cell ${c ? "filled" : ""}">${c}</button>`); d.addEventListener("click", () => net.send("ttt:move", { id: it.id, cell: i })); grid.appendChild(d); });
    const me = net.welcome.userId;
    const mine = g.players.X === me ? "X" : g.players.O === me ? "O" : "";
    const names = g.names ?? {};
    status.textContent = g.winner === "draw" ? "Empate!" : g.winner ? `${names[g.winner] ?? g.winner} venceu! 🎉` : !g.players.X ? "Clique numa casa para jogar como X" : !g.players.O ? (mine ? "Esperando um adversário…" : "Clique para entrar como O") : `Vez de ${g.turn === "X" ? names.X : names.O}${mine === g.turn ? " (você)" : ""}`;
  };
  wrap.querySelector('[data-a="reset"]')!.addEventListener("click", () => net.send("ttt:reset", { id: it.id }));
  render();
  const unsub = net.$(net.state).objectState.onChange((_v: string, k: string) => { if (k === `ttt:${it.id}`) render(); });
  openModal(it.title, wrap, unsub);
}

function openDrawBoard(it: Interactable) {
  const W = 1000, H = 600;
  const wrap = el(`<div><div class="row draw-tools"><input type="color" value="#111827" /><select><option value="3">fino</option><option value="6" selected>médio</option><option value="14">grosso</option></select><button class="sm" data-a="eraser">🧽 Borracha</button><span class="spacer" style="flex:1"></span>${net.canBuild ? '<button class="sm danger" data-a="clear">Limpar tudo</button>' : ""}</div><canvas class="draw" width="${W}" height="${H}"></canvas><p class="muted small">Desenho compartilhado em tempo real com quem abrir esta lousa.</p></div>`);
  const canvas = wrap.querySelector("canvas") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  const color = wrap.querySelector("input[type=color]") as HTMLInputElement;
  const size = wrap.querySelector("select") as HTMLSelectElement;
  let eraser = false;
  const strokeOf = (s: any) => { ctx.strokeStyle = s.color; ctx.lineWidth = s.size; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.beginPath(); for (let i = 0; i < s.points.length; i += 2) { if (i === 0) ctx.moveTo(s.points[0], s.points[1]); else ctx.lineTo(s.points[i], s.points[i + 1]); } ctx.stroke(); };
  const redraw = () => { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H); let d: any = { strokes: [] }; try { d = JSON.parse(net.state.objectState.get(`draw:${it.id}`) ?? "null") ?? d; } catch {} d.strokes.forEach(strokeOf); };
  redraw();
  let pts: number[] = [];
  const pos = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); return [Math.round(((e.clientX - r.left) / r.width) * W), Math.round(((e.clientY - r.top) / r.height) * H)]; };
  canvas.addEventListener("pointerdown", (e) => { canvas.setPointerCapture(e.pointerId); pts = pos(e); });
  canvas.addEventListener("pointermove", (e) => { if (!pts.length) return; const p = pos(e); pts.push(...p); strokeOf({ points: pts.slice(-4), color: eraser ? "#ffffff" : color.value, size: Number(size.value) * (eraser ? 3 : 1) }); });
  const end = () => { if (pts.length >= 2) { if (pts.length === 2) pts.push(pts[0] + 1, pts[1]); const s = { id: it.id, points: pts.slice(0, 400), color: eraser ? "#ffffff" : color.value, size: Number(size.value) * (eraser ? 3 : 1) }; net.send("draw:stroke", s); } pts = []; };
  canvas.addEventListener("pointerup", end); canvas.addEventListener("pointercancel", end);
  wrap.querySelector('[data-a="eraser"]')!.addEventListener("click", (e) => { eraser = !eraser; (e.target as HTMLElement).classList.toggle("active", eraser); });
  wrap.querySelector('[data-a="clear"]')?.addEventListener("click", () => { if (confirm("Limpar a lousa para todo mundo?")) net.send("draw:clear", { id: it.id }); });
  const u1 = bus.on("draw:stroke", (m: any) => { if (m.id === it.id) strokeOf(m.stroke); });
  const u2 = bus.on("draw:clear", (m: any) => { if (m.id === it.id) redraw(); });
  openModal(it.title, wrap, () => { u1(); u2(); });
}

function openRadio(it: Interactable) {
  openModal(it.title, `<iframe src="${esc(it.url ?? "")}" allow="autoplay" sandbox="allow-scripts allow-same-origin allow-popups" style="height:40vh"></iframe><p class="muted small">Rádio do ambiente: toca enquanto esta janela estiver aberta. Minimize com Esc para parar.</p>`);
}
