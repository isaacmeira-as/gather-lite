import { auth, spaces, getToken, setToken, User, ApiError } from "../api";
import { $, esc, el } from "../ui/common";
import { avatarEditor } from "../ui/avatar";
import { randomAvatar, normalizeAvatar } from "../../shared/avatar";
import { providers } from "../api";
import { drawAvatarPreview } from "../textures/avatars";
import { mapThumb } from "../ui/thumbs";

export async function currentUser(): Promise<User | null> {
  if (!getToken()) return null;
  try { return (await auth.me()).user; } catch { setToken(null); return null; }
}

/** Auth box (login / register / guest). Resolves with the user once logged in. */
let providerInfo: { google: boolean; password: boolean; guest: boolean; allowedDomains: string[] } | null = null;
async function getProviders() {
  if (!providerInfo) { try { providerInfo = await providers(); } catch { providerInfo = { google: false, password: true, guest: true, allowedDomains: [] }; } }
  return providerInfo;
}

/** Auth box (Google / login / register / guest). Resolves with the user once logged in. */
export function authBox(root: HTMLElement, opts: { allowGuest: boolean; title?: string; intro?: string }): Promise<User> {
  return new Promise(async (resolve) => {
    const prov = await getProviders();
    const guestOk = opts.allowGuest && prov.guest;
    const modes: ("guest" | "login" | "register")[] = [...(guestOk ? ["guest" as const] : []), ...(prov.password ? ["login" as const, "register" as const] : [])];
    let mode: "guest" | "login" | "register" | "google" = modes[0] ?? "google";
    const render = () => {
      root.innerHTML = "";
      const domainHint = prov.allowedDomains.length ? `Só e-mails ${prov.allowedDomains.map((d) => "@" + d).join(" ou ")}.` : "";
      const card = el(`<form class="card"><div class="login-hero"><canvas></canvas></div><h1>${esc(opts.title ?? "Gather Lite")}</h1><p class="muted">${esc(opts.intro ?? "Escritório virtual 2D para o seu time.")}</p>
        ${prov.google ? `<a class="google-btn" href="/api/auth/google"><span class="g">G</span> Entrar com Google</a><p class="muted small center">${esc(domainHint)}</p>` : ""}
        ${modes.length ? `<div class="auth-tabs">${modes.map((m) => `<button type="button" data-m="${m}">${m === "guest" ? "Visitante" : m === "login" ? "Entrar" : "Criar conta"}</button>`).join("")}</div><div class="fields"></div><button type="submit" class="primary wide-btn">Continuar</button>` : ""}
        ${!prov.google && !modes.length ? '<p class="error">Nenhum método de login está ativo neste servidor.</p>' : ""}<p class="error"></p></form>`);
      card.querySelectorAll<HTMLButtonElement>("[data-m]").forEach((b) => { b.classList.toggle("active", b.dataset.m === mode); b.addEventListener("click", () => { mode = b.dataset.m as any; render(); }); });
      const fields = card.querySelector(".fields");
      if (fields) {
        if (mode === "guest") fields.innerHTML = `<label>Seu nome <input name="name" required maxlength="24" autofocus /></label><p class="muted small">Entra sem cadastro. Para criar espaços e ter perfil permanente, crie uma conta.</p>`;
        if (mode === "login") fields.innerHTML = `<label>E-mail <input name="email" type="email" required autofocus /></label><label>Senha <input name="password" type="password" required minlength="6" /></label>`;
        if (mode === "register") fields.innerHTML = `<label>Nome <input name="name" required maxlength="24" autofocus /></label><label>E-mail <input name="email" type="email" required /></label><label>Senha <input name="password" type="password" required minlength="6" placeholder="mínimo 6 caracteres" /></label>`;
      }
      card.addEventListener("submit", async (e) => {
        e.preventDefault();
        const v = (n: string) => (card.querySelector(`[name="${n}"]`) as HTMLInputElement)?.value.trim();
        const err = card.querySelectorAll(".error")[card.querySelectorAll(".error").length - 1];
        err.textContent = "";
        try {
          const r = mode === "guest" ? await auth.guest(v("name")) : mode === "login" ? await auth.login(v("email"), v("password")) : await auth.register(v("email"), v("password"), v("name"));
          setToken(r.token);
          if (mode === "register" || mode === "guest") { try { await auth.update({ avatar: randomAvatar() }); r.user.avatar = (await auth.me()).user.avatar; } catch {} }
          resolve(r.user);
        } catch (ex: any) { err.textContent = ex.message; }
      });
      drawAvatarPreview(card.querySelector("canvas")!, randomAvatar(), 2);
      root.appendChild(card);
    };
    render();
  });
}

export async function renderHome(root: HTMLElement) {
  root.innerHTML = "";
  const user = await currentUser();
  if (!user) {
    const box = el(`<div class="overlay" style="position:static;min-height:100vh"></div>`);
    root.appendChild(box);
    await authBox(box, { allowGuest: false });
    return renderHome(root);
  }
  const page = el(`<div class="home"><header><h1>🏢 Gather Lite</h1><span class="muted">${esc(user.name)}${user.isGuest ? " (visitante)" : ""}</span><button class="sm" data-a="profile">🧑 Meu personagem</button><button class="sm" data-a="logout">Sair</button></header>
    <div class="hero"><canvas></canvas><div><h1>Olá, ${esc(user.name)}!</h1><p>Seu escritório virtual: ande, converse por proximidade, use os objetos e monte as salas do seu jeito.</p></div></div>
    <h2>Seus espaços</h2><div class="grid spaces"></div>
    ${user.isGuest ? '<p class="muted">Visitantes não criam espaços. <a href="#" data-a="logout">Crie uma conta</a> para ter o seu.</p>' : `<h2>Criar espaço</h2>
    <form class="card create row" style="max-width:none"><input name="name" placeholder="Nome do espaço" required maxlength="60" style="flex:1;min-width:160px" />
      <select name="template"><option value="office">Escritório + jardim</option><option value="coworking">Coworking</option><option value="classroom">Sala de aula</option><option value="event">Evento / auditório</option><option value="garden">Só jardim</option><option value="blank">Sala vazia</option></select>
      <label class="row" style="margin:0"><input type="checkbox" name="private" /> privado</label><button class="primary">Criar</button><p class="error" style="width:100%"></p></form>`}
    <h2>Tem um convite?</h2><form class="row invite"><input name="link" placeholder="Cole o link ou código do convite" style="flex:1;min-width:200px" /><button>Entrar</button></form></div>`);
  root.appendChild(page);
  drawAvatarPreview(page.querySelector(".hero canvas")!, normalizeAvatar(user.avatar), 2);
  page.querySelectorAll('[data-a="logout"]').forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); setToken(null); renderHome(root); }));
  page.querySelector('[data-a="profile"]')!.addEventListener("click", () => profileDialog(root, user));

  const grid = page.querySelector(".spaces")!;
  const { spaces: list } = await spaces.list();
  grid.innerHTML = list.length ? "" : `<p class="muted">Nenhum espaço ainda.</p>`;
  for (const s of list) {
    const c = el(`<div class="space-card"><canvas></canvas><div class="body"><div class="name">${esc(s.name)} ${s.isPrivate ? "🔒" : ""}</div><div class="muted small">/s/${esc(s.slug)} · ${s.members} membro(s) · você é ${esc(({ owner: "dono", moderator: "moderador", member: "membro", guest: "visitante" } as any)[s.role] ?? s.role)}</div></div></div>`);
    c.addEventListener("click", () => (location.href = `/s/${s.slug}`));
    grid.appendChild(c);
    spaces.get(s.slug).then(({ space }) => { const m = space.maps.find((x) => x.is_default) ?? space.maps[0]; return m ? spaces.map(s.slug, m.id) : null; }).then((r) => { if (r) mapThumb(c.querySelector("canvas")!, r.map.data); }).catch(() => {});
  }
  page.querySelector("form.create")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target as HTMLFormElement;
    const err = f.querySelector(".error")!;
    try {
      const { space } = await spaces.create((f.querySelector('[name="name"]') as HTMLInputElement).value, (f.querySelector('[name="template"]') as HTMLSelectElement).value, (f.querySelector('[name="private"]') as HTMLInputElement).checked);
      location.href = `/s/${space.slug}`;
    } catch (ex: any) { err.textContent = ex.message; }
  });
  page.querySelector("form.invite")!.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = (page.querySelector('[name="link"]') as HTMLInputElement).value.trim();
    const token = v.split("/invite/").pop()!.trim();
    if (token) location.href = `/invite/${token}`;
  });
}

export function profileDialog(root: HTMLElement, user: User) {
  const ov = el(`<div class="overlay"><div class="card"><h1>Seu personagem</h1><label>Nome <input name="name" maxlength="24" /></label><div class="editor"></div><div class="row" style="margin-top:12px"><button class="primary">Salvar</button><button data-a="cancel">Cancelar</button></div><p class="error"></p></div></div>`);
  (ov.querySelector('[name="name"]') as HTMLInputElement).value = user.name;
  const ed = avatarEditor(ov.querySelector(".editor") as HTMLElement, normalizeAvatar(user.avatar), () => {});
  ov.querySelector("button.primary")!.addEventListener("click", async () => {
    try { await auth.update({ name: (ov.querySelector('[name="name"]') as HTMLInputElement).value, avatar: ed.get() }); ov.remove(); renderHome(root); }
    catch (ex: any) { ov.querySelector(".error")!.textContent = ex.message; }
  });
  ov.querySelector('[data-a="cancel"]')!.addEventListener("click", () => ov.remove());
  document.body.appendChild(ov);
}

export async function renderInvite(root: HTMLElement, token: string) {
  root.innerHTML = "";
  let info;
  try { info = (await spaces.inviteInfo(token)).invite; } catch (e: any) { root.appendChild(el(`<div class="overlay"><div class="card"><h1>Convite inválido</h1><p class="muted">${esc(e.message)}</p><a href="/">voltar</a></div></div>`)); return; }
  let user = await currentUser();
  if (!user) {
    const box = el(`<div class="overlay" style="position:static;min-height:100vh"></div>`);
    root.appendChild(box);
    user = await authBox(box, { allowGuest: true, title: `Convite para ${info.name}`, intro: `Você vai entrar como ${info.role}. Entre com sua conta ou como visitante.` });
  }
  try {
    const { space } = await spaces.acceptInvite(token);
    location.href = `/s/${space.slug}`;
  } catch (e: any) {
    root.innerHTML = "";
    root.appendChild(el(`<div class="overlay"><div class="card"><h1>Não deu</h1><p class="muted">${esc(e.message)}</p><a href="/">voltar</a></div></div>`));
  }
}
