const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const crypto = require('crypto');

const PORT = process.env.PORT || 10000;
const MAX_PLAYERS = 8;
const rooms = new Map();
const clients = new Map();

function code() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  do { out = Array.from({length:5},()=>alphabet[crypto.randomInt(alphabet.length)]).join(''); }
  while (rooms.has(out));
  return out;
}
function send(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}
function roomInfo(room) {
  return {
    code: room.code, hostId: room.hostId, state: room.state,
    mode: room.mode, maxPlayers: MAX_PLAYERS,
    players: [...room.players.values()].map(p => ({id:p.id,name:p.name,host:p.id===room.hostId})),
    botCount: room.state === 'playing' ? Math.max(0, MAX_PLAYERS-room.players.size) : 0
  };
}
function broadcast(room, data) {
  for (const p of room.players.values()) send(p.ws, data);
}
function publish(room) { broadcast(room, {t:'lobby_update', room:roomInfo(room)}); }
function leave(ws) {
  const info = clients.get(ws); if (!info) return;
  clients.delete(ws);
  const room = rooms.get(info.code); if (!room) return;
  room.players.delete(info.id);
  if (!room.players.size) rooms.delete(info.code);
  else {
    if (room.hostId === info.id) {
      room.hostId = room.players.keys().next().value;
      room.players.get(room.hostId).host = true;
    }
    publish(room);
  }
}
const server = http.createServer((req,res) => {
  if (req.url === '/health') { res.writeHead(200,{'content-type':'application/json'}); return res.end(JSON.stringify({ok:true,rooms:rooms.size})); }
  res.writeHead(200,{'content-type':'text/plain'}); res.end('GridPulse lobby server is online');
});
const wss = new WebSocketServer({server, path:'/ws'});
wss.on('connection', ws => {
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw.toString()); } catch { return send(ws,{t:'error',message:'Message invalide'}); }
    if (m.t === 'create') {
      const id = crypto.randomUUID(), roomCode = code();
      const room = {code:roomCode,hostId:id,state:'waiting',mode:['territory','battleroyale','teambrawl'].includes(m.mode)?m.mode:'territory',players:new Map()};
      room.players.set(id,{id,name:String(m.name||'Hôte').replace(/[<>]/g,'').slice(0,16),ws,host:true});
      rooms.set(roomCode,room); clients.set(ws,{code:roomCode,id});
      send(ws,{t:'created',id,room:roomInfo(room)}); publish(room); return;
    }
    if (m.t === 'join') {
      const room = rooms.get(String(m.code||'').toUpperCase());
      if (!room) return send(ws,{t:'error',message:'Salon introuvable'});
      if (room.state !== 'waiting') return send(ws,{t:'error',message:'La partie a déjà commencé'});
      if (room.players.size >= MAX_PLAYERS) return send(ws,{t:'error',message:'Salon complet (8 joueurs maximum)'});
      const id = crypto.randomUUID();
      room.players.set(id,{id,name:String(m.name||'Pilote').replace(/[<>]/g,'').slice(0,16),ws,host:false});
      clients.set(ws,{code:room.code,id});
      send(ws,{t:'joined',id,room:roomInfo(room)}); publish(room); return;
    }
    const info = clients.get(ws); if (!info) return send(ws,{t:'error',message:'Rejoins un salon avant cette action'});
    const room = rooms.get(info.code); if (!room) return;
    if (m.t === 'start') {
      if (info.id !== room.hostId) return send(ws,{t:'error',message:'Seul l’hôte peut lancer la partie'});
      if (room.state !== 'waiting') return;
      room.state = 'playing';
      room.botCount = Math.max(0, MAX_PLAYERS-room.players.size);
      const start = {t:'game_start',room:roomInfo(room),humanCount:room.players.size,botCount:room.botCount,mode:room.mode};
      broadcast(room,start); publish(room); return;
    }
    // Relais pour le futur moteur de combat autoritaire : input -> hôte, état -> tous les clients.
    if (m.t === 'game_input') {
      if (room.state !== 'playing') return;
      const host = room.players.get(room.hostId);
      if (host && info.id !== room.hostId) send(host.ws,{t:'player_input',playerId:info.id,input:m.input});
      return;
    }
    if (m.t === 'game_state') {
      if (info.id !== room.hostId || room.state !== 'playing') return;
      for (const p of room.players.values()) if (p.id !== room.hostId) send(p.ws,{t:'game_state',state:m.state});
      return;
    }
    if (m.t === 'leave') { leave(ws); return; }
  });
  ws.on('close',()=>leave(ws));
  ws.on('error',()=>leave(ws));
});
server.listen(PORT,'0.0.0.0',()=>console.log(`GridPulse server listening on ${PORT}`));
