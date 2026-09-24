# Architecture — étapes 1 à 4

## Socle implémenté

Trois workspaces npm : `@hear-me-out/client`, `@hear-me-out/server`,
`@hear-me-out/shared`. Le frontend existant est conservé. `shared` se compile
en JavaScript et déclarations TypeScript avant ses consommateurs.

Fastify et Socket.IO partagent le même serveur HTTP. `app.ts` construit une
application sans écouter automatiquement ; `index.ts` charge la configuration,
ouvre le port et gère les signaux d'arrêt. Cette séparation permet les tests
sur des ports éphémères. Le hook `preClose` ferme les connexions Socket.IO.

Le navigateur utilise un socket stable créé sans connexion automatique. Un effet
React gère son ouverture et son nettoyage, y compris sous StrictMode.
Le hook `useConnection` gère statut et test aller-retour. `useRoom` utilise cette
même connexion pour les commandes et les snapshots. La reconnexion réseau est
assurée par Socket.IO ; la reprise de l'identité d'un joueur reste différée.

## Contrats réseau actuels

| Transport | Contrat | Description |
| --- | --- | --- |
| HTTP | `GET /api/health` | `{ status: 'ok', service: 'hear-me-out-server' }` |
| Serveur → client | `connection:welcome` | Version du protocole et heure serveur |
| Client → serveur | `connection:ping` | UUID de requête, validé avec Zod |
| Accusé de réception | `Ack<T>` | Succès avec données ou erreur structurée |
| Client → serveur | `room:create` | UUID de requête et pseudonyme |
| Client → serveur | `room:join` | UUID de requête, code et pseudonyme |
| Client → serveur | `room:leave` | UUID de requête et identifiant du salon |
| Client → serveur | `room:sync` | UUID de requête ; relire son appartenance actuelle |
| Client → serveur | `player:ready` | Salon, version des paramètres, booléen Ready |
| Client → serveur | `room:settings:update` | Salon, version attendue, paramètres complets (Host) |
| Client → serveur | `game:start` | Salon et version attendue des paramètres (Host) |
| Serveur → salon | `room:update` | Snapshot public versionné |
| Serveur → salon | `room:closed` | Identifiant du salon et motif de fermeture |

Le temps affiché est la durée aller-retour mesurée dans le navigateur.
Le serveur renvoie l'UUID uniquement à l'émetteur. Un message mal formé est
refusé ; un appel sans callback est ignoré. Le test de connexion est sans effet
métier et ne nécessite pas de cache d'idempotence.

Les origines navigateur inattendues sont refusées au handshake, y compris en
WebSocket. Les outils sans en-tête Origin restent acceptés : ce contrôle ne
constitue pas une authentification. La taille des messages est limitée à 16 Kio.

## Salons en mémoire

`RoomService` possède une `Map<string, GameRoom>` indexée par code et une map
d'appartenances indexée par connexion. Les identifiants UUID de joueur et de salon
sont générés par le serveur et distincts des identifiants Socket.IO. Seule
l'association interne détermine le joueur qui agit ; aucun `playerId` transmis
par le navigateur n'est accepté dans une commande.

`registerRoomHandlers` valide les payloads avec Zod puis appelle ce service.
Les transitions sont synchrones sur un seul processus, avec l'adapter mémoire
Socket.IO. Chaque salon correspond au canal `room:CODE`. Le client ne choisit
jamais librement un canal de diffusion. Un futur adapter asynchrone nécessitera
d'adapter cette orchestration et la sérialisation des mutations.

Chaque mutation incrémente la révision. Les snapshots sont construits explicitement
et ne contiennent ni identifiants de connexion, ni références aux objets internes.
Créer ou rejoindre renvoie en privé `{ room, playerId }` ; le snapshot du salon
est diffusé uniquement à ses membres. Une sortie désabonne la connexion. Le départ
du créateur ferme le salon et libère toutes ses appartenances et abonnements.

Les commandes possèdent un `requestId`. Les 100 dernières réponses de mutation
sont mémorisées par connexion. Rejouer la même demande renvoie son résultat sans
réappliquer l'action ; changer son contenu est refusé. Une ancienne création ou
jonction ne peut pas faire réapparaître un salon déjà quitté. Le cache est borné
et disparaît avec la connexion, sans garantie d'idempotence persistante.
La relecture `room:sync` renvoie toujours l'état actuel, jamais une réponse cachée.

Le frontend empêche les actions simultanées et hors connexion. Il conserve le
snapshot le plus récent si une diffusion arrive avant l'accusé de réception,
ignore une réponse tardive d'une ancienne connexion ou d'un salon fermé, et
resynchronise après une réponse incertaine. Si la synchronisation échoue aussi,
il réinitialise sa connexion au lieu de continuer avec une appartenance inconnue.

Les garde-fous incluent 12 joueurs par salon, 1 000 salons par processus et
40 commandes par tranche de 10 secondes par connexion. Cette dernière limite
ne remplace pas une protection globale contre les abus lors d'un déploiement.

## Limite de reconnexion

À cette étape, toute déconnexion retire le joueur. Le créateur déconnecté ferme
son salon, sans délai de reprise : le délai de 60 secondes proposé dans la
conception initiale dépend d'une authentification de reprise qui n'est pas encore
implémentée. La séparation UUID joueur / connexion permettra de l'introduire
ultérieurement avec un jeton secret, sans utiliser le code du salon comme preuve
d'identité. Un redémarrage du serveur perd tous les salons.

## Lobby et lancement

`Player.isReady` est propre au joueur associé à la connexion. `hostPlayerId`
reste la source unique du rôle Host : aucun booléen Host contrôlable par le
client. La liste du salon contient uniquement les joueurs encore connectés,
selon le cycle de déconnexion de l'étape 2.

Les valeurs initiales et limites de `GameSettings` sont des constantes partagées
dans `shared/src/lobby.ts` ; les schémas Zod côté serveur imposent les limites
et les types réels. Les payloads restent stricts (pas de champs supplémentaires).
La projection publique copie paramètres et liste des participants.

`settingsRevision` augmente uniquement lors d'un changement effectif des valeurs.
Les commandes de lobby portent cette version afin qu'une approbation ancienne ne
soit pas appliquée après une modification. Changer les paramètres remet tous les
joueurs « pas prêts ». Enregistrer les mêmes valeurs ou définir le même état Ready
ne modifie pas la révision du salon. Le cache de requêtes évite de réappliquer une
ancienne mutation, même si ses effets ont depuis été remplacés.

Le service vérifie appartenance, rôle éventuel du Host, absence de partie lancée
et version des paramètres avant la mutation. Le lancement exige deux joueurs au
minimum, tous prêts (Host compris). Il transmet un événement interne `START_GAME`
au moteur, qui passe de `LOBBY` à `SUBMISSION` avec UUID de partie et de round,
horodatage serveur et participants initiaux. Une commande de lancement répétée avec le même UUID
renvoie son accusé précédent ; une nouvelle commande est refusée après lancement.

Depuis l'étape 4, le client affiche la phase et le round issus de `RoomSnapshot.state`.
Ce contrat remplace l'ancien `room.game` nullable. `StartedGame` a été supprimé
au profit de l'union discriminée `GameState`. Les timers arriveront à l'étape 5.
Les joueurs peuvent encore quitter un salon lancé ; les participants initiaux
restent figés et le départ du Host ferme le salon. Les nouvelles jonctions sont refusées.

`LobbyControls` porte le brouillon des paramètres, recréé quand leur version
serveur change. Le Host doit enregistrer ses modifications avant Ready ou Start.
Le client n'anticipe pas les mutations : Ready et lancement sont affichés depuis
les snapshots serveur. Les trois nouvelles commandes utilisent le même mécanisme
d'accusés, de cache et de resynchronisation que les commandes de salons.

## Ajouts différés

Le moteur pur de l'étape 4 est décrit dans [la machine à états](game-state-machine.md).
Il ne dépend ni de Socket.IO ni de l'horloge système. Il accepte exclusivement des
événements internes avec version, identité de partie et identité de round attendues.
L'ordre des soumissions et l'index de révélation restent dans `GameMachine` côté serveur ;
`projectGameState` expose uniquement les champs publics autorisés.

Le prochain incrément ajoutera la phase de soumission avec timer. Les autres contrats
métier de la proposition initiale seront introduits au moment où ils deviennent
nécessaires.

Les étapes suivantes sépareront les commandes, services métier, moteur de jeu
et projections publiques. L'attente d'un joueur ayant soumis restera distincte
de la phase globale. Le serveur sera l'autorité pour les échéances et les scores.

React Router, Tailwind, Zustand, Motion, Supabase, PostgreSQL et Prisma ne sont
pas encore installés. Les deux vues sont sélectionnées à partir de l'appartenance
reçue du serveur, sans navigation par URL à ce stade. Le gâteau est une décoration
CSS statique, sans mécanique de jeu. Aucune nouvelle dépendance aux étapes 2 à 4.

## Références

- [TypeScript natif dans Node.js](https://nodejs.org/api/typescript.html)
- [Événements Socket.IO typés](https://socket.io/docs/v4/typescript/)
- [Garanties de livraison Socket.IO](https://socket.io/docs/v4/delivery-guarantees/)
- [Cycle de vie Fastify](https://fastify.dev/docs/latest/Reference/Hooks/)
