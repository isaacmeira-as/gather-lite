export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
export const esc = (s: any) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
export const el = (html: string) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild as HTMLElement; };

export function toast(text: string, ms = 2600, action?: { label: string; onClick: () => void }) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = text;
  if (action) {
    const b = document.createElement("button"); b.className = "sm primary"; b.textContent = action.label;
    b.addEventListener("click", () => { action.onClick(); t.remove(); });
    t.appendChild(b);
  }
  $("#toasts").appendChild(t);
  setTimeout(() => t.remove(), ms);
  return t;
}

export const ROLE_LABEL: Record<string, string> = { owner: "dono", moderator: "mod", member: "membro", guest: "visitante" };
export const STATUS_LABEL: Record<string, string> = { available: "disponível", busy: "ocupado", dnd: "não perturbe" };
