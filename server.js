const http = require("http");
const express = require("express");
const { WebSocketServer, WebSocket } = require("ws");
const crypto = require("crypto");

const app = express();
app.get("/", (_req, res) => res.status(200).send("GridPulse multiplayer server online"));
app.get("/health", (_req, res) => res.json({ ok: true, service: "gridpulse-multiplayer" }));

const server = http.createServer(app);
const wss = new WebSocketServer({
  noServer: true,
  maxPayload: 256 * 1024
});

const PORT = process.env.PORT || 10000;
const ROOMS = new Map();
const ROOM_CAPACITY = 8;
const ROOM_TTL_MS = 30 * 60 * 1000;

const MODE_TARGETS = {
  territory: 2,       // 1v1
  teambrawl: 9,       // 8 humains maximum + bots pour atteindre 9 combattants
  battleroyale: 8,
  boost: 6
};

function safeName(value) {
  return String(value || "Pilote").replace(/[<>&"'`]/g, "").trim().slice(0, 16) || "Pilote";
}
function safeMode(value) {
  return Object.hasOwn(MODE_TARGETS, value) ? value : "territory";
}
function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = Array.from({ length: 5 }, () => chars[crypto.randomInt(chars.length)]).join("");
  } while (ROOMS.has(code));
  return code;
}
function send(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}
function publicRoom(room) {
  return {
    code: room.code,
    mode: room.mode,
    state: room.state,
    hostId: room.hostId,
    players: [...room.players.values()].map(p => ({
      id: p.id, name: p.name, host: p.id === room.hostId
    }))
  };
}
function broadcastRoom(room) {
  const payload = { t: "lobby_update", room: publicRoom(room) };
  for (const p of room.players.values()) send(p.ws, payload);
}
function removePlayer(ws) {
  const id = ws.playerId;
  if (!id) return;
  const room = ROOMS.get(ws.roomCode);
  ws.playerId = null;
  ws.roomCode = null;
  if (!room) return;
  room.players.delete(id);
  room.lastActivity = Date.now();
  if (!room.players.size) {
    ROOMS.delete(room.code);
    return;
  }
  if (room.hostId === id) {
    const next = room.players.values().next().value;
    room.hostId = next.id;
    room.state = "waiting";
    for (const p of room.players.values()) send(p.ws, {
      t: "error",
      message: "L’hôte a quitté le salon. Un nouvel hôte a été désigné ; relancez la partie."
    });
  }
  broadcastRoom(room);
}
function error(ws, message) { send(ws, { t: "error", message }); }

function createRoom(ws, msg) {
  if (ws.roomCode) removePlayer(ws);
  const mode = safeMode(msg.mode);
  const code = makeCode();
  const id = crypto.randomUUID();
  const room = {
    code, mode, state: "waiting", hostId: id,
    players: new Map(),
    lastActivity: Date.now()
  };
  room.players.set(id, { id, name: safeName(msg.name || "Hôte"), ws });
  ROOMS.set(code, room);
  ws.playerId = id;
  ws.roomCode = code;
  send(ws, { t: "created", id, room: publicRoom(room) });
}
function joinRoom(ws, msg) {
  if (ws.roomCode) removePlayer(ws);
  const code = String(msg.code || "").trim().toUpperCase();
  const room = ROOMS.get(code);
  if (!room) return error(ws, "Salon introuvable. Vérifie le code.");
  if (room.state !== "waiting") return error(ws, "Cette partie a déjà commencé.");
  if (room.players.size >= ROOM_CAPACITY) return error(ws, "Ce salon est complet (8 joueurs maximum).");

  // Une connexion WebSocket ne peut occuper qu'une seule place dans un salon.
  const id = crypto.randomUUID();
  room.players.set(id, { id, name: safeName(msg.name), ws });
  room.lastActivity = Date.now();
  ws.playerId = id;
  ws.roomCode = code;
  send(ws, { t: "joined", id, room: publicRoom(room) });
  broadcastRoom(room);
}
function startRoom(ws) {
  const room = ROOMS.get(ws.roomCode);
  if (!room) return error(ws, "Tu n’es dans aucun salon.");
  if (room.hostId !== ws.playerId) return error(ws, "Seul l’hôte peut lancer la partie.");
  if (room.state !== "waiting") return error(ws, "La partie est déjà lancée.");

  const target = MODE_TARGETS[room.mode] || 2;
  const humanCount = room.players.size;
  const botCount = Math.max(0, target - humanCount);
  room.state = "playing";
  room.lastActivity = Date.now();
  const roomData = publicRoom(room);
  for (const p of room.players.values()) {
    send(p.ws, {
      t: "game_start",
      room: roomData,
      mode: room.mode,
      humanCount,
      botCount
    });
  }
  broadcastRoom(room);
}
function relay(ws, msg) {
  const room = ROOMS.get(ws.roomCode);
  if (!room || room.state !== "playing") return;
  const isHost = ws.playerId === room.hostId;

  if (msg.t === "game_state") {
    if (!isHost) return;
    const payload = { t: "game_state", state: msg.state };
    for (const p of room.players.values()) if (p.id !== ws.playerId) send(p.ws, payload);
    room.lastActivity = Date.now();
    return;
  }
  if (msg.t === "player_input") {
    if (isHost) return;
    const host = room.players.get(room.hostId);
    if (host) send(host.ws, { t: "player_input", playerId: ws.playerId, input: msg.input });
    room.lastActivity = Date.now();
  }
}

server.on("upgrade", (req, socket, head) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (pathname !== "/ws") {
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, ws => wss.emit("connection", ws, req));
});

wss.on("connection", ws => {
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });

  ws.on("message", raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); }
    catch { return error(ws, "Message invalide."); }
    if (!msg || typeof msg.t !== "string") return;

    switch (msg.t) {
      case "create": return createRoom(ws, msg);
      case "join": return joinRoom(ws, msg);
      case "start": return startRoom(ws);
      case "leave": removePlayer(ws); return;
      case "game_state":
      case "player_input": return relay(ws, msg);
      case "ping": return send(ws, { t: "pong", at: Date.now() });
      default: return error(ws, "Action inconnue.");
    }
  });
  ws.on("close", () => removePlayer(ws));
  ws.on("error", () => removePlayer(ws));
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
  const now = Date.now();
  for (const [code, room] of ROOMS) {
    if (now - room.lastActivity > ROOM_TTL_MS) {
      for (const p of room.players.values()) {
        send(p.ws, { t: "error", message: "Salon expiré après 30 minutes d’inactivité." });
        p.ws.close(1000, "Room expired");
      }
      ROOMS.delete(code);
    }
  }
}, 30000);
wss.on("close", () => clearInterval(heartbeat));

server.listen(PORT, "0.0.0.0", () => {
  console.log(`GridPulse server listening on ${PORT}`);
});
