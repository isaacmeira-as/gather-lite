import Phaser from "phaser";
import { net } from "./net";
import { bus } from "./bus";
import { OfficeScene } from "./scenes/OfficeScene";
import { initUI } from "./ui/index";
import { spaces, getToken, setToken, ApiError } from "./api";
import { renderHome, renderInvite, authBox, currentUser } from "./pages/home";
import { $, el, esc } from "./ui/common";
import { avatarEditor } from "./ui/avatar";
import { normalizeAvatar } from "../shared/avatar";

const PICKED_KEY = "gather-lite:picked";
/** Gather-style "choose your character" screen shown before entering a space. */
function characterPicker(user: any, spaceName: string): Promise<void> {
  return new Promise((resolve) => {
    const ov = el(`<div class="overlay"><div class="card"><h1>Seu personagem</h1><p class="muted">Como você quer aparecer em <b>${esc(spaceName)}</b>? Dá para mudar depois no botão 🧑 da barra.</p>
      <label>Nome <input name="name" maxlength="24" /></label><div class="editor"></div>
      <button class="primary wide-btn" style="margin-top:12px">Entrar</button><p class="error"></p></div></div>`);
    (ov.querySelector('[name="name"]') as HTMLInputElement).value = user.name;
    const ed = avatarEditor(ov.querySelector(".editor") as HTMLElement, normalizeAvatar(user.avatar), () => {});
    ov.querySelector("button.primary")!.addEventListener("click", async () => {
      const { auth } = await import("./api");
      const name = (ov.querySelector('[name="name"]') as HTMLInputElement).value.trim() || user.name;
      try { await auth.update({ name, avatar: ed.get() }); } catch (e: any) { ov.querySelector(".error")!.textContent = e.message; return; }
      try { localStorage.setItem(PICKED_KEY, "1"); } catch {}
      ov.remove();
      resolve();
    });
    app.appendChild(ov);
  });
}

const app = $("#app");
let game: Phaser.Game | null = null;

async function route() {
  const path = location.pathname;
  const m = path.match(/^\/s\/([a-z0-9-]+)\/?$/);
  const inv = path.match(/^\/invite\/([A-Za-z0-9_-]+)\/?$/);
  if (m) return enterSpace(m[1]);
  if (inv) return renderInvite(app, inv[1]);
  return renderHome(app);
}

async function enterSpace(slug: string) {
  app.innerHTML = "";
  // ?guest=Name lets tests/links join a public space without the login form.
  const qs = new URLSearchParams(location.search);
  let user = await currentUser();
  if (!user && qs.get("guest")) {
    const { auth } = await import("./api");
    const r = await auth.guest(qs.get("guest")!); setToken(r.token); user = r.user;
    if (qs.get("avatar")) { try { await auth.update({ avatar: JSON.parse(qs.get("avatar")!) }); } catch {} }
  }
  if (!user) {
    const box = el(`<div class="overlay" style="position:static;min-height:100vh"></div>`);
    app.appendChild(box);
    await authBox(box, { allowGuest: true, title: "Entrar no espaço", intro: "Entre com sua conta ou como visitante." });
    return enterSpace(slug);
  }
  let info;
  try { info = (await spaces.get(slug)).space; }
  catch (e: any) {
    const msg = e instanceof ApiError && e.body?.isPrivate ? `"${e.body.name}" é privado. Peça um link de convite para quem administra o espaço.` : e.message;
    app.appendChild(el(`<div class="overlay"><div class="card"><h1>Sem acesso</h1><p class="muted">${esc(msg)}</p><a href="/">voltar</a></div></div>`));
    return;
  }
  let picked = false;
  try { picked = localStorage.getItem(PICKED_KEY) === "1"; } catch {}
  if (!picked && !qs.get("guest")) await characterPicker(user, info.name);
  const mapId = qs.get("map") && info.maps.some((x) => x.id === qs.get("map")) ? qs.get("map")! : (info.maps.find((x) => x.is_default) ?? info.maps[0]).id;
  const loading = el(`<div class="overlay"><div class="card center"><p>Entrando em <b>${esc(info.name)}</b>…</p></div></div>`);
  app.appendChild(loading);
  try {
    await net.join({ spaceId: info.id, mapId });
  } catch (e: any) {
    loading.innerHTML = `<div class="card"><h1>Não foi possível entrar</h1><p class="muted">${esc(e?.message ?? e)}</p><a href="/">voltar</a></div>`;
    return;
  }
  app.innerHTML = "";
  (window as any).__net = net; (window as any).__bus = bus;
  bus.on("scene:ready", (s) => ((window as any).__scene = s));
  initUI(info);
  game = new Phaser.Game({
    type: Phaser.AUTO, parent: "game", backgroundColor: "#0b1220", pixelArt: true,
    scale: { mode: Phaser.Scale.RESIZE, width: "100%", height: "100%" },
    scene: [OfficeScene], audio: { noAudio: true }, input: { activePointers: 3 },
  });
  bus.on("map:switched", () => { history.replaceState(null, "", `/s/${slug}?map=${net.state.mapId}`); game!.scene.getScene("office").scene.restart(); });
}

route();
