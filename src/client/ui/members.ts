import { net } from "../net";
import { bus } from "../bus";
import { spaces } from "../api";
import { $, esc, el, toast, ROLE_LABEL } from "./common";

let slug = "";
export function initMembers(spaceSlug: string) {
  slug = spaceSlug;
  bus.on("ui:toggle-members", () => { const p = $("#members"); p.hidden = !p.hidden; if (!p.hidden) render(); });
}

async function render() {
  const body = $("#members-body");
  body.innerHTML = `<p class="muted small">carregando…</p>`;
  const canMod = net.canBuild;
  const [{ members, bans }, inv] = await Promise.all([spaces.members(slug), canMod ? spaces.invites(slug) : Promise.resolve({ invites: [] })]);
  body.innerHTML = "";
  if (canMod) {
    const box = el(`<div class="col"><b>Convites</b><div class="row"><select name="role"><option value="member">membro</option><option value="guest">visitante</option>${net.role === "owner" ? '<option value="moderator">moderador</option>' : ""}</select>
      <select name="exp"><option value="">sem validade</option><option value="24">24 h</option><option value="168">7 dias</option></select><button class="sm primary">Gerar link</button></div><ul class="list inv"></ul></div>`);
    box.querySelector("button")!.addEventListener("click", async () => {
      const role = (box.querySelector('[name="role"]') as HTMLSelectElement).value;
      const exp = (box.querySelector('[name="exp"]') as HTMLSelectElement).value;
      const { token } = await spaces.createInvite(slug, role, exp ? Number(exp) : undefined);
      const link = `${location.origin}/invite/${token}`;
      try { await navigator.clipboard.writeText(link); toast("Link copiado!"); } catch { toast("Link gerado"); }
      render();
    });
    const ul = box.querySelector("ul.inv")!;
    for (const i of inv.invites) {
      const link = `${location.origin}/invite/${i.token}`;
      const li = el(`<li><div class="grow"><div class="invite-link">${esc(link)}</div><span class="muted small">${ROLE_LABEL[i.role]} · ${i.uses} uso(s)${i.expiresAt ? " · expira " + new Date(i.expiresAt).toLocaleDateString("pt-BR") : ""}</span></div><button class="sm" data-a="copy">📋</button><button class="sm danger" data-a="rev">×</button></li>`);
      li.querySelector('[data-a="copy"]')!.addEventListener("click", async () => { try { await navigator.clipboard.writeText(link); toast("Copiado"); } catch {} });
      li.querySelector('[data-a="rev"]')!.addEventListener("click", async () => { await spaces.revokeInvite(slug, i.token); render(); });
      ul.appendChild(li);
    }
    body.appendChild(box);
    if (net.role === "owner") {
      const priv = el(`<div class="col" style="margin-top:12px"><b>Espaço</b><label class="row"><input type="checkbox" ${net.spaceInfo?.isPrivate ? "checked" : ""} /> Privado (só entra com convite)</label><button class="sm danger">Apagar espaço</button></div>`);
      priv.querySelector("input")!.addEventListener("change", async (e) => { const { space } = await spaces.update(slug, { isPrivate: (e.target as HTMLInputElement).checked }); net.spaceInfo = space; toast(space.isPrivate ? "Espaço agora é privado" : "Espaço agora é público"); });
      priv.querySelector("button")!.addEventListener("click", async () => { if (confirm("Apagar este espaço e todas as salas? Não dá para desfazer.") && prompt("Digite APAGAR para confirmar") === "APAGAR") { await spaces.remove(slug); location.href = "/"; } });
      body.appendChild(priv);
    }
  }
  const mb = el(`<div class="col" style="margin-top:12px"><b>Membros (${members.length})</b><ul class="list"></ul></div>`);
  const ul = mb.querySelector("ul")!;
  const online = new Set([...net.state.players.values()].map((p) => p.userId));
  for (const m of members) {
    const li = el(`<li><span class="dot" style="background:${online.has(m.id) ? "#22c55e" : "#4b5563"}"></span><span class="grow">${esc(m.name)}${m.isGuest ? ' <span class="muted small">(visitante)</span>' : ""} <span class="role ${m.role}">${ROLE_LABEL[m.role]}</span></span></li>`);
    if (canMod && m.role !== "owner" && m.id !== net.welcome.userId && !(m.role === "moderator" && net.role !== "owner")) {
      const sel = el(`<select class="sm"><option value="guest">visitante</option><option value="member">membro</option>${net.role === "owner" ? '<option value="moderator">moderador</option>' : ""}</select>`) as HTMLSelectElement;
      sel.value = m.role;
      sel.addEventListener("change", async () => { await spaces.setRole(slug, m.id, sel.value); toast("Papel atualizado"); });
      const kick = el(`<button class="sm danger" title="Remover">×</button>`);
      kick.addEventListener("click", async () => { if (confirm(`Remover ${m.name} do espaço?`)) { await spaces.kick(slug, m.id); render(); } });
      const banb = el(`<button class="sm danger" title="Banir">🚫</button>`);
      banb.addEventListener("click", async () => { if (confirm(`Banir ${m.name}?`)) { await spaces.kick(slug, m.id, true); render(); } });
      li.append(sel, kick, banb);
    }
    ul.appendChild(li);
  }
  body.appendChild(mb);
  if (canMod && bans.length) {
    const bb = el(`<div class="col" style="margin-top:12px"><b>Banidos</b><ul class="list"></ul></div>`);
    for (const b of bans) {
      const li = el(`<li><span class="grow">${esc(b.name ?? b.id)} <span class="muted small">${esc(b.reason ?? "")}</span></span><button class="sm">Desbanir</button></li>`);
      li.querySelector("button")!.addEventListener("click", async () => { await spaces.unban(slug, b.id); render(); });
      bb.querySelector("ul")!.appendChild(li);
    }
    body.appendChild(bb);
  }
}
