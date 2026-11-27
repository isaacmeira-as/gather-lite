// Proximity audio/video with LiveKit. Joins the LiveKit room named after the player's
// conversation group (computed by the server) and leaves when the group changes.
import { net } from "../net";
import { bus } from "../bus";
import { spaces } from "../api";
import { $, esc, el, toast } from "./common";

type LK = typeof import("livekit-client");
let lk: LK | null = null;
let room: import("livekit-client").Room | null = null;
let currentGroup = "";
let slug = "";
let wantMic = false, wantCam = false, wantScreen = false;
let enabled = false;

export function initMedia(spaceSlug: string) {
  slug = spaceSlug;
  enabled = !!net.welcome.media;
  const bar = $("#media-bar");
  bar.hidden = false;
  const set = (sel: string, on: boolean) => $(sel, bar).classList.toggle("active", on);
  $("#mic").addEventListener("click", async () => { if (!ensure()) return; wantMic = !wantMic; set("#mic", wantMic); await room?.localParticipant.setMicrophoneEnabled(wantMic); });
  $("#cam").addEventListener("click", async () => { if (!ensure()) return; wantCam = !wantCam; set("#cam", wantCam); await room?.localParticipant.setCameraEnabled(wantCam); });
  $("#screen").addEventListener("click", async () => { if (!ensure()) return; wantScreen = !wantScreen; set("#screen", wantScreen); await room?.localParticipant.setScreenShareEnabled(wantScreen); });
  if (!enabled) { bar.title = "Áudio e vídeo não configurados neste servidor (defina LIVEKIT_URL, LIVEKIT_API_KEY e LIVEKIT_API_SECRET)."; bar.classList.add("disabled"); }
  bus.on("scene:ready", () => watchGroup());
  bus.on("map:switched", () => { currentGroup = ""; leave(); watchGroup(); });
}

function ensure() {
  if (!enabled) { toast("Áudio e vídeo não estão configurados neste servidor."); return false; }
  return true;
}

function watchGroup() {
  const me = net.me; if (!me) return;
  const apply = (g: string) => { if (g !== currentGroup) { currentGroup = g; switchRoom(g); } $("#media-group").textContent = g ? (g.startsWith("zone") ? "🔒 sala" : g.startsWith("stage") ? "🎤 palco" : "👥 por perto") : "sozinho"; };
  net.$(me).listen("mediaGroup", (g: string) => apply(g));
  apply(me.mediaGroup ?? "");
}

async function switchRoom(group: string) {
  await leave();
  if (!group || !enabled) return;
  try {
    lk ??= await import("livekit-client");
    const { token, url } = await spaces.mediaToken(slug, group);
    room = new lk.Room({ adaptiveStream: true, dynacast: true });
    room.on(lk.RoomEvent.TrackSubscribed, (track, _pub, participant) => attach(track, participant.identity, participant.name ?? participant.identity));
    room.on(lk.RoomEvent.TrackUnsubscribed, (track) => track.detach().forEach((e) => e.remove()));
    room.on(lk.RoomEvent.ParticipantDisconnected, (p) => document.querySelectorAll(`[data-pid="${CSS.escape(p.identity)}"]`).forEach((e) => e.remove()));
    room.on(lk.RoomEvent.ActiveSpeakersChanged, (speakers) => { document.querySelectorAll<HTMLElement>("#media-tiles .tile").forEach((t) => t.classList.toggle("speaking", speakers.some((s) => s.identity === t.dataset.pid))); });
    await room.connect(url, token);
    if (wantMic) await room.localParticipant.setMicrophoneEnabled(true);
    if (wantCam) await room.localParticipant.setCameraEnabled(true);
    room.localParticipant.on("trackPublished" as any, (pub: any) => { if (pub.track?.kind === "video") attach(pub.track, "me", "Você"); });
  } catch (e: any) { toast("Falha ao conectar áudio/vídeo: " + e.message); }
}

function attach(track: any, pid: string, name: string) {
  const tiles = $("#media-tiles");
  if (track.kind === "audio") { const a = track.attach(); a.dataset.pid = pid; a.style.display = "none"; tiles.appendChild(a); return; }
  let tile = tiles.querySelector(`.tile[data-pid="${CSS.escape(pid)}"]`) as HTMLElement | null;
  if (!tile) { tile = el(`<div class="tile" data-pid="${esc(pid)}"><span>${esc(name)}</span></div>`); tiles.appendChild(tile); }
  const v = track.attach(); v.muted = pid === "me"; tile.prepend(v);
}

async function leave() {
  if (room) { try { await room.disconnect(); } catch {} room = null; }
  $("#media-tiles").innerHTML = "";
}
