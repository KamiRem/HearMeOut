# Gâteau et révélations — étape 7

Après la soumission, `WAITING` affiche un gâteau vide. Le Host lance les
révélations puis avance d’une image à la fois. Chaque image rejoint le gâteau,
avec une animation CSS désactivée si le navigateur demande moins de mouvement.
Un clic ouvre un agrandissement dans un dialogue natif (bouton de fermeture,
Échap et retour du focus). Le gâteau accepte les 12 images d’un salon.

## Contrat et autorité

`reveal:start` et `reveal:next` prennent `requestId`, `roomId`, `gameId`, `roundId`
et `expectedVersion`. Aucun identifiant d’image ni auteur n’est accepté du client.
Les schémas Zod sont stricts. Le service vérifie la connexion, l’appartenance,
le rôle Host, la phase et la version de l’état.

L’ordre est mélangé côté serveur à la fermeture des soumissions. Le service
sélectionne l’image suivante dans cet ordre et renouvelle son URL Supabase avant
de publier la transition. Une erreur de signature laisse l’état intact et permet
de réessayer. Les vérifications sont répétées après cet appel asynchrone : un
départ, une reprise sur une autre connexion ou une commande concurrente ne peut
pas valider une ancienne transition.

Les handlers partagent le résultat des demandes identiques déjà en cours, puis
conservent le cache borné existant. Un identifiant réutilisé pour une autre
commande est refusé. Deux commandes distinctes sur la même version ne peuvent
pas avancer deux fois. La limitation de débit reste active.

`RoomSnapshot.revealedSubmissions` contient seulement les images déjà révélées :
identifiant de soumission, URL signée, largeur et hauteur. Aucun auteur, horodatage
d’envoi, identifiant de connexion ou ordre futur n’y figure. Le tableau est vide
avant la première révélation. Le choix personnel reste privé dans `ownSubmission`.
Les clichés publics sont reconstruits explicitement et diffusés via `room:update`.

## Progression et limites

Pour cette étape sans votes, `NEXT_REVEAL` est aussi autorisé depuis `REVEAL`.
La dernière commande mène à `ROUND_RESULTS`, sans inventer de score ou d’auteur.
Le gâteau reste affiché ; un round vide y mène directement avec un message adapté.
À l’étape 8, la progression manuelle depuis `REVEAL` devra être remplacée par
le cycle `VOTING → SUBMISSION_RESULTS → NEXT_REVEAL` déjà prévu dans le moteur.
Le démarrage automatique des rounds suivants appartient à l’étape 9.

Les images révélées sont conservées dans le round en mémoire et restaurées après
une reprise de session. Une nouvelle soumission de round réinitialise le gâteau.
Un invité parti après son envoi garde son image dans la file. Fermer le salon
supprime les objets comme auparavant.

Les liens privés renouvelés sont valables une heure à compter de chaque révélation.
Un salon laissé sur la même image plus longtemps nécessitera un futur mécanisme
de renouvellement pendant l’inactivité ; la reprise de session seule ne renouvelle
pas les liens déjà révélés. Une image impossible à charger affiche un substitut.
Les clés Supabase restent côté serveur.

## Fichiers et vérification

- `shared/src/reveal.ts` : commandes et projection publique.
- `server/src/services/roomService.ts` : sélection, autorisations et transition.
- `server/src/storage/imageStorage.ts` : signature d’un objet existant.
- `client/src/components/RevealPanel.tsx` : progression et commandes du Host.
- `client/src/components/RevealCake.tsx` : gâteau, pics et agrandissement.
- `server/test/reveal.test.ts` et `server/test/imageUpload.test.ts` : règles,
  courses asynchrones, confidentialité et parcours HTTP + Socket.IO.

Exécuter `npm test`, `npm run typecheck`, `npm run lint` et `npm run build`.
Le parcours manuel à deux onglets est décrit dans le README principal.
