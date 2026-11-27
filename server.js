const http = require("http");
const express = require("express");
const { WebSocketServer, WebSocket } = require("ws");
const crypto = require("crypto");

const app = express();
app.use((_req, res, next) => { res.set("Access-Control-Allow-Origin", "*"); next(); }); // /health appelable depuis la page (réveil de Render)
app.get("/", (_req, res) => res.status(200).send("GridPulse multiplayer server online"));
app.get("/health", (_req, res) => res.json({ ok: true, service: "gridpulse-multiplayer" }));

const server = http.createServer(app);
const wss = new WebSocketServer({
  noServer: true,
  maxPayload: 256 * 1024
});

const PORT = process.env.PORT || 10000;
const ROOMS = new Map();
const ROOM_CAPACITY = 8; // plafond général, affiné par mode ci-dessous
const MODE_CAPACITIES = {
  territory: 2,       // 1v1 : deux humains
  teambrawl: 8,       // 3 équipes de 3 : jusqu'à 8 humains + 1 bot
  battleroyale: 8,    // jusqu'à 8 humains
  boost: 6            // six combattants au total
};
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
function safeClientKey(value) {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 100);
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
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(typeof data === "string" ? data : JSON.stringify(data));
}

// ---- Liste des salons ouverts : poussée en temps réel aux joueurs qui parcourent le lobby ----
const watchers = new Set();
let listTimer = null;
function openRooms() {
  return [...ROOMS.values()]
    .filter(r => r.state === "waiting")
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(r => {
      const capacity = MODE_CAPACITIES[r.mode] || ROOM_CAPACITY;
      const host = r.players.get(r.hostId);
      return {
        code: r.code, mode: r.mode, host: host ? host.name : "Hôte",
        count: r.players.size, capacity, full: r.players.size >= capacity
      };
    });
}
function pushRoomList(ws) { send(ws, { t: "rooms", rooms: openRooms() }); }
function scheduleRoomList() {
  if (listTimer || !watchers.size) return;
  listTimer = setTimeout(() => {          // regroupe les changements rapprochés (60 ms)
    listTimer = null;
    if (!watchers.size) return;
    const payload = JSON.stringify({ t: "rooms", rooms: openRooms() });
    for (const w of watchers) send(w, payload);
  }, 60);
}
function publicRoom(room) {
  return {
    code: room.code,
    mode: room.mode,
    state: room.state,
    capacity: MODE_CAPACITIES[room.mode] || ROOM_CAPACITY,
    target: MODE_TARGETS[room.mode] || 2,
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
    scheduleRoomList();
    return;
  }
  if (room.hostId === id) {
    const next = room.players.values().next().value;
    room.hostId = next.id;
    if (room.state === "playing") {
      room.state = "waiting";
      for (const p of room.players.values()) send(p.ws, {
        t: "error",
        message: "L’hôte a quitté la partie. Un nouvel hôte a été désigné ; relancez la partie."
      });
    }
  }
  broadcastRoom(room);
  scheduleRoomList();
}
function error(ws, message) { send(ws, { t: "error", message }); }

function createRoom(ws, msg) {
  if (ws.roomCode) removePlayer(ws);
  watchers.delete(ws);
  const mode = safeMode(msg.mode);
  const code = makeCode();
  const id = crypto.randomUUID();
  const room = {
    code, mode, state: "waiting", hostId: id,
    players: new Map(),
    createdAt: Date.now(),
    lastActivity: Date.now()
  };
  room.players.set(id, { id, name: safeName(msg.name || "Hôte"), clientKey: safeClientKey(msg.clientKey), ws });
  ROOMS.set(code, room);
  ws.playerId = id;
  ws.roomCode = code;
  send(ws, { t: "created", id, room: publicRoom(room) });
  scheduleRoomList();               // le salon apparaît immédiatement chez les autres joueurs
}
function joinRoom(ws, msg) {
  if (ws.roomCode) removePlayer(ws);
  const code = String(msg.code || "").trim().toUpperCase();
  const room = ROOMS.get(code);
  if (!room) { pushRoomList(ws); return error(ws, "Ce salon n’existe plus."); }
  if (room.state !== "waiting") { pushRoomList(ws); return error(ws, "Cette partie a déjà commencé."); }
  const capacity = MODE_CAPACITIES[room.mode] || ROOM_CAPACITY;
  if (room.players.size >= capacity) {
    pushRoomList(ws);
    return error(ws, `Ce salon est complet (${capacity} joueur(s) maximum pour ce mode).`);
  }

  // Empêche le même navigateur/installation de réserver plusieurs places dans le salon.
  const clientKey = safeClientKey(msg.clientKey);
  if (clientKey && [...room.players.values()].some(p => p.clientKey === clientKey)) {
    return error(ws, "Ce personnage est déjà présent dans ce salon.");
  }
  const id = crypto.randomUUID();
  room.players.set(id, { id, name: safeName(msg.name), clientKey, ws });
  room.lastActivity = Date.now();
  ws.playerId = id;
  ws.roomCode = code;
  watchers.delete(ws);
  send(ws, { t: "joined", id, room: publicRoom(room) });
  broadcastRoom(room);
  scheduleRoomList();
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
  scheduleRoomList();               // la partie lancée disparaît de la liste
}
const GAME_STATE_PREFIX = '{"t":"game_state"';
const MAX_BUFFERED = 512 * 1024;   // au-delà, on saute les snapshots d'un client lent (le suivant remplace celui-ci)

// Chemin rapide : le snapshot de l'hôte est retransmis tel quel (aucun parse / stringify par destinataire).
function relayGameState(ws, text) {
  const room = ROOMS.get(ws.roomCode);
  if (!room || room.state !== "playing" || ws.playerId !== room.hostId) return;
  room.lastActivity = Date.now();
  const isInit = text.startsWith('{"t":"game_state","state":{"t":"init"') || text.startsWith('{"t":"game_state","state":{"t":"end"');
  for (const p of room.players.values()) {
    if (p.id === ws.playerId || p.ws.readyState !== WebSocket.OPEN) continue;
    if (!isInit && p.ws.bufferedAmount > MAX_BUFFERED) continue;
    p.ws.send(text);
  }
}
function relayInput(ws, msg) {
  const room = ROOMS.get(ws.roomCode);
  if (!room || room.state !== "playing" || ws.playerId === room.hostId) return;
  const host = room.players.get(room.hostId);
  if (!host || host.ws.bufferedAmount > MAX_BUFFERED) return;
  room.lastActivity = Date.now();
  send(host.ws, { t: "player_input", playerId: ws.playerId, input: msg.input });
}

server.on("upgrade", (req, socket, head) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (pathname !== "/ws") {
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
    return;
  }
  socket.setNoDelay(true);          // pas de délai Nagle : latence minimale pour les petits messages
  wss.handleUpgrade(req, socket, head, ws => wss.emit("connection", ws, req));
});

wss.on("connection", ws => {
  ws.isAlive = true;
  ws.winStart = Date.now();
  ws.winCount = 0;
  ws.on("pong", () => { ws.isAlive = true; });

  ws.on("message", (raw, isBinary) => {
    if (isBinary) return;
    // Anti-flood : 200 messages par seconde et par client au maximum.
    const now = Date.now();
    if (now - ws.winStart >= 1000) { ws.winStart = now; ws.winCount = 0; }
    if (++ws.winCount > 200) return;

    const text = raw.toString();
    if (text.startsWith(GAME_STATE_PREFIX)) return relayGameState(ws, text);

    let msg;
    try { msg = JSON.parse(text); }
    catch { return error(ws, "Message invalide."); }
    if (!msg || typeof msg.t !== "string") return;

    switch (msg.t) {
      case "player_input": return relayInput(ws, msg);
      case "browse":                // l'écran « Rejoindre » est ouvert : liste en direct
        if (!ws.roomCode) { watchers.add(ws); pushRoomList(ws); }
        return;
      case "unbrowse": watchers.delete(ws); return;
      case "create": return createRoom(ws, msg);
      case "join": return joinRoom(ws, msg);
      case "start": return startRoom(ws);
      case "leave": removePlayer(ws); return;
      case "ping": return send(ws, { t: "pong", at: Date.now() });
      default: return error(ws, "Action inconnue.");
    }
  });
  const gone = () => { watchers.delete(ws); removePlayer(ws); };
  ws.on("close", gone);
  ws.on("error", gone);
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
      scheduleRoomList();
    }
  }
}, 30000);
wss.on("close", () => clearInterval(heartbeat));

server.listen(PORT, "0.0.0.0", () => {
  console.log(`GridPulse server listening on ${PORT}`);
});
