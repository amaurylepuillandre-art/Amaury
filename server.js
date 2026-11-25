const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 8;
const rooms = new Map();

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (rooms.has(code));
  return code;
}

function serializeRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    started: room.started,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      ready: p.ready
    }))
  };
}

function removePlayerFromRoom(socket) {
  const code = socket.data.roomCode;
  if (!code) return;
  const room = rooms.get(code);
  socket.leave(code);
  socket.data.roomCode = null;
  if (!room) return;

  const idx = room.players.findIndex(p => p.id === socket.id);
  if (idx !== -1) {
    const [removed] = room.players.splice(idx, 1);
    if (room.players.length === 0) {
      rooms.delete(code);
      return;
    }
    if (room.hostId === socket.id) {
      room.hostId = room.players[0].id;
      room.players[0].ready = true;
    }
    io.to(code).emit('lobby:update', serializeRoom(room));
    io.to(code).emit('lobby:notice', { message: `${removed.name} a quitté le lobby.` });
  }
}

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'GridPulse Conquest Lobby Server', rooms: rooms.size });
});

app.get('/health', (req, res) => {
  res.send('OK');
});

io.on('connection', (socket) => {
  socket.on('lobby:create', (payload, cb) => {
    removePlayerFromRoom(socket);
    const name = String((payload && payload.name) || 'Pilote').trim().slice(0, 16) || 'Pilote';
    const code = generateCode();
    const room = {
      code,
      hostId: socket.id,
      started: false,
      players: [{ id: socket.id, name, ready: true }]
    };
    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    if (typeof cb === 'function') cb({ ok: true, room: serializeRoom(room) });
  });

  socket.on('lobby:join', (payload, cb) => {
    const code = String((payload && payload.code) || '').trim().toUpperCase();
    const name = String((payload && payload.name) || 'Pilote').trim().slice(0, 16) || 'Pilote';
    const room = rooms.get(code);

    if (!room) {
      if (typeof cb === 'function') cb({ ok: false, message: 'Salon introuvable.' });
      return;
    }
    if (room.started) {
      if (typeof cb === 'function') cb({ ok: false, message: 'La partie a déjà démarré.' });
      return;
    }
    if (room.players.length >= MAX_PLAYERS) {
      if (typeof cb === 'function') cb({ ok: false, message: 'Salon complet (8/8).' });
      return;
    }

    removePlayerFromRoom(socket);
    room.players.push({ id: socket.id, name, ready: false });
    socket.join(code);
    socket.data.roomCode = code;

    const serialized = serializeRoom(room);
    if (typeof cb === 'function') cb({ ok: true, room: serialized });
    socket.to(code).emit('lobby:update', serialized);
    socket.to(code).emit('lobby:notice', { message: `${name} a rejoint le lobby.` });
  });

  socket.on('lobby:ready', (payload) => {
    const code = socket.data.roomCode;
    const room = code && rooms.get(code);
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;
    player.ready = Boolean(payload && payload.ready);
    io.to(code).emit('lobby:update', serializeRoom(room));
  });

  socket.on('lobby:start', (payload, cb) => {
    const code = socket.data.roomCode;
    const room = code && rooms.get(code);
    if (!room) {
      if (typeof cb === 'function') cb({ ok: false, message: 'Salon introuvable.' });
      return;
    }
    if (room.hostId !== socket.id) {
      if (typeof cb === 'function') cb({ ok: false, message: 'Seul le chef du salon peut lancer.' });
      return;
    }
    const allReady = room.players.every(p => p.ready);
    if (!allReady) {
      if (typeof cb === 'function') cb({ ok: false, message: 'Tous les joueurs doivent être prêts.' });
      return;
    }
    room.started = true;
    if (typeof cb === 'function') cb({ ok: true });
    io.to(code).emit('lobby:started', { code: room.code });
  });

  socket.on('lobby:leave', () => {
    removePlayerFromRoom(socket);
  });

  socket.on('disconnect', () => {
    removePlayerFromRoom(socket);
  });
});

server.listen(PORT, () => {
  console.log(`GridPulse multiplayer server listening on port ${PORT}`);
});
