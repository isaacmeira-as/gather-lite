export type ChatScope = "nearby" | "everyone" | "dm" | "spotlight" | "zone";

export interface ChatIn {
  text: string;
  scope?: "nearby" | "everyone" | "dm";
  to?: string;
}

export interface ChatOut {
  id: number;
  from: string;
  fromUserId?: string;
  fromName: string;
  fromColor: string;
  text: string;
  scope: ChatScope;
  to?: string;
  toUserId?: string;
  toName?: string;
  ts: number;
}

export interface SystemOut {
  text: string;
  ts: number;
}

export interface BuildIn {
  layer: "floor" | "objects";
  x: number;
  y: number;
  tile: number;
}

export const STATUSES = ["available", "busy", "dnd", "meeting", "lunch", "focus", "away"] as const;
export const STATUS_META: Record<string, { label: string; icon: string; color: string; autoMinutes?: number }> = {
  available: { label: "Disponível", icon: "🟢", color: "#22c55e" },
  busy: { label: "Ocupado", icon: "🟡", color: "#f59e0b" },
  dnd: { label: "Não perturbe", icon: "🔴", color: "#ef4444" },
  meeting: { label: "Em reunião", icon: "📅", color: "#8b5cf6" },
  lunch: { label: "Almoço", icon: "🍽️", color: "#f97316", autoMinutes: 60 },
  focus: { label: "Foco", icon: "🎧", color: "#06b6d4", autoMinutes: 50 },
  away: { label: "Ausente", icon: "⚪", color: "#9ca3af" },
};
export const REACTIONS = [{ id: "confetti", icon: "🎉", label: "Confete" }, { id: "hearts", icon: "💖", label: "Corações" }, { id: "fire", icon: "🔥", label: "Fogo" }, { id: "clap", icon: "👏", label: "Palmas" }, { id: "balloons", icon: "🎈", label: "Balões" }];
export type Status = (typeof STATUSES)[number];
export const EMOTES = ["👋", "👍", "❤️", "😂", "🎉", "🤔", "☕", "🎵", "💧"];
