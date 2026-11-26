# GridPulse — multijoueur Render

## Fichiers
- `GridPulse-56.html` : jeu raccordé au serveur Render.
- `server/server.js` : création des salons, codes, attribution des combattants et relais WebSocket.
- `server/package.json` : dépendances Node.js.
- `render.yaml` : configuration Render Blueprint.

## Modes multijoueurs pris en charge
Les quatre modes proposés dans le menu multijoueur utilisent le même salon Render et une simulation autoritaire côté hôte :

- **1v1** (`territory`) : 2 joueurs humains maximum. Le joueur invité remplace le bot adverse.
- **Team Brawl** (`teambrawl`) : 3 équipes de 3 combattants. Jusqu'à 8 joueurs humains et un bot pour compléter la neuvième place. Les invités peuvent remplacer aussi bien les bots alliés de l'hôte que les bots adverses.
- **Battle Royale** (`battleroyale`) : jusqu'à 8 joueurs humains dans la même arène ; les bots complètent les places libres. L'hôte décide de la fin de partie.
- **Arène Boosts** (`boost`) : jusqu'à 6 joueurs au total, conformément aux 6 combattants du mode.

Le serveur applique une capacité distincte par mode : 2 en 1v1, 8 en Team Brawl, 8 en Battle Royale et 6 en Arène Boosts. Il refuse les connexions supplémentaires au-delà de cette limite.

## Déployer sur Render
1. Décompresse cette archive dans un dépôt GitHub : `render.yaml` doit être à la racine du dépôt.
2. Dans Render, choisis **New + → Blueprint**, puis connecte le dépôt.
3. Render lit `render.yaml` et crée le service `gridpulse-multiplayer`.
4. Attends que le service soit `Live`.
5. Le jeu utilise `wss://amaury-2pvx.onrender.com/ws`. Si Render fournit une autre adresse, modifie `GRIDPULSE_LOBBY_SERVER` dans `GridPulse-56.html`.

## Vérifier
Ouvre `https://amaury-2pvx.onrender.com/health`. Le serveur doit répondre avec `ok: true`.
Ouvre ensuite le même fichier HTML sur deux appareils : crée un salon sur le premier, rejoins-le avec le code sur le second, puis lance la partie depuis l'hôte. Pour vérifier Team Brawl et les modes à plus de deux joueurs, utilise plusieurs navigateurs/appareils.

## Notes techniques et limites
- L'hôte exécute la simulation ; les invités envoient leurs commandes et reçoivent les états synchronisés (unités, projectiles, dégâts, zone, objectifs et résultat).
- Une clé locale persistante empêche le même navigateur/installation de réserver plusieurs places dans un salon. Ce n'est pas un compte utilisateur synchronisé entre appareils.
- Les salons sont stockés en mémoire et disparaissent si Render redémarre ou met le service en veille.
- Render peut mettre en veille les services gratuits ; le premier réveil peut prendre un peu de temps.
- Les fichiers ont été vérifiés pour la syntaxe JavaScript. Le déploiement Render et les parties réelles à plusieurs appareils doivent encore être testés après publication ; le bon fonctionnement en production n'est donc pas garanti avant ce test.
