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
Le HTML est déjà configuré sur wss://amaury-2pvx.onrender.com/ws.
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


RÈGLES DE LANCEMENT PAR MODE (mise à jour)
- 1v1 / Assaut : 2 combattants au total, le salon accepte jusqu'à 2 humains ; les places restantes sont des bots.
- Battle Royale : 8 combattants au total ; le serveur calcule les bots nécessaires (8 - humains).
- Team Brawl : 3 équipes de 3 combattants (9 unités au total), jusqu'à 8 humains et les places restantes en bots.
- Tous les clients reçoivent le même mode sélectionné dans le salon et lancent le moteur avec les règles solo correspondantes.

LIMITE TECHNIQUE À CONNAÎTRE
Le moteur de combat existant ne synchronise pas encore la simulation complète de plusieurs joueurs humains via le nouveau serveur WebSocket. Cette mise à jour synchronise le mode et le lancement et calcule les bots de remplissage côté serveur, mais les autres humains ne sont pas encore pilotés comme des unités réseau dans l'arène. Chaque client démarre pour l'instant sa simulation locale avec les bots du mode choisi.
