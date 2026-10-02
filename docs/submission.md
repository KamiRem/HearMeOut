# Soumission — étapes 5 et 6

Le lancement ouvre `SUBMISSION` avec une échéance absolue `deadlineAt`, calculée
sur l’horloge serveur à partir de `submissionDuration`. La machine reste pure :
les événements internes `START_GAME` et `NEXT_ROUND` lui fournissent cette échéance.

## Commande et données

`image:prepare` reçoit `{ requestId, roomId, gameId, roundId }`. Le schéma Zod strict
refuse les champs supplémentaires, notamment un auteur fourni par le client.
Le service retrouve le joueur grâce à sa connexion et vérifie salon, partie,
round, phase, échéance, participation et absence de choix déjà validé.
Le jeton privé obtenu autorise un `POST /api/images`. Après validation du fichier
et stockage, le serveur applique `RoomService.submit` en interne. L’ancien événement
`round:submit` et les choix d’exemple ont été supprimés. Voir [les images](image-upload.md).

Le modèle serveur `SubmissionRound` contient les joueurs attendus et les
`Submission` indexées par auteur. Chaque soumission reçoit son propre UUID,
le round, l’auteur, la référence d’image et l’heure de validation. Le snapshot public expose
uniquement `{ roundId, submitted, expected }` dans `submissionProgress`.
La réponse HTTP privée et `room:sync` renvoient `ownSubmission: { roundId, image }` :
`image: null` indique que le joueur n’a pas encore validé pour ce round.
Les choix et leurs auteurs ne sont jamais diffusés au salon.

Le cache d’idempotence s’applique à la préparation du jeton. L’envoi HTTP consomme
ce jeton une seule fois ; `room:sync` réconcilie une réponse d’envoi incertaine.
Une seconde validation ne peut pas remplacer le choix verrouillé.

## Timer et clôture

`RoomService` possède un timer par salon et une horloge injectable dans les tests.
Le callback vérifie qu’il correspond toujours au timer et à l’état capturés à sa
création. Un callback précoce est reprogrammé ; un callback obsolète est ignoré.
La vérification de l’échéance se fait également avant toute insertion : un timer
retardé par la boucle d’événements ne prolonge pas la période de soumission.

La phase se ferme lorsque tous les joueurs attendus ont validé ou lorsque
`now >= deadlineAt`. Le serveur mélange les identifiants des soumissions, puis
applique `END_SUBMISSION`. Au moins un choix mène à `WAITING` ; aucun choix mène à
`ROUND_RESULTS`. Le callback publie le snapshot aux membres du salon uniquement.
Le serveur n’expose aucun bouton permettant au client de forcer cette transition.

Les départs sans choix retirent le joueur des participants attendus ; les choix
déjà validés restent conservés. Une partie peut donc terminer la soumission
avec un seul joueur encore connecté. Les nouvelles jonctions restent interdites.
Le départ du Host ferme le salon. Les timers sont annulés lors de la clôture de
phase, de la fermeture du salon et de l’arrêt de l’application.

## Affichage

`room:update` reçoit un second argument `serverNow`, également présent dans les
accusés d’appartenance. `useRoom` conserve un échantillon de cette heure avec
`performance.now()` à la réception. `useCountdown` déduit le temps restant du
temps monotone écoulé : changer l’heure locale du navigateur ne change pas le
compte à rebours. La latence réseau peut décaler légèrement l’affichage ; le
serveur décide toujours si une validation est acceptée.

`SubmissionPanel` porte uniquement la sélection provisoire. Après confirmation,
il affiche le choix verrouillé et l’attente individuelle ; la phase du salon
reste `SUBMISSION` jusqu’à sa clôture. À zéro, les actions sont désactivées et le
client attend le snapshot serveur. Un nouveau round recrée ce composant.

Cette version s’arrête après les soumissions : aucun gâteau interactif,
vote ou enchaînement automatique des rounds. La reprise de session après une
déconnexion reste prévue à l’étape 11.
