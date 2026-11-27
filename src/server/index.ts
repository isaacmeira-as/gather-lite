import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import express from "express";
import cors from "cors";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { monitor } from "@colyseus/monitor";
import { OfficeRoom } from "./rooms/OfficeRoom";
import { api, uploadsDir } from "./api";
import { RedisPresence, RedisDriver } from "colyseus";
import { getDb } from "./db";

const PORT = Number(process.env.PORT ?? 2567);
const app = express();
app.use(cors());
app.use(express.json());
app.get("/healthz", (_req, res) => res.json({ ok: true }));
app.use("/api", api);
app.use("/uploads", express.static(uploadsDir, { maxAge: "7d", immutable: true }));
getDb();
app.use("/colyseus", monitor());

// Serve the built client when it exists (npm run build).
const dist = path.join(process.cwd(), "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/colyseus|\/matchmake|\/api).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

const httpServer = http.createServer(app);
// REDIS_URL enables multi-process deployments (presence + matchmaking driver shared between instances).
const redis = process.env.REDIS_URL ? { presence: new RedisPresence(process.env.REDIS_URL), driver: new RedisDriver(process.env.REDIS_URL) } : {};
const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer, maxPayload: 2 * 1024 * 1024 }), ...redis });
gameServer.define("office", OfficeRoom).filterBy(["spaceId", "mapId"]);

gameServer.listen(PORT).then(() => {
  console.log(`gather-lite server listening on http://localhost:${PORT}`);
});
