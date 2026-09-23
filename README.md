# Hear Me Out Cake

Application multijoueur développée par étapes. Les étapes 1 et 2 fournissent le
monorepo, la connexion Socket.IO typée et les salons privés : création, jonction,
départ et liste des joueurs synchronisée. Le lobby avec Ready et paramètres,
les soumissions, les votes et les comptes ne sont pas encore implémentés.

## Démarrer

Prérequis : **Node.js 24.12 ou supérieur dans la branche 24**, et **npm 11+**.
Exécuter les commandes depuis la racine du dépôt :

```sh
npm ci
npm run dev
```

Ouvrir **http://localhost:5173**. Aucun fichier `.env` n'est nécessaire pour
le démarrage local. Le statut doit devenir « Connecté au serveur ». Saisir un
pseudo et créer un salon ; dans un autre onglet, choisir « Rejoindre » puis
entrer un autre pseudo et le code affiché. Les deux listes se mettent à jour.
Le diagnostic « Vérifier ma connexion » reste accessible en bas de page.
Ctrl+C arrête les trois processus de développement.

`npm run dev` compile d'abord `shared`, puis lance sa compilation en surveillance,
le serveur Node avec redémarrage automatique et Vite. `concurrently` orchestre ces
processus de manière compatible avec Windows, macOS et Linux.

## Organisation

| Package | Responsabilité |
| --- | --- |
| `client` | React, Vite, interface et connexion Socket.IO |
| `server` | Fastify, validation Zod, handlers Socket.IO |
| `shared` | Contrats TypeScript communs, sans dépendance navigateur ou serveur |

Un seul `package-lock.json`, à la racine. Ajouter les dépendances dans leur
workspace, par exemple `npm install <package> -w @hear-me-out/server`.
TypeScript et Oxlint sont mutualisés à la racine.

## Commandes

```sh
npm run build       # shared, serveur compilé, frontend de production
npm run typecheck   # les trois packages et les tests serveur
npm run lint        # Oxlint sur le client, le serveur et shared
npm test           # tests HTTP et Socket.IO sur de vrais ports éphémères
```

Pour vérifier le build localement, dans deux terminaux après `npm run build` :

```sh
npm start
npm run preview -w @hear-me-out/client
```

Le preview utilise http://localhost:5173 ; arrêter le serveur de développement
avant de le lancer. `npm start` sert uniquement l'API et Socket.IO. Pour un futur
déploiement, servir `client/dist` et diriger `/api` et `/socket.io` (avec upgrades
WebSocket) vers Node derrière une même origine. Vite preview n'est pas un serveur
de production.

## Configuration

Copier au besoin `server/.env.example` vers `server/.env` :

| Variable | Défaut | Usage |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Interface d'écoute du serveur |
| `PORT` | `3001` | Port HTTP et Socket.IO |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Origine navigateur autorisée, sans slash final |

Si le port backend change, adapter aussi la cible du proxy dans
`client/vite.config.ts`. Le port frontend est strict pour éviter une origine
différente lorsque 5173 est occupé. Utiliser l'adresse `localhost` documentée,
pas `127.0.0.1` dans le navigateur, sauf à changer `CLIENT_ORIGIN`.

Le frontend utilise la même origine et le proxy Vite pour les deux transports
Socket.IO : HTTP polling et WebSocket. Aucune clé ou adresse de stockage n'est
nécessaire à cette étape. Les fichiers `.env` sont ignorés par Git.

## Vérification manuelle

1. Ouvrir deux onglets sur http://localhost:5173. Créer un salon avec « Camille ».
2. Dans le second onglet, rejoindre avec son code et « Alex » : les deux onglets
   doivent afficher deux joueurs. Tester aussi un code inexistant et un pseudo
   déjà utilisé : une erreur lisible doit apparaître.
3. Quitter depuis Alex : Camille voit immédiatement un seul joueur. Alex peut
   rejoindre de nouveau. Fermer le salon depuis Camille : Alex revient à l'accueil
   avec un message de fermeture. L'ancien code ne permet plus de rejoindre.
4. Créer deux salons différents et vérifier que leurs listes restent séparées.
5. Vérifier http://localhost:5173/api/health : réponse `status: "ok"`.
6. Pour simuler une coupure indépendamment de Vite, lancer le serveur et le client
   dans deux terminaux avec `npm run dev -w @hear-me-out/server` et
   `npm run dev -w @hear-me-out/client` (après `npm run build`).
7. Arrêter uniquement le serveur : l'interface signale la perte de connexion et
   désactive les actions. Le relancer : la connexion se rétablit automatiquement.

## Règles et limites de l'étape 2

- Codes aléatoires de six caractères, sans `I`, `O`, `0` ou `1` ; collisions vérifiées.
- 12 joueurs par salon, 1 salon par connexion, 1 000 salons simultanés maximum.
- Pseudos de 2 à 24 caractères : lettres, chiffres, espaces et ponctuation simple.
  Espaces et Unicode normalisés ; doublons refusés sans distinction de casse.
- Le créateur est mémorisé pour le cycle de vie du salon. Son départ ferme le salon
  pour tous ; il n'existe pas encore de transfert de rôle ou de contrôle Ready.
- Un rafraîchissement ou une déconnexion retire le joueur lorsque le serveur détecte
  la coupure. Si c'est le créateur, le salon est fermé. La reconnexion du transport
  est automatique, mais il faut rejoindre manuellement avec un nouveau joueur.
  La reprise de session sera traitée dans une étape ultérieure.
- Les salons sont en mémoire et disparaissent au redémarrage du backend, y compris
  lors d'une modification de son code en développement. Les départs suppriment les
  associations et les salons fermés sont libérés immédiatement.
- Les commandes sont validées côté serveur et limitées à 40 par tranche de
  10 secondes par connexion. Le code d'un salon n'est pas une identité de joueur.

Les tests automatisés couvrent HTTP et les deux transports Socket.IO, les entrées
invalides, l'isolation entre salons, les pseudonymes, les collisions de codes,
les répétitions de commandes, les limites de capacité et les déconnexions.

Voir [les conventions](docs/conventions.md) et [l'architecture](docs/architecture.md).
