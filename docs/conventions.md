# Conventions du projet

## Périmètre et dépendances

- Avancer selon les étapes du brief ; expliquer les changements importants avant
  de les implémenter. Ne pas anticiper les fonctionnalités futures dans le code.
- Conserver npm workspaces et un verrou de dépendances unique à la racine.
- Ajouter une dépendance uniquement lorsqu'elle répond à un besoin immédiat.
- Préférer des composants simples et des fonctions métier testables.

## TypeScript et style

- TypeScript strict ; base commune dans `tsconfig.base.json`.
- ESM, imports de types avec `import type`, pas de `any` sans justification.
- Deux espaces, apostrophes simples et absence de points-virgules dans TypeScript,
  conformément au frontend initial ; Oxlint est le linter commun.
- Noms techniques en anglais ; interface et documentation en français.
- Backend et shared : extensions `.ts` pour les imports locaux. Le build les
  réécrit en `.js`. Le backend en développement utilise le support natif de Node 24.
- Pas d'enums ou de syntaxe nécessitant une transformation à l'exécution.
- Client : résolution Vite, imports locaux sans extension ou `.tsx` existants.

## Frontières

- `shared` contient les contrats publics, jamais de secrets, sessions privées ou
  dépendances à React, Node, Fastify ou Socket.IO.
- Le frontend affiche l'état serveur et émet des intentions ; les règles, scores,
  contrôles d'accès et transitions de jeu appartiennent au serveur.
- Valider les données externes à l'exécution, même si leur type est partagé.
- Les handlers Socket.IO délèguent aux services quand la logique métier arrive.
- Construire explicitement les vues publiques ; ne jamais diffuser un modèle
  interne complet contenant auteurs cachés, votes ou jetons.
- Nettoyer abonnements, connexions et timers à la fin de leur cycle de vie.
- Ne pas committer de secret, `.env`, `node_modules` ou artefact de build.

## Vérification

- Exécuter build, typecheck et lint après une modification du socle.
- Tester les frontières réseau et les règles métier, notamment les données
  invalides, délais et actions interdites, au fil de leur implémentation.
- Garder les tests indépendants : ports éphémères et fermeture des ressources.
