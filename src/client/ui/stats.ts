import { bus } from "../bus";
import { spaces } from "../api";
import { $, esc, el } from "./common";

let slug = "";
export function initStats(spaceSlug: string) {
  slug = spaceSlug;
  bus.on("ui:toggle-stats", () => { const p = $("#stats"); p.hidden = !p.hidden; if (!p.hidden) render(); });
}
async function render() {
  const body = $("#stats-body");
  body.innerHTML = `<p class="muted small">carregando…</p>`;
  try {
    const { stats: s, modLog } = await spaces.stats(slug);
    const maxHour = Math.max(1, ...s.byHour.map((h: any) => h.n));
    body.innerHTML = "";
    body.appendChild(el(`<div class="kpis">
      <div class="kpi"><b>${s.visits24h}</b><span>pessoas hoje</span></div><div class="kpi"><b>${s.visits7d}</b><span>na semana</span></div>
      <div class="kpi"><b>${s.minutes7d}</b><span>min na semana</span></div><div class="kpi"><b>${s.messages7d}</b><span>mensagens (7d)</span></div>
      <div class="kpi"><b>${s.members}</b><span>membros</span></div><div class="kpi"><b>${s.messages}</b><span>mensagens total</span></div></div>`));
    body.appendChild(el(`<div class="form"><b>Por hora (7 dias)</b><div class="bars">${Array.from({ length: 24 }, (_, h) => { const n = s.byHour.find((x: any) => x.hour === h)?.n ?? 0; return `<div class="bar" title="${h}h: ${n}"><i style="height:${Math.round((n / maxHour) * 100)}%"></i><span>${h}</span></div>`; }).join("")}</div></div>`));
    body.appendChild(el(`<div class="form"><b>Salas mais usadas</b><ul class="list">${s.byMap.map((m: any) => `<li><span class="grow">${esc(m.name ?? "?")}</span><span class="meta">${m.visits} visitas · ${Math.round((m.ms ?? 0) / 60000)} min</span></li>`).join("") || '<li class="muted small">sem dados</li>'}</ul></div>`));
    body.appendChild(el(`<div class="form"><b>Quem mais fala</b><ul class="list">${s.topChatters.map((c: any) => `<li><span class="grow">${esc(c.name)}</span><span class="meta">${c.n}</span></li>`).join("") || '<li class="muted small">sem dados</li>'}</ul></div>`));
    body.appendChild(el(`<div class="form"><b>Log de moderação</b><ul class="list">${modLog.slice(0, 30).map((l: any) => `<li><div class="grow"><b>${esc(l.actor_name)}</b> ${esc(l.action)} ${l.target_name ? "→ " + esc(l.target_name) : ""} ${l.detail ? `<span class="muted">(${esc(l.detail)})</span>` : ""}<div class="meta">${new Date(l.created_at).toLocaleString("pt-BR")}</div></div></li>`).join("") || '<li class="muted small">nenhuma ação ainda</li>'}</ul></div>`));
  } catch (e: any) { body.innerHTML = `<p class="error">${esc(e.message)}</p>`; }
}
