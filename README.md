# GridPulse Conquest — Client & Serveur Multijoueur

Ce pack contient :
- `index.html` : le jeu client (avec le module de lobby Socket.IO intégré)
- `server/server.js` : le serveur Node.js + Socket.IO prêt pour Render
- `server/package.json` : les dépendances (`express` et `socket.io`)

## Déployer le serveur sur Render
1. Mets le contenu du dossier `server/` (ou tout le dépôt) sur GitHub.
2. Sur **Render**, crée un **Web Service** relié à ton dépôt.
3. Configure :
   - **Root Directory** : `server` (si tu pousses tout le dossier)
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
4. Une fois déployé, copie l'URL HTTPS fournie par Render (ex. `https://gridpulse-server.onrender.com`) et colle-la dans le jeu via **Créer / Rejoindre un lobby**.
