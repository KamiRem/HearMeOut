# Frontend Hear Me Out

Workspace React + TypeScript + Vite du monorepo. Toutes les commandes initiales
s'exécutent depuis la racine : voir le [README principal](../README.md).

Après installation et compilation de shared, le frontend seul peut être lancé
avec `npm run dev -w @hear-me-out/client`. Le backend doit tourner séparément.

- `src/services/socket.ts` : création du client Socket.IO typé.
- `src/hooks/useConnection.ts` : connexion, nettoyage et test aller-retour.
- `src/hooks/useRoom.ts` : commandes de salon, snapshots, erreurs et synchronisation.
- `src/hooks/useCountdown.ts` : temps restant à partir d’une échéance et d’un échantillon d’heure serveur.
- `src/pages/HomePage.tsx` : pseudonyme, création et jonction par code.
- `src/RoomRoutes.tsx` : routes, redirections depuis l’état serveur et accès sans session.
- `src/pages/LobbyPage.tsx` : uniquement le lobby, le Host, Ready et les paramètres.
- `src/pages/GamePage.tsx` : layout de partie indépendant et composants des phases.
- `src/components/LeaveRoomButton.tsx` : départ partagé entre lobby et jeu.
- `src/services/roomSession.ts` : jeton privé de reprise dans sessionStorage.
- `src/components/LobbyControls.tsx` : brouillon des paramètres, Ready et bouton du Host.
- `src/components/GamePhasePanel.tsx` : affichage de la phase et du round confirmés par le serveur.
- `src/components/SubmissionPanel.tsx` : choix provisoire, validation, compte à rebours et attente individuelle.
- `src/components/ImagePicker.tsx` : fichier ou glisser-déposer, contrôles locaux, aperçu et libération des URL Blob.
- `src/components/RevealPanel.tsx` : images révélées et progression par le Host.
- `src/components/RevealCake.tsx` : gâteau partagé, pics animés et images agrandissables.
- `src/App.tsx` : assemblage des vues avec une seule connexion partagée.
- `vite.config.ts` : proxy HTTP et WebSocket vers le backend.

Voir [navigation et reprise](../docs/navigation.md) pour les routes et les scénarios de test.
