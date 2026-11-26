# GridPulse — déploiement multijoueur Render

## Contenu
- `server/server.js` : serveur HTTP + WebSocket, salons, codes, limite de 8 connexions, départ de partie et relais réseau.
- `server/package.json` : dépendances Node.js.
- `render.yaml` : configuration Render Blueprint.
- `GridPulse-56.html` : copie du jeu fourni.

## Déploiement Render
1. Décompresse cette archive.
2. Dépose le dossier dans un dépôt GitHub (le fichier `render.yaml` doit être à la racine).
3. Dans Render, choisis **New + → Blueprint** et connecte le dépôt.
4. Render détecte `render.yaml` et crée le service `gridpulse-multiplayer`.
5. Attends que le service soit `Live`.
6. L'adresse WebSocket du jeu doit être `wss://NOM-DU-SERVICE.onrender.com/ws`.
   Le fichier HTML fourni pointe déjà vers `wss://amaury-2pvx.onrender.com/ws`.
   Si Render donne une autre adresse, remplace la constante `GRIDPULSE_LOBBY_SERVER` dans le HTML.

## Vérification
- Ouvre `https://NOM-DU-SERVICE.onrender.com/health` : la réponse doit contenir `{"ok":true}`.
- Ouvre le jeu dans deux navigateurs/appareils, crée un salon depuis l'un et rejoins-le avec le code depuis l'autre.

## Important — état réel de l'intégration du moteur
Ce serveur fournit les salons, les codes, la limite de 8 joueurs, le remplissage annoncé par bots et le relais des messages `game_state` / `player_input`.
Dans le HTML fourni, le mode **Boost** possède déjà un chemin de synchronisation réseau utilisant ces messages. Les modes **1v1, Team Brawl et Battle Royale** démarrent encore leur moteur localement après `game_start` : leur simulation complète partagée (unités, tirs, dégâts, morts et victoire) n'est pas encore raccordée au relais. Le serveur seul ne peut pas rendre ces modes réellement synchronisés ; il faut modifier le moteur du jeu pour qu'un hôte simule la partie et que les autres clients appliquent son état et lui envoient leurs commandes.

Les bots sont des combattants générés par le moteur local de l'hôte pour les modes qui les prennent en charge ; le serveur calcule seulement le nombre de places à compléter et le transmet au jeu. Le mode Team Brawl vise 9 combattants au total, avec 8 connexions humaines maximum et donc potentiellement un bot de remplissage.

## Limites de cette première version
- Les salons sont conservés en mémoire : un redémarrage ou une mise en veille du service les efface.
- Aucun compte utilisateur ni authentification persistante.
- Une place correspond à une connexion WebSocket ; pour empêcher un même compte de rejoindre plusieurs fois avec plusieurs connexions, il faudra transmettre un identifiant de compte stable et le valider côté serveur.
- Render peut mettre en veille certains services gratuits ; le premier réveil peut prendre un peu de temps.
