import { net } from "../net";
import { bus } from "../bus";
import { spaces } from "../api";
import { $, esc, el, toast } from "./common";
import { beep } from "./notify";

let slug = "";
const fmt = (ts: number) => new Date(ts).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function initAgenda(spaceSlug: string) {
  slug = spaceSlug;
  bus.on("ui:toggle-agenda", () => { const p = $("#agenda"); p.hidden = !p.hidden; if (!p.hidden) render(); });
  bus.on("refresh", (m: { what: string }) => { if (m.what === "events" && !$("#agenda").hidden) render(); });
  bus.on("event:reminder", (e: { id: string; title: string; startsAt: number; mapId: string | null; zoneId: string | null }) => {
    beep("summon");
    toast(`📅 ${e.title} começa às ${new Date(e.startsAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`, 10000, e.mapId ? { label: "Ir para a sala", onClick: () => goTo(e.mapId!, e.zoneId) } : undefined);
  });
}

async function goTo(mapId: string, zoneId: string | null) {
  if (mapId !== net.state.mapId) await net.switchMap(mapId);
  const scene = (window as any).__scene;
  const z = zoneId ? scene?.mapData.zones.find((z: any) => z.id === zoneId) : null;
  if (z) bus.emit("ui:goto", { x: z.x + Math.floor(z.w / 2), y: z.y + Math.floor(z.h / 2) });
}

async function render() {
  const body = $("#agenda-body");
  body.innerHTML = `<p class="muted small">carregando…</p>`;
  const { events } = await spaces.events(slug);
  body.innerHTML = "";
  const maps = net.welcome.maps;
  const scene = (window as any).__scene;
  const canCreate = net.role !== "guest";
  if (canCreate) {
    const now = new Date(); now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0);
    const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const f = el(`<form class="form"><b>Nova reunião</b>
      <label>Título <input name="title" required maxlength="80" placeholder="Daily, 1:1, review…" /></label>
      <div class="row"><label style="flex:1">Início <input name="start" type="datetime-local" value="${local(now)}" required /></label><label>Duração <select name="dur"><option value="15">15 min</option><option value="30" selected>30 min</option><option value="60">1 h</option><option value="120">2 h</option></select></label></div>
      <label>Sala <select name="zone"><option value="">sem sala</option>${maps.map((m) => (m.id === net.state.mapId ? (scene?.mapData.zones ?? []).map((z: any) => `<option value="${m.id}|${z.id}">${esc(m.name)} › ${esc(z.name)}</option>`).join("") : `<option value="${m.id}|">${esc(m.name)}</option>`)).join("")}</select></label>
      <label>Descrição <textarea name="desc" rows="2" maxlength="2000"></textarea></label>
      <div class="row"><button class="primary sm">Agendar</button></div><p class="error"></p></form>`);
    f.querySelectorAll("input, textarea").forEach((i) => i.addEventListener("keydown", (e) => e.stopPropagation()));
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const v = (n: string) => (f.querySelector(`[name="${n}"]`) as HTMLInputElement).value;
      const startsAt = new Date(v("start")).getTime();
      const [mapId, zoneId] = v("zone").split("|");
      try { await spaces.createEvent(slug, { title: v("title"), description: v("desc"), mapId: mapId || undefined, zoneId: zoneId || undefined, startsAt, endsAt: startsAt + Number(v("dur")) * 60000 }); toast("Reunião agendada"); render(); }
      catch (ex: any) { f.querySelector(".error")!.textContent = ex.message; }
    });
    body.appendChild(f);
  }
  const ul = el(`<ul class="list"></ul>`);
  if (!events.length) ul.appendChild(el(`<li class="muted small">Nada agendado. ${canCreate ? "Crie a primeira reunião acima." : ""}</li>`));
  for (const ev of events) {
    const live = ev.starts_at <= Date.now() && ev.ends_at >= Date.now();
    const zoneName = ev.zone_id ? (scene?.mapData.zones.find((z: any) => z.id === ev.zone_id)?.name ?? ev.zone_id) : "";
    const mapName = maps.find((m) => m.id === ev.map_id)?.name ?? "";
    const li = el(`<li class="${live ? "live" : ""}"><div class="grow"><div><b>${live ? "🔴 " : ""}${esc(ev.title)}</b></div><div class="meta">${fmt(ev.starts_at)} → ${new Date(ev.ends_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}${mapName ? " · " + esc(mapName) : ""}${zoneName ? " › " + esc(zoneName) : ""} · por ${esc(ev.created_by_name ?? "")}</div>${ev.description ? `<div class="small">${esc(ev.description)}</div>` : ""}</div>
      ${ev.map_id ? '<button class="sm" data-a="go">Entrar</button>' : ""}${ev.created_by === net.welcome.userId || net.canBuild ? '<button class="sm danger" data-a="del">×</button>' : ""}</li>`);
    li.querySelector('[data-a="go"]')?.addEventListener("click", () => goTo(ev.map_id, ev.zone_id));
    li.querySelector('[data-a="del"]')?.addEventListener("click", async () => { await spaces.deleteEvent(slug, ev.id); render(); });
    ul.appendChild(li);
  }
  body.appendChild(ul);
}
