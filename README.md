# LSSD — Recrutement Discord

Bot en français utilisant les interactions HTTP Discord et Cloudflare Workers + D1. Aucun ordinateur à laisser allumé, aucun intent privilégié. Serveur autorisé : `1564674450069135440`.

## Fonctionnement

- Un administrateur publie le panneau via `/lssd-config instructeur:@Instructeur salon:#recrutement`.
- Le bouton ouvre un formulaire : Prénom Nom, Motivations, Expériences, Pourquoi vous et pas quelqu’un d’autre ?
- À la validation, le bot crée un salon privé pour le candidat, les Instructeurs et le bot, et y publie les réponses. Une seule candidature ouverte par personne, même après un redémarrage.
- Un fil privé non invitable est créé dans le dossier pour les délibérations. Le rôle Instructeur dispose de Gérer les fils et peut le consulter sans invitation individuelle. Le candidat n’est pas invité dans ce fil.
- Les boutons réservés au rôle Instructeur permettent de retrouver/créer le fil et de clôturer le dossier. La clôture retire l’accès du candidat et conserve le dossier ; elle permet une nouvelle candidature.

Les administrateurs/propriétaires du serveur conservent leurs accès Discord. Un candidat possédant Administrateur ou Gérer les fils par un autre rôle peut également avoir accès aux délibérations : ne donnez pas ces permissions aux candidats. Ne leur attribuez pas le rôle Instructeur. Les anciens dossiers gardent leurs permissions lors d’un changement du rôle configuré ; révisez-les manuellement.

## Installation locale

Node.js 22 ou supérieur, npm et un compte Cloudflare gratuit.

```powershell
cd D:\lssd-bot
npm ci
Copy-Item .dev.vars.example .dev.vars
```

Dans https://discord.com/developers/applications, créez une application, puis son bot. Dans `.dev.vars`, renseignez localement :

- `DISCORD_TOKEN` : token de la page Bot.
- `DISCORD_PUBLIC_KEY` : Public Key de General Information.
- `DISCORD_APPLICATION_ID` : Application ID.
- `GUILD_ID` : déjà prérempli.

Ne partagez pas le token et ne commitez pas `.dev.vars`. Aucun secret n’est requis dans GitHub.

## Déploiement gratuit sur Cloudflare

```powershell
npx wrangler login
npx wrangler d1 create lssd-bot
```

Copiez le `database_id` obtenu dans `wrangler.toml`, puis :

```powershell
npm run db:remote
npx wrangler secret put DISCORD_TOKEN
npx wrangler secret put DISCORD_PUBLIC_KEY
npm run deploy
npm run register
```

Les deux commandes `secret put` demandent les valeurs dans le terminal. Ouvrez le lien d’invitation affiché par `register` avec un compte pouvant gérer le serveur. Le bot ne demande pas Administrateur. Il lui faut Gérer les salons, Voir les salons, Envoyer des messages, Voir les anciens messages, Gérer les fils, Créer des fils privés et Envoyer des messages dans les fils ; autorisez aussi Intégrer des liens pour les embeds. Le bot peut apparaître hors ligne : il répond par HTTP sans connexion Gateway, c’est normal.

Dans General Information de l’application Discord, définissez **Interactions Endpoint URL** sur `https://lssd-recrutement.<votre-sous-domaine>.workers.dev/interactions` en reprenant l’URL exacte affichée au déploiement. Discord vérifie automatiquement la signature et le ping.

Dans Discord, lancez `/lssd-config` avec le rôle et le salon souhaités. Le bot doit pouvoir écrire et intégrer des liens dans le salon du panneau. Sa catégorie est automatiquement masquée à @everyone. Testez d’abord avec un compte candidat sans privilèges : formulaire, contenu du dossier, confidentialité du fil, réponse Instructeur, clôture et nouvelle candidature. Vérifiez avec un autre compte sans rôle qu’aucun dossier n’est visible.

L’hébergement utilise les quotas gratuits Workers/D1 ; aucun abonnement payant n’est nécessaire pour ce projet. Les quotas et conditions Cloudflare peuvent évoluer : https://developers.cloudflare.com/workers/platform/limits/ et https://developers.cloudflare.com/d1/platform/pricing/. Le déploiement exige la connexion à votre propre compte et la création de l’application Discord.

## Développement et contrôles

```powershell
npm test
npm run db:local
npm run dev
```

Les tests couvrent les signatures Discord, les permissions du dossier/fil, les candidatures en double, la clôture et les refus d’accès. Pour mettre à jour : `npm ci`, `npm test`, `npm run deploy`. Pour actualiser la commande : `npm run register`.

Les réponses aux formulaires restent dans les salons Discord privés ; D1 ne contient que les identifiants des dossiers, du serveur, des utilisateurs et leur état. Les dossiers fermés sont conservés jusqu’à leur suppression manuelle par un administrateur. Une création interrompue brutalement peut laisser une réservation `creating` : vérifier qu’aucun salon n’a été créé avant de corriger la ligne dans D1. Si le salon est créé mais la publication échoue, un Instructeur peut consulter le salon et demander une nouvelle candidature après clôture ; ne republiez pas les réponses dans un espace public.
