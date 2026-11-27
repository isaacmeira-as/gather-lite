// Proximity audio/video via LiveKit. Active only when LIVEKIT_URL, LIVEKIT_API_KEY and
// LIVEKIT_API_SECRET are set; otherwise the client shows "não configurado".
import { AccessToken } from "livekit-server-sdk";

export const mediaEnabled = () => !!(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);
export const mediaUrl = () => process.env.LIVEKIT_URL ?? "";

/** One LiveKit room per conversation group (zone, spotlight or proximity cluster). */
export async function mintToken(roomName: string, identity: string, name: string, canPublish = true) {
  const at = new AccessToken(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!, { identity, name, ttl: "2h" });
  at.addGrant({ roomJoin: true, room: roomName, canPublish, canSubscribe: true, canPublishData: false });
  return await at.toJwt();
}
