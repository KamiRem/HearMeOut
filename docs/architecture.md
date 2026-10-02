# Architecture — étapes 1 à 6

## Socle implémenté

Trois workspaces npm : `@hear-me-out/client`, `@hear-me-out/server`,
`@hear-me-out/shared`. Le frontend existant est conservé. `shared` se compile
en JavaScript et déclarations TypeScript avant ses consommateurs.

Fastify et Socket.IO partagent le même serveur HTTP. `app.ts` construit une
application sans écouter automatiquement ; `index.ts` charge la configuration,
ouvre le port et gère les signaux d'arrêt. Cette séparation permet les tests
sur des ports éphémères. Le hook `preClose` annule les timers et ferme Socket.IO.

Le navigateur utilise un socket stable créé sans connexion automatique. Un effet
React gère son ouverture et son nettoyage, y compris sous StrictMode.
Le hook `useConnection` gère statut et test aller-retour. `useRoom` utilise cette
même connexion pour les commandes et les snapshots. La reconnexion réseau est
assurée par Socket.IO ; `room:resume` restaure l’identité via un jeton privé d’onglet.

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
| Client → serveur | `room:resume` | UUID de requête et jeton privé de reprise |
| Serveur → client | `session:replaced` | Session reprise sur une autre connexion |
| Client → serveur | `player:ready` | Salon, version des paramètres, booléen Ready |
| Client → serveur | `room:settings:update` | Salon, version attendue, paramètres complets (Host) |
| Client → serveur | `game:start` | Salon et version attendue des paramètres (Host) |
| Client → serveur | `image:prepare` | Salon, partie, round ; retourne un jeton privé d’upload |
| HTTP | `POST /api/images` | Image brute + jeton ; valide, stocke et verrouille la soumission |
| Serveur → salon | `room:update` | Snapshot public versionné et heure serveur |
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
Créer, rejoindre ou reprendre renvoie en privé `{ room, playerId, sessionToken, ownSubmission, serverNow }` ; le snapshot du salon
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

Une déconnexion conserve la place pendant 60 secondes. Le jeton de 256 bits dans
`sessionStorage` permet de réassocier une nouvelle connexion au même joueur,
y compris après rechargement. Le code du salon ne prouve jamais l’identité.
L’expiration retire l’invité ou ferme le salon si le Host est absent ; quitter
volontairement reste immédiat. Un redémarrage du serveur perd tous les salons.
Voir [navigation et reprise](navigation.md) pour les limites et les tests.

## Lobby et lancement

`Player.isReady` est propre au joueur associé à la connexion. `hostPlayerId`
reste la source unique du rôle Host : aucun booléen Host contrôlable par le
client. La liste conserve aussi les joueurs en attente de reprise, avec
`isConnected: false`. Ils empêchent le lancement tant qu’ils ne sont pas revenus.

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
au profit de l'union discriminée `GameState`. Depuis l’étape 5, `SUBMISSION`
porte aussi une échéance `deadlineAt`, appliquée par le service et affichée par le client.
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

La [phase de soumission avec timer](submission.md) est raccordée : stockage privé
des images, progression agrégée et accusé personnel, clôture anticipée
ou à échéance. Les autres contrats métier seront introduits lorsqu’ils deviennent nécessaires.

Les étapes suivantes sépareront les commandes, services métier, moteur de jeu
et projections publiques. L’attente d’un joueur ayant soumis reste distincte
de la phase globale. Le serveur est l’autorité pour les échéances ; les scores restent à venir.

Tailwind, Zustand, Motion, Supabase, PostgreSQL et Prisma ne sont
pas installés comme dépendances. Supabase Storage est utilisé via HTTP natif côté
serveur ; `sharp` est ajouté pour décoder et réencoder les images. Voir [les images](image-upload.md).
React Router sépare `/room/:roomCode` et `/game/:roomCode` selon la phase reçue
du serveur, avec le socket et `useRoom` conservés au-dessus des routes. Le gâteau est une décoration
CSS statique, sans mécanique de jeu. Aucune nouvelle dépendance aux étapes 2 à 5.

## Références

- [TypeScript natif dans Node.js](https://nodejs.org/api/typescript.html)
- [Événements Socket.IO typés](https://socket.io/docs/v4/typescript/)
- [Garanties de livraison Socket.IO](https://socket.io/docs/v4/delivery-guarantees/)
- [Cycle de vie Fastify](https://fastify.dev/docs/latest/Reference/Hooks/)
