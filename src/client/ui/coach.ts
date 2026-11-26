// First-visit onboarding: a short sequence of coach marks.
import { $ } from "./common";
const KEY = "gather-lite:coached";
const STEPS = [
  "👋 Bem-vindo! Use as <kbd>setas</kbd> ou <kbd>WASD</kbd> para andar. Também dá para clicar no chão.",
  "💬 Aperte <kbd>Enter</kbd> para falar. Quem está a até 4 tiles ouve você; nas salas coloridas, só quem está dentro.",
  "🧑 Clique em alguém para mandar mensagem, localizar, seguir ou chamar. <kbd>1</kbd>…<kbd>9</kbd> mandam emotes.",
  "✨ Chegue perto de um móvel com <kbd>X</kbd> piscando para usar: quadro, enquete, timer, TV… Os tiles roxos são portais.",
];
export function startCoach(force = false) {
  try { if (!force && localStorage.getItem(KEY) === "1") return; } catch {}
  const box = $("#coach");
  const text = box.querySelector(".coach-text")!;
  let i = 0;
  const show = () => { if (i >= STEPS.length) return done(); text.innerHTML = STEPS[i]; (box.querySelector('[data-c="next"]') as HTMLElement).textContent = i === STEPS.length - 1 ? "Entendi" : "Próximo"; box.hidden = false; };
  const done = () => { box.hidden = true; try { localStorage.setItem(KEY, "1"); } catch {} };
  box.querySelector('[data-c="next"]')!.addEventListener("click", () => { i++; show(); });
  box.querySelector('[data-c="skip"]')!.addEventListener("click", done);
  show();
}
