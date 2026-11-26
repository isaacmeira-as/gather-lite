import Phaser from "phaser";
import { net } from "./net";
import { OfficeScene } from "./scenes/OfficeScene";
import { initUI } from "./ui/index";
import { bus } from "./bus";
import { drawAvatarSheet, SKINS, AV_W, AV_H } from "./textures/avatars";

const COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"];
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

let color = COLORS[Math.floor(Math.random() * COLORS.length)];
let skin = Math.floor(Math.random() * SKINS.length);
try {
  const saved = JSON.parse(localStorage.getItem("gather-lite:profile") ?? "null");
  if (saved) { $<HTMLInputElement>("#login-name").value = saved.name ?? ""; color = saved.color ?? color; skin = saved.skin ?? skin; }
} catch {}

// Allow ?name=&color=&skin= for quick joins (used by tests too).
const qs = new URLSearchParams(location.search);
if (qs.get("name")) $<HTMLInputElement>("#login-name").value = qs.get("name")!;
if (qs.get("color")) color = "#" + qs.get("color")!.replace("#", "");
if (qs.get("skin")) skin = Number(qs.get("skin")) || 0;

function renderPickers() {
  const cs = $("#login-colors");
  cs.innerHTML = "";
  for (const c of COLORS) {
    const d = document.createElement("div");
    d.className = "swatch" + (c === color ? " active" : "");
    d.style.background = c;
    d.addEventListener("click", () => { color = c; renderPickers(); });
    cs.appendChild(d);
  }
  const ss = $("#login-skins");
  ss.innerHTML = "";
  SKINS.forEach((s, i) => {
    const d = document.createElement("div");
    d.className = "skin" + (i === skin ? " active" : "");
    d.textContent = s.name;
    d.addEventListener("click", () => { skin = i; renderPickers(); });
    ss.appendChild(d);
  });
  const sheet = drawAvatarSheet(document.createElement("canvas"), skin, color);
  const pv = $<HTMLCanvasElement>("#login-preview");
  const ctx = pv.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, pv.width, pv.height);
  ctx.drawImage(sheet, 0, 0, AV_W, AV_H, 0, 0, AV_W * 2, AV_H * 2);
}
renderPickers();

$<HTMLFormElement>("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $<HTMLInputElement>("#login-name").value.trim();
  if (!name) return;
  const btn = $<HTMLButtonElement>("#login-submit");
  btn.disabled = true; btn.textContent = "Conectando…";
  $("#login-error").textContent = "";
  try {
    localStorage.setItem("gather-lite:profile", JSON.stringify({ name, color, skin }));
  } catch {}
  try {
    await net.join({ name, color, skin });
    (window as any).__net = net; (window as any).__bus = bus;
    bus.on("scene:ready", (s) => ((window as any).__scene = s));
    $("#login").hidden = true;
    initUI();
    new Phaser.Game({
      type: Phaser.AUTO,
      parent: "game",
      backgroundColor: "#0b1220",
      pixelArt: true,
      scale: { mode: Phaser.Scale.RESIZE, width: "100%", height: "100%" },
      scene: [OfficeScene],
      audio: { noAudio: true },
    });
  } catch (err: any) {
    console.error(err);
    $("#login-error").textContent = "Não foi possível conectar ao servidor: " + (err?.message ?? err);
    btn.disabled = false; btn.textContent = "Entrar";
  }
});

if (qs.get("autojoin") === "1") $<HTMLFormElement>("#login-form").requestSubmit();
