import { bus } from "../bus";
import { DIR } from "../../shared/tiles";

/** Touch joystick: emits bus "joystick" with a direction (or -1). */
export function initJoystick() {
  const isTouch = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
  if (!isTouch) return;
  document.body.classList.add("touch");
  const pad = document.getElementById("joystick")!;
  const stick = pad.querySelector(".stick") as HTMLElement;
  pad.hidden = false;
  let active = false;
  const center = () => { const r = pad.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 }; };
  const update = (cx: number, cy: number) => {
    const c = center();
    let dx = cx - c.x, dy = cy - c.y;
    const len = Math.hypot(dx, dy);
    const max = c.r - 20;
    if (len > max) { dx *= max / len; dy *= max / len; }
    stick.style.transform = `translate(${dx}px, ${dy}px)`;
    if (len < 12) { bus.emit("joystick", -1); return; }
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? DIR.RIGHT : DIR.LEFT) : dy > 0 ? DIR.DOWN : DIR.UP;
    bus.emit("joystick", dir);
  };
  pad.addEventListener("pointerdown", (e) => { active = true; pad.setPointerCapture(e.pointerId); update(e.clientX, e.clientY); });
  pad.addEventListener("pointermove", (e) => { if (active) update(e.clientX, e.clientY); });
  const end = () => { active = false; stick.style.transform = ""; bus.emit("joystick", -1); };
  pad.addEventListener("pointerup", end);
  pad.addEventListener("pointercancel", end);
}
