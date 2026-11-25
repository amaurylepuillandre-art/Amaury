GRIDPULSE CONQUEST — PACK MULTIJOUEUR 8 JOUEURS

CONTENU
- server/server.js : serveur WebSocket de salons
- server/package.json : dépendance ws
- server/render.yaml : configuration Render
- GridPulse_8players.html : client du jeu avec interface de salon

DÉPLOIEMENT RENDER
1. Décompresse le ZIP.
2. Envoie le dossier sur un dépôt GitHub.
3. Dans Render, crée un nouveau Web Service depuis ce dépôt.
4. Root Directory : server
5. Build Command : npm install
6. Start Command : npm start
7. Déploie. Render fournit une URL du type https://nom-du-service.onrender.com

CONFIGURATION DU JEU
Dans le HTML, cherche :
const GRIDPULSE_LOBBY_SERVER = 'wss://TON-SERVEUR.onrender.com/ws';
Remplace TON-SERVEUR par le nom exact fourni par Render.
Pour tester le serveur : https://nom-du-service.onrender.com/health

FONCTIONS DU SERVEUR
- salons avec code de 5 caractères
- 8 joueurs humains maximum par salon
- refus d'un neuvième joueur et des arrivées après lancement
- liste des joueurs et attribution automatique d'un nouvel hôte si l'hôte quitte
- lancement par l'hôte et calcul des places bots = 8 - humains
- relais WebSocket prévu pour les entrées joueurs et les états de partie

LIMITATION IMPORTANTE
Ce pack met en place le serveur de salons et son protocole de relais, mais le moteur de combat HTML d'origine est encore construit autour d'un seul adversaire distant WebRTC. Il faut adapter le moteur de simulation pour consommer player_input et game_state pour que les 8 humains jouent réellement ensemble dans la même simulation. Le démarrage du salon et le remplissage logique des places par bots ne doivent pas être confondus avec cette synchronisation en combat : elle n'est pas encore finalisée dans cette version.
