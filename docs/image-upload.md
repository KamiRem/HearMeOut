# Images — étape 6

## Configurer Supabase

1. Créer un projet Supabase, ou utiliser un projet existant.
2. Dans **Storage**, créer un bucket nommé `hear-me-out`, avec **Public bucket
   désactivé**, limite de fichier **5 242 880 octets** et type autorisé
   **`image/webp`**. Le backend convertit les JPEG, PNG et WebP en WebP.
3. Ne pas ajouter de politique autorisant les clients anonymes à lire ou écrire
   dans ce bucket : toutes les opérations passent par le serveur.
4. Copier `server/.env.example` vers `server/.env`, puis renseigner les trois
   variables suivantes avec les valeurs du projet :

   ```dotenv
   SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   SUPABASE_SECRET_KEY=YOUR_BACKEND_SECRET_KEY
   SUPABASE_STORAGE_BUCKET=hear-me-out
   ```

   Utiliser la clé serveur `sb_secret_…`, ou la clé JWT historique `service_role`.
   La clé publique `anon`/`sb_publishable_…` ne convient pas. Ne jamais mettre
   cette clé dans le frontend, une variable `VITE_…`, Git ou un message de chat.
   `server/.env` est ignoré par Git.
5. Relancer `npm run dev`, ouvrir **http://localhost:5173**, créer un salon avec
   deux joueurs et lancer la partie. Choisir un fichier puis le valider.

Sans configuration, le lobby et le timer fonctionnent, mais la validation affiche
« Le stockage d’images n’est pas encore configuré sur ce serveur ». Il n’y a pas
de stockage local de remplacement en production. Une configuration partielle
empêche le démarrage avec un message explicite. Un bucket public est refusé avant
l’écriture. Les tests utilisent un stockage simulé, sans identifiants Supabase.

## Parcours

La sélection via fichier ou glisser-déposer reste locale jusqu’au clic sur
« Valider mon Hear Me Out ». `ImagePicker` affiche un aperçu avec une URL Blob,
libérée au remplacement et au démontage. Le joueur peut changer de fichier avant
l’envoi. Pendant l’envoi, les actions sont désactivées et le timer continue.

Le navigateur demande `image:prepare` sur sa connexion Socket.IO. Le serveur
vérifie l’appartenance au salon, la partie, le round, l’échéance et l’absence de
soumission. Il renvoie en privé un jeton aléatoire de 256 bits, valable au maximum
60 secondes et jamais après la fin de la soumission. Un nouveau jeton remplace
le précédent de cette connexion ; le cache de requêtes évite de le recréer lors
du rejeu du même `requestId`.

Le navigateur envoie ensuite le fichier brut à **`POST /api/images`**, avec son
type MIME et `Authorization: Bearer <jeton>`. Aucun nom de fichier, auteur, chemin
de stockage ou URL n’est accepté du client. Le serveur consomme le jeton une seule
fois et réserve une place avant de lire le corps : au plus quatre envois sont
traités simultanément, dont un par connexion.

## Validation et stockage

- Limite HTTP et métier : **5 Mio**, corps non vide.
- Formats : JPEG, PNG, WebP non animés. SVG, GIF et autres formats refusés.
- Vérification de la signature, du format détecté et du décodage complet par
  `sharp`. L’extension ne sert pas de preuve.
- Au plus **20 millions de pixels** en entrée ; traitement limité en durée.
- Orientation EXIF appliquée, métadonnées retirées, image redimensionnée sans
  agrandissement dans un cadre **2048 × 2048**, puis réencodée en WebP.
- Objet nommé `<roomId>/<roundId>/<UUID>.webp` dans le bucket privé. Ni fichier
  local permanent ni binaire stocké dans une table PostgreSQL de l’application.
- Accès Supabase via `fetch` côté serveur, requêtes limitées en durée et sans
  redirection. La clé serveur ne sort jamais dans les réponses ou les snapshots.

Après stockage, le serveur **revérifie** les règles de soumission. Si le round
est terminé ou le joueur est parti, l’objet est supprimé sans valider le choix.
Sinon, il enregistre la soumission et diffuse uniquement le compteur public.
La réponse HTTP privée contient `RoomMembership`, avec l’image du joueur dans
`ownSubmission.image` : identifiant, dimensions et URL signée valable une heure.
La clé interne de stockage reste privée au serveur. Une URL signée est un lien
porteur : quelqu’un à qui le joueur transmet ce lien peut le lire jusqu’à son
expiration ou à la suppression de l’objet.

Une erreur de stockage ne verrouille pas le joueur. Il peut réessayer avant la
fin du temps. Si la réponse réseau est perdue, `room:sync` retrouve la soumission
confirmée, ce qui évite d’envoyer deux fois une image déjà verrouillée.

## Cycle de vie et limites

Les objets validés restent dans le bucket pendant le round, même si leur auteur
quitte le salon. Ils sont supprimés à la fermeture du salon, à l’arrêt propre du
serveur et lors du passage au round suivant. Les objets d’un envoi échoué après
écriture sont également supprimés. Le nettoyage réessaie trois fois et journalise
uniquement la clé d’objet si les tentatives échouent ; l’arrêt attend ces tâches.

Ce nettoyage est **au mieux** : un arrêt brutal, une panne réseau persistante ou
une écriture distante terminée après un timeout peut laisser des objets orphelins.
Les salons étant en mémoire, ils ne peuvent pas être restaurés au redémarrage.
Pour ce MVP, utiliser un bucket dédié et supprimer ses objets orphelins après
l’arrêt de toutes les parties. Une rétention durable automatisée reste à prévoir
avec la persistance ; ne pas vider un bucket partagé avec une autre application.

Les aperçus signés expirent après une heure. Depuis l’étape 7, le lien d’une image
est renouvelé avant sa révélation, sans réenvoyer le fichier. Voir
[les révélations](reveals.md), notamment la limite des salons laissés inactifs.
Les votes et la progression automatique des rounds restent à venir.

## Vérifier

`npm test` couvre le parcours HTTP + Socket.IO, les règles de soumission, les
jetons privés et rejoués, la falsification des formats, les limites de taille et
de pixels, les erreurs de stockage et les courses avec l’échéance ou le départ.
Le transport Supabase est testé avec des réponses simulées ; une vérification
réelle nécessite les trois variables ci-dessus et un bucket privé existant.

En navigateur, essayer deux onglets, un fichier invalide, le glisser-déposer,
un changement d’image avant validation, puis la validation des deux joueurs.
Après validation, l’auteur voit son image verrouillée ; l’autre joueur voit
uniquement le compteur. Tester aussi l’expiration sans soumission et la fermeture
du salon, puis vérifier que les objets correspondants disparaissent du bucket.

Références : [buckets privés Supabase](https://supabase.com/docs/guides/storage/buckets/fundamentals),
[clés API Supabase](https://supabase.com/docs/guides/getting-started/api-keys),
[limites de décodage sharp](https://sharp.pixelplumbing.com/api-constructor/).
