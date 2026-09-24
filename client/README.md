# Frontend Hear Me Out

Workspace React + TypeScript + Vite du monorepo. Toutes les commandes initiales
s'exécutent depuis la racine : voir le [README principal](../README.md).

Après installation et compilation de shared, le frontend seul peut être lancé
avec `npm run dev -w @hear-me-out/client`. Le backend doit tourner séparément.

- `src/services/socket.ts` : création du client Socket.IO typé.
- `src/hooks/useConnection.ts` : connexion, nettoyage et test aller-retour.
- `src/hooks/useRoom.ts` : commandes de salon, snapshots, erreurs et synchronisation.
- `src/pages/HomePage.tsx` : pseudonyme, création et jonction par code.
- `src/pages/RoomPage.tsx` : salon, Host, Ready, départ et confirmation du lancement.
- `src/components/LobbyControls.tsx` : brouillon des paramètres, Ready et bouton du Host.
- `src/components/GamePhasePanel.tsx` : affichage de la phase et du round confirmés par le serveur.
- `src/App.tsx` : assemblage des vues avec une seule connexion partagée.
- `vite.config.ts` : proxy HTTP et WebSocket vers le backend.
