# Déploiement Nama IA

Projet Netlify créé :

- Nom : `namaia-officiel`
- Site ID : `2b9bc837-fe80-4ef6-a372-3c30dc1424ab`
- URL provisoire : `https://namaia-officiel.netlify.app`
- Projet Netlify : https://app.netlify.com/projects/namaia-officiel

## 1. Variables déjà préparées dans Netlify

Ces variables ont été configurées côté Netlify :

- `SITE_URL`
- `DATABASE_URL`
- `TOKEN_ENCRYPTION_KEY`
- `ADMIN_SETUP_TOKEN`
- `GOOGLE_REDIRECT_URI`
- `STRIPE_PRICE_STANDARD`
- `STRIPE_PRICE_PRO`
- `STRIPE_PRICE_BUSINESS`
- `STRIPE_PRICE_SETUP`

## 2. Variables à ajouter manuellement

Ces secrets doivent être copiés depuis tes dashboards, car ils ne sont pas lisibles par Codex :

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

Dans Netlify :

1. Ouvre le projet `namaia-officiel`.
2. Va dans `Project configuration` puis `Environment variables`.
3. Ajoute les variables ci-dessus.
4. Marque les secrets comme variables secrètes quand Netlify le propose.

## 3. Stripe

Produits et prix déjà créés dans Stripe :

- Standard : `price_1TSp2cRux5mrJJyWPBmzFTjd`
- Pro : `price_1TSp2hRux5mrJJyWioFEzhiA`
- Business : `price_1TSp2mRux5mrJJyWkY2HygQB`
- Installation unique 149 euros : `price_1TSp2rRux5mrJJyWIOHr2kst`

Après le premier déploiement, crée un webhook Stripe :

- URL : `https://namaia-officiel.netlify.app/api/stripe-webhook`
- Événements :
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`

Copie ensuite le secret du webhook `whsec_...` dans Netlify sous `STRIPE_WEBHOOK_SECRET`.

## 4. Google OAuth Calendar

Dans Google Cloud Console :

1. Crée ou sélectionne un projet Google Cloud pour Nama IA.
2. Active `Google Calendar API`.
3. Configure l’écran de consentement OAuth.
4. Crée un client OAuth de type `Application Web`.
5. Ajoute cette URI de redirection :
   - `https://namaia-officiel.netlify.app/api/google/callback`
6. Après liaison du domaine final, ajoute aussi :
   - `https://namaia.fr/api/google/callback`

Scopes utilisés :

- `https://www.googleapis.com/auth/calendar.events`
- `https://www.googleapis.com/auth/calendar.readonly`

Les identifiants à mettre dans Netlify :

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

## 5. Neon

Le schéma SQL est dans :

- `migrations/001_core.sql`

Si l’initialisation automatique via fonction Netlify n’est pas utilisée, colle ce fichier dans le SQL Editor de Neon et exécute-le sur la base `namaia`.

## 6. Domaine IONOS vers Netlify

Dans Netlify :

1. Ouvre `namaia-officiel`.
2. Va dans `Domain management`.
3. Ajoute `namaia.fr` comme domaine de production.

Dans IONOS, garde le domaine chez IONOS et configure les DNS externes :

- Domaine racine `namaia.fr` :
  - Type : `A`
  - Host : `@`
  - Value : `75.2.60.5`

- Sous-domaine `www.namaia.fr` :
  - Type : `CNAME`
  - Host : `www`
  - Value : `namaia-officiel.netlify.app`

La propagation DNS peut prendre quelques heures, parfois jusqu’à 24-48h.

Quand le domaine est actif, modifie dans Netlify :

- `SITE_URL=https://namaia.fr`
- `GOOGLE_REDIRECT_URI=https://namaia.fr/api/google/callback`

Puis redéploie.

## 7. Déploiement

Le déploiement automatique depuis Codex a été bloqué par les permissions réseau/npm de Windows.

Options propres :

1. Connecter ce dossier à GitHub puis relier GitHub à Netlify.
2. Installer Netlify CLI sur la machine et lancer :

```bash
netlify deploy --prod
```

Le dossier à publier est défini dans `netlify.toml` :

- `publish = "site"`
- `functions = "netlify/functions"`
