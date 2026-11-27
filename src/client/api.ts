export interface User { id: string; name: string; email: string | null; isGuest: boolean; avatar: any }
export interface SpaceInfo { id: string; slug: string; name: string; isPrivate: boolean; ownerId: string; role: string | null; maps: { id: string; name: string; is_default: number }[]; location?: string; weatherMode?: string; timeMode?: string; logoUrl?: string | null }

const TOKEN_KEY = "gather-lite:token";
export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
export const setToken = (t: string | null) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {} };

export class ApiError extends Error { constructor(public status: number, message: string, public body: any = {}) { super(message); } }

export async function api<T = any>(method: string, path: string, body?: any): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? res.statusText, data);
  return data as T;
}

export const auth = {
  register: (email: string, password: string, name: string) => api<{ token: string; user: User }>("POST", "/auth/register", { email, password, name }),
  login: (email: string, password: string) => api<{ token: string; user: User }>("POST", "/auth/login", { email, password }),
  guest: (name: string) => api<{ token: string; user: User }>("POST", "/auth/guest", { name }),
  me: () => api<{ user: User }>("GET", "/auth/me"),
  update: (patch: { name?: string; avatar?: any; statusText?: string }) => api<{ user: User }>("PATCH", "/auth/me", patch),
};
export const spaces = {
  list: () => api<{ spaces: any[] }>("GET", "/spaces"),
  create: (name: string, template: string, isPrivate: boolean) => api<{ space: SpaceInfo }>("POST", "/spaces", { name, template, isPrivate }),
  get: (slug: string) => api<{ space: SpaceInfo }>("GET", `/spaces/${slug}`),
  update: (slug: string, patch: { name?: string; isPrivate?: boolean; location?: string; weatherMode?: string; timeMode?: string; logoUrl?: string | null }) => api<{ space: SpaceInfo }>("PATCH", `/spaces/${slug}`, patch),
  remove: (slug: string) => api("DELETE", `/spaces/${slug}`),
  members: (slug: string) => api<{ members: any[]; bans: any[] }>("GET", `/spaces/${slug}/members`),
  setRole: (slug: string, userId: string, role: string) => api("PATCH", `/spaces/${slug}/members/${userId}`, { role }),
  kick: (slug: string, userId: string, ban = false) => api("DELETE", `/spaces/${slug}/members/${userId}${ban ? "?ban=1" : ""}`),
  unban: (slug: string, userId: string) => api("DELETE", `/spaces/${slug}/bans/${userId}`),
  invites: (slug: string) => api<{ invites: any[] }>("GET", `/spaces/${slug}/invites`),
  createInvite: (slug: string, role: string, expiresInHours?: number, maxUses?: number) => api<{ token: string }>("POST", `/spaces/${slug}/invites`, { role, expiresInHours, maxUses }),
  revokeInvite: (slug: string, token: string) => api("DELETE", `/spaces/${slug}/invites/${token}`),
  inviteInfo: (token: string) => api<{ invite: { role: string; name: string; slug: string } }>("GET", `/invites/${token}`),
  acceptInvite: (token: string) => api<{ space: SpaceInfo }>("POST", `/invites/${token}/accept`),
  map: (slug: string, mapId: string) => api<{ map: { id: string; name: string; isDefault: boolean; data: any } }>("GET", `/spaces/${slug}/maps/${mapId}`),
  createMap: (slug: string, name: string, template?: string, data?: any) => api<{ map: { id: string; name: string } }>("POST", `/spaces/${slug}/maps`, { name, template, data }),
  updateMap: (slug: string, mapId: string, patch: { name?: string; isDefault?: boolean }) => api("PATCH", `/spaces/${slug}/maps/${mapId}`, patch),
  deleteMap: (slug: string, mapId: string) => api("DELETE", `/spaces/${slug}/maps/${mapId}`),
  history: (slug: string) => api<{ messages: any[] }>("GET", `/spaces/${slug}/history`),
  search: (slug: string, q: string) => api<{ messages: any[] }>("GET", `/spaces/${slug}/search?q=${encodeURIComponent(q)}`),
  events: (slug: string) => api<{ events: any[] }>("GET", `/spaces/${slug}/events`),
  createEvent: (slug: string, e: any) => api<{ event: any }>("POST", `/spaces/${slug}/events`, e),
  deleteEvent: (slug: string, id: string) => api("DELETE", `/spaces/${slug}/events/${id}`),
  pins: (slug: string) => api<{ pins: any[] }>("GET", `/spaces/${slug}/pins`),
  addPin: (slug: string, text: string) => api<{ id: number }>("POST", `/spaces/${slug}/pins`, { text }),
  removePin: (slug: string, id: number) => api("DELETE", `/spaces/${slug}/pins/${id}`),
  stats: (slug: string) => api<{ stats: any; modLog: any[] }>("GET", `/spaces/${slug}/stats`),
  uploads: (slug: string) => api<{ uploads: any[] }>("GET", `/spaces/${slug}/uploads`),
  deleteUpload: (slug: string, id: string) => api("DELETE", `/spaces/${slug}/uploads/${id}`),
  upload: async (slug: string, file: File) => {
    const headers: Record<string, string> = { "Content-Type": file.type };
    const token = getToken(); if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`/api/spaces/${slug}/uploads?name=${encodeURIComponent(file.name)}`, { method: "POST", headers, body: file });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, data.error ?? res.statusText, data);
    return data as { id: string; url: string; name: string };
  },
  mediaToken: (slug: string, group: string) => api<{ token: string; url: string }>("POST", `/spaces/${slug}/media/token`, { group }),
};
export const providers = () => api<{ google: boolean }>("GET", "/auth/providers");
