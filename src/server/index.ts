import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import express from "express";
import cors from "cors";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { monitor } from "@colyseus/monitor";
import { OfficeRoom } from "./rooms/OfficeRoom";

const PORT = Number(process.env.PORT ?? 2567);
const app = express();
app.use(cors());
app.use(express.json());
app.get("/healthz", (_req, res) => res.json({ ok: true }));
app.use("/colyseus", monitor());

// Serve the built client when it exists (npm run build).
const dist = path.join(process.cwd(), "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/colyseus|\/matchmake).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

const httpServer = http.createServer(app);
const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
gameServer.define("office", OfficeRoom);

gameServer.listen(PORT).then(() => {
  console.log(`gather-lite server listening on http://localhost:${PORT}`);
});
