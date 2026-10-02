# Navigation : lobby et jeu

| URL | Écran |
| --- | --- |
| `/` | Accueil, création et jonction |
| `/room/:roomCode` | Lobby uniquement : joueurs, Host, Ready et paramètres |
| `/game/:roomCode` | Partie : toutes les phases autres que `LOBBY` |

`BrowserRouter` est monté dans `main.tsx`. `App` conserve une seule connexion
Socket.IO et une seule instance de `useRoom`, au-dessus des routes. Naviguer ne
recrée donc ni le socket, ni l’appartenance au salon.

## Redirection depuis l’état serveur

`RoomRoutes` calcule la route canonique depuis `membership.room.state.phase` :
`LOBBY` correspond à `/room/CODE`, toute autre phase à `/game/CODE`. Dès que
`game:start` est accepté et `room:update` diffusé, chaque client reçoit la phase
`SUBMISSION` et navigue avec `replace`. Il n’y a ni redirection optimiste sur le
bouton du Host, ni copie locale concurrente de la phase.

Un membre sur la mauvaise route, un autre code ou une ancienne entrée d’historique
est ramené vers son salon et sa phase réels. Sans session, une URL `/game/CODE`
ramène au formulaire de jonction `/room/CODE`, avec le code prérempli. Le backend
continue à refuser une nouvelle jonction après lancement. Un code de salon n’est
pas une preuve d’identité. Les routes inconnues et codes mal formés ramènent à l’accueil.

`LobbyPage` remplace `RoomPage` et ne contient plus aucun composant de partie.
`GamePage` possède son layout, le contenu central et une présence compacte des
joueurs. Elle délègue `SUBMISSION` à `SubmissionPanel` et les autres phases à
`GamePhasePanel`, y compris `SUBMISSION_RESULTS`. Les réglages, Ready et le bloc
de code du lobby ne sont pas montés dans la page de jeu. `LeaveRoomButton` partage
uniquement l’action de départ entre les deux pages.

## Rechargement et reprise

La reconnexion précédente rétablissait uniquement le transport. Pour permettre
le rechargement demandé, le serveur fournit maintenant un jeton aléatoire privé
de 256 bits dans `RoomMembership.sessionToken`. `roomSession.ts` le conserve en
`sessionStorage`, propre à l’onglet, et `useRoom` appelle `room:resume` à la connexion.
Il n’est pas placé dans l’URL ou les snapshots publics.

Pendant la restauration, un écran d’attente évite d’afficher le mauvais écran.
Le client ne décide de la route qu’après réception de l’appartenance confirmée.
Une réponse tardive d’une ancienne connexion est ignorée. En cas de timeout,
le jeton est conservé et un bouton permet de réessayer. Une session expirée ou un
salon fermé ramène à l’accueil avec un message.

Après déconnexion détectée, le serveur garde la place **60 secondes**. Pendant
ce délai, `isConnected` vaut `false` et le lobby ne peut pas démarrer tant qu’un
joueur manque. La reprise conserve UUID joueur, rôle Host, Ready, phase, échéance
et image déjà validée. Les timers continuent : recharger ne redonne pas de temps.
Une image seulement sélectionnée localement devra être sélectionnée de nouveau.

À l’expiration, un invité est retiré ; si c’est le Host, le salon ferme pour tous.
Le bouton Quitter invalide immédiatement la session, sans délai de reprise.
Une session ne contrôle qu’une connexion : la reprise dans un onglet dupliqué
remplace la connexion précédente, qui est informée puis déconnectée.

Les salons et sessions restent en mémoire : un redémarrage du backend ne permet
pas la reprise. Si `sessionStorage` est indisponible, un message signale que le
rechargement ne pourra pas conserver la session. Fermer l’onglet n’offre pas une
garantie de reprise, car la durée de vie de `sessionStorage` dépend de cet onglet.

## Fichiers concernés

- Client : `src/main.tsx`, `src/App.tsx`, `src/RoomRoutes.tsx`, `src/App.css`,
  `src/pages/HomePage.tsx`, `src/pages/LobbyPage.tsx` (remplace `RoomPage.tsx`),
  `src/pages/GamePage.tsx`, `src/components/LeaveRoomButton.tsx`,
  `src/components/LobbyControls.tsx`, `src/hooks/useRoom.ts`, `src/services/roomSession.ts`.
- Contrats : `shared/src/room.ts`, `shared/src/protocol.ts`.
- Serveur : `src/models/room.ts`, `src/services/roomService.ts`, `src/app.ts`,
  `src/socket/roomSchemas.ts`, `src/socket/registerRoomHandlers.ts`.
- Tests : `server/test/rooms.test.ts`, `server/test/session.test.ts`.
- Dépendances : `client/package.json`, `package-lock.json` (React Router).
- Documentation : `README.md`, `client/README.md`, `docs/architecture.md`,
  `docs/submission.md` et ce document.

## Vérification manuelle

1. Créer un salon et le rejoindre depuis un second onglet : les deux URL doivent
   être `/room/CODE`, avec les contrôles de lobby.
2. Rendre les deux joueurs prêts, puis lancer depuis le Host : les deux URL
   passent à `/game/CODE`. Aucun réglage, Ready ou bloc de code n’apparaît.
3. Avant lancement, ouvrir `/game/CODE` dans l’onglet du membre : retour au lobby.
   Après lancement, ouvrir `/room/CODE` : retour au jeu. Tester aussi Retour navigateur.
4. Recharger le Host et l’invité pendant `SUBMISSION`, puis après validation
   d’une image : mêmes joueurs et rôle, image verrouillée conservée, timer continu.
5. Ouvrir `/game/CODE` dans un onglet sans session : formulaire de jonction,
   aucune donnée de partie accessible. Un nouveau joueur ne peut pas rejoindre un jeu lancé.
6. Couper la connexion moins de 60 secondes, puis la rétablir : reprise automatique.
   Dépasser le délai : session expirée ; le Host absent entraîne la fermeture.
7. Quitter volontairement : retour à `/`, jeton supprimé. Fermer en tant que Host :
   tous les clients reviennent à l’accueil.

Les tests serveur couvrent la confidentialité des jetons, la reprise, le transfert
de connexion, les échéances, l’invalidation et les anciens callbacks. Le parcours
navigateur vérifié comprend les routes directes, l’historique, les rechargements,
les deux joueurs, les uploads et l’affichage mobile.

En production, le serveur qui héberge `client/dist` doit servir `index.html` pour
`/room/*` et `/game/*` afin de supporter les accès directs et rechargements.
Conserver les proxys `/api` et `/socket.io` vers Node. Vite fournit déjà ce repli
en développement et en preview. Aucun changement du stockage Supabase n’est requis.
