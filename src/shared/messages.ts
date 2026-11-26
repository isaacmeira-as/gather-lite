export type ChatScope = "nearby" | "everyone" | "dm" | "spotlight" | "zone";

export interface ChatIn {
  text: string;
  scope?: "nearby" | "everyone" | "dm";
  to?: string;
}

export interface ChatOut {
  id: number;
  from: string;
  fromName: string;
  fromColor: string;
  text: string;
  scope: ChatScope;
  to?: string;
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

export const STATUSES = ["available", "busy", "dnd"] as const;
export type Status = (typeof STATUSES)[number];
export const EMOTES = ["👋", "👍", "❤️", "😂", "🎉", "🤔", "☕", "🎵", "💧"];
