import { net } from "../net";
import { bus } from "../bus";
import { spaces } from "../api";
import { $, esc, el, toast } from "./common";

let slug = "";
export function initMural(spaceSlug: string) {
  slug = spaceSlug;
  bus.on("ui:toggle-mural", () => { const p = $("#mural"); p.hidden = !p.hidden; if (!p.hidden) render(); });
  bus.on("refresh", (m: { what: string }) => { if (m.what === "pins") { if (!$("#mural").hidden) render(); else toast("📌 Novo aviso no mural"); } });
}

/** Highlights @mentions; the one for the current user gets a stronger style. */
export function renderMentions(text: string, myName: string) {
  return esc(text).replace(/@([\p{L}\p{N}_.-]+)/gu, (m, name) => `<span class="mention ${name.toLowerCase() === myName.toLowerCase().split(" ")[0] || name.toLowerCase() === myName.toLowerCase() ? "me" : ""}">${m}</span>`);
}

async function render() {
  const body = $("#mural-body");
  body.innerHTML = `<p class="muted small">carregando…</p>`;
  const { pins } = await spaces.pins(slug);
  body.innerHTML = "";
  if (net.canBuild) {
    const f = el(`<form class="form"><textarea name="text" rows="2" maxlength="1000" placeholder="Novo aviso fixado para todo o espaço… use @nome para mencionar"></textarea><div class="row"><button class="primary sm">Fixar aviso</button></div></form>`);
    f.querySelector("textarea")!.addEventListener("keydown", (e) => e.stopPropagation());
    f.addEventListener("submit", async (e) => { e.preventDefault(); const t = (f.querySelector("textarea") as HTMLTextAreaElement).value.trim(); if (!t) return; await spaces.addPin(slug, t); render(); });
    body.appendChild(f);
  }
  const ul = el(`<ul class="list pins"></ul>`);
  if (!pins.length) ul.appendChild(el(`<li class="muted small">Nenhum aviso fixado.</li>`));
  for (const p of pins) {
    const li = el(`<li><div class="grow"><div class="pin-text">${renderMentions(p.text, net.me?.name ?? "")}</div><div class="meta">${esc(p.author_name)} · ${new Date(p.created_at).toLocaleString("pt-BR")}</div></div>${net.canBuild ? '<button class="sm danger">×</button>' : ""}</li>`);
    li.querySelector("button")?.addEventListener("click", async () => { await spaces.removePin(slug, p.id); render(); });
    ul.appendChild(li);
  }
  body.appendChild(ul);
  const search = el(`<div class="form"><b>Buscar no histórico</b><div class="row"><input name="q" placeholder="palavra ou nome…" style="flex:1" /><button class="sm">Buscar</button></div><ul class="list results"></ul></div>`);
  const input = search.querySelector("input") as HTMLInputElement;
  input.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); doSearch(); } });
  const doSearch = async () => {
    const { messages } = await spaces.search(slug, input.value.trim());
    const ul = search.querySelector("ul.results")!;
    ul.innerHTML = messages.length ? "" : `<li class="muted small">nada encontrado</li>`;
    for (const m of messages) ul.appendChild(el(`<li><div class="grow"><b style="color:${esc(m.fromColor)}">${esc(m.fromName)}</b> <span class="scope">${esc(m.scope)}</span> ${renderMentions(m.text, net.me?.name ?? "")}<div class="meta">${new Date(m.ts).toLocaleString("pt-BR")}</div></div></li>`));
  };
  search.querySelector("button")!.addEventListener("click", doSearch);
  body.appendChild(search);
}
