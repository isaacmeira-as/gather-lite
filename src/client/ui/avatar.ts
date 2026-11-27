import { AvatarConfig, SKIN_TONES, HAIR_STYLES, HAIR_COLORS, SHIRT_COLORS, PANTS_COLORS, ACCESSORIES, PETS, BODIES, normalizeAvatar } from "../../shared/avatar";
import { drawAvatarPreview } from "../textures/avatars";
import { el } from "./common";

/** Renders an avatar editor into `root`; calls onChange with every tweak. */
export function avatarEditor(root: HTMLElement, initial: AvatarConfig, onChange: (a: AvatarConfig) => void) {
  const cfg = normalizeAvatar(initial);
  root.innerHTML = "";
  const wrap = el(`<div class="avatar-editor"><div class="preview"><canvas></canvas></div><div class="opts"></div></div>`);
  root.appendChild(wrap);
  const canvas = wrap.querySelector("canvas") as HTMLCanvasElement;
  const opts = wrap.querySelector(".opts") as HTMLElement;

  const swatchRow = (label: string, colors: string[], get: () => number | string, set: (i: number, c: string) => void) => {
    const row = el(`<div><span class="label">${label}</span><div class="swatches"></div></div>`);
    const box = row.querySelector(".swatches")!;
    colors.forEach((c, i) => {
      const d = el(`<div class="swatch" style="background:${c}" title="${c}"></div>`);
      const cur = get();
      if (cur === i || cur === c) d.classList.add("active");
      d.addEventListener("click", () => { set(i, c); render(); });
      box.appendChild(d);
    });
    return row;
  };
  const chipRow = (label: string, items: string[], get: () => number, set: (i: number) => void) => {
    const row = el(`<div><span class="label">${label}</span><div class="row"></div></div>`);
    const box = row.querySelector(".row")!;
    items.forEach((name, i) => {
      const d = el(`<span class="chip ${get() === i ? "active" : ""}">${name}</span>`);
      d.addEventListener("click", () => { set(i); render(); });
      box.appendChild(d);
    });
    return row;
  };
  const render = () => {
    opts.innerHTML = "";
    opts.append(
      chipRow("Corpo", BODIES, () => cfg.body, (i) => (cfg.body = i)),
      swatchRow("Pele", SKIN_TONES, () => cfg.skin, (i) => (cfg.skin = i)),
      chipRow("Cabelo", HAIR_STYLES, () => cfg.hair, (i) => (cfg.hair = i)),
      swatchRow("Cor do cabelo", HAIR_COLORS, () => cfg.hairColor, (i) => (cfg.hairColor = i)),
      swatchRow("Camisa", SHIRT_COLORS, () => cfg.shirt, (_i, c) => (cfg.shirt = c)),
      swatchRow(cfg.body === 1 ? "Sapatos" : "Calça", PANTS_COLORS, () => cfg.pants, (i) => (cfg.pants = i)),
      chipRow("Acessório", ACCESSORIES, () => cfg.accessory, (i) => (cfg.accessory = i)),
      chipRow("Pet", PETS, () => cfg.pet, (i) => (cfg.pet = i)),
    );
    const custom = el(`<label class="row" style="margin:0;font-size:12px">Cor livre da camisa <input type="color" value="${cfg.shirt}" style="padding:0;width:36px;height:24px" /></label>`);
    custom.querySelector("input")!.addEventListener("input", (e) => { cfg.shirt = (e.target as HTMLInputElement).value; drawPreview(); onChange({ ...cfg }); });
    opts.appendChild(custom);
    drawPreview();
    onChange({ ...cfg });
  };
  const drawPreview = () => drawAvatarPreview(canvas, cfg, 3);
  render();
  return { get: () => ({ ...cfg }) };
}
