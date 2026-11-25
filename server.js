const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let players = {};
let bullets = [];
const mapObstacles = [
    { x: 200, y: 150, w: 100, h: 40 },
    { x: 600, y: 150, w: 100, h: 40 },
    { x: 400, y: 300, w: 100, h: 100 },
    { x: 200, y: 450, w: 100, h: 40 },
    { x: 600, y: 450, w: 100, h: 40 }
];

io.on('connection', (socket) => {
    console.log(`Joueur connecté : ${socket.id}`);

    players[socket.id] = {
        x: Math.random() * 700 + 100,
        y: Math.random() * 400 + 100,
        angle: 0,
        hp: 100,
        maxHp: 100,
        score: 0,
        color: '#' + Math.floor(Math.random()*16777215).toString(16)
    };

    socket.on('playerMovement', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].angle = data.angle;
        }
    });

    socket.on('playerShoot', (data) => {
        bullets.push({
            id: Math.random().toString(),
            playerId: socket.id,
            x: data.x,
            y: data.y,
            angle: data.angle,
            speed: 8
        });
    });

    socket.on('disconnect', () => {
        console.log(`Joueur déconnecté : ${socket.id}`);
        delete players[socket.id];
    });
});

// Boucle principale du serveur (tick rate à ~60 FPS)
setInterval(() => {
    // Mettre à jour les projectiles
    for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i];
        b.x += Math.cos(b.angle) * b.speed;
        b.y += Math.sin(b.angle) * b.speed;

        // Suppression si hors limites de la map (900x600)
        if (b.x < 0 || b.x > 900 || b.y < 0 || b.y > 600) {
            bullets.splice(i, 1);
            continue;
        }

        // Collision avec les obstacles de la map
        let hitObs = mapObstacles.some(obs => 
            b.x > obs.x && b.x < obs.x + obs.w && b.y > obs.y && b.y < obs.y + obs.h
        );
        if (hitObs) {
            bullets.splice(i, 1);
            continue;
        }

        // Collision avec les joueurs (Dégâts)
        for (let id in players) {
            if (id !== b.playerId) {
                let p = players[id];
                let dist = Math.hypot(p.x - b.x, p.y - b.y);
                if (dist < 20) {
                    // Touché !
                    p.hp -= 20;
                    bullets.splice(i, 1);

                    if (p.hp <= 0) {
                        // Réapparition et score
                        p.hp = p.maxHp;
                        p.x = Math.random() * 700 + 100;
                        p.y = Math.random() * 400 + 100;
                        if (players[b.playerId]) {
                            players[b.playerId].score += 1;
                        }
                    }
                    break;
                }
            }
        }
    }

    // Envoyer l'état global à tous les clients
    io.emit('gameState', { players, bullets });
}, 1000 / 60);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Serveur de jeu actif sur le port ${PORT}`);
});
