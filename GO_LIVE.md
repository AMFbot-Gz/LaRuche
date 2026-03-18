# LaRuche — Mise en ligne en 1 heure

> Temps estimé : 45-60 min (dont attente DNS ~5 min)
> Coût initial : 0€ (tous les services ont un tier gratuit)

---

## Ce dont tu as besoin

| Service | Quoi créer | Temps |
|---|---|---|
| [neon.tech](https://neon.tech) | Projet Postgres gratuit | 2 min |
| [clerk.com](https://clerk.com) | Application (auth) | 5 min |
| [stripe.com](https://stripe.com) | Compte + prix PRO/TEAMS | 10 min |
| [console.anthropic.com](https://console.anthropic.com) | Recharger crédits | 5 min |
| [railway.app](https://railway.app) | Compte + projet | 5 min |
| [vercel.com](https://vercel.com) | Compte | 2 min |

---

## Étape 1 — Récupérer les clés (15 min)

### Neon (base de données)
1. neon.tech → Sign up → New Project → "laruche"
2. Dashboard → Connection Details → copier la string `postgresql://...`
3. Noter comme `DATABASE_URL`

### Clerk (authentification)
1. clerk.com → Create application → "LaRuche"
2. Configure → API Keys → copier :
   - `CLERK_SECRET_KEY` (commence par `sk_...`)
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (commence par `pk_...`)

### Stripe (paiement)
1. stripe.com → Dashboard → Developers → API Keys
2. Copier `STRIPE_SECRET_KEY` (commence par `sk_test_...` pour les tests)
3. Products → New Product → "LaRuche Pro" → $19/mois → copier `STRIPE_PRO_PRICE_ID`
4. Products → New Product → "LaRuche Teams" → $79/mois → copier `STRIPE_TEAMS_PRICE_ID`
5. Developers → Webhooks → Add endpoint → URL Railway `/api/billing/webhook` (après déploiement)

### Anthropic
1. console.anthropic.com → Billing → ajouter $10
2. API Keys → copier `ANTHROPIC_API_KEY`

---

## Étape 2 — Déployer la Queen sur Railway (15 min)

```bash
# Installer Railway CLI
npm install -g @railway/cli

# Se connecter
railway login

# Dans le dossier LaRuche
cd ~/Projects/LaRuche
railway init
# → Choisir "Empty project"
# → Nommer le service "laruche-queen"

# Premier déploiement
railway up
```

Puis dans le dashboard Railway → ton projet → laruche-queen → Variables :
Copier toutes les variables de `.env.railway.example` avec les vraies valeurs.

```bash
# Générer CHIMERA_SECRET
openssl rand -hex 32
```

Vérifier que la Queen répond :
```bash
curl https://ton-app.railway.app/api/health
# → {"ok":true,"ts":...}
```

Copier l'URL Railway → noter comme `RAILWAY_PUBLIC_URL`

---

## Étape 3 — Déployer le Dashboard sur Vercel (10 min)

```bash
npm install -g vercel
cd ~/Projects/LaRuche/apps/dashboard
vercel login
vercel --prod
```

Vercel va détecter Next.js automatiquement. Pendant le setup :
- Root directory : laisser vide (Vercel utilise `vercel.json`)
- Framework : Next.js (auto-détecté)

Puis dans le dashboard Vercel → Settings → Environment Variables :
```
NEXT_PUBLIC_API_URL=https://ton-app.railway.app
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

Redéployer pour prendre en compte les variables :
```bash
vercel --prod
```

---

## Étape 4 — Migration base de données (2 min)

```bash
cd ~/Projects/LaRuche
DATABASE_URL="postgresql://..." pnpm --filter=@chimera/db db:migrate
```

---

## Étape 5 — CI/CD automatique (5 min)

Dans GitHub → ton repo → Settings → Secrets → Actions, ajouter :

| Secret | Valeur |
|---|---|
| `RAILWAY_TOKEN` | railway.app → Account → Tokens → New Token |
| `RAILWAY_PUBLIC_URL` | URL de la Queen Railway |
| `VERCEL_TOKEN` | vercel.com → Settings → Tokens → Create |
| `VERCEL_ORG_ID` | vercel.com → Settings → General → Team ID |
| `VERCEL_PROJECT_ID` | vercel.com → ton projet → Settings → General → Project ID |

Désormais, chaque `git push main` :
1. Lance les 124 tests Jest + 430 pytest
2. Si tous verts → déploie Railway + Vercel automatiquement

---

## Vérifications finales

```bash
# Queen répond
curl https://ton-app.railway.app/api/health

# Dashboard accessible
open https://laruche-dashboard.vercel.app

# Stripe webhook (après l'avoir configuré)
stripe trigger checkout.session.completed
```

---

## Webhook Stripe (post-déploiement)

Une fois la Queen déployée :
1. stripe.com → Developers → Webhooks → Add endpoint
2. URL : `https://ton-app.railway.app/api/billing/webhook`
3. Events : `checkout.session.completed`, `customer.subscription.*`
4. Copier le `STRIPE_WEBHOOK_SECRET` → mettre à jour dans Railway Variables

---

## Résumé des URLs

| Service | URL |
|---|---|
| Queen API | `https://laruche-queen-xxx.railway.app` |
| Dashboard | `https://laruche-dashboard.vercel.app` |
| Health | `https://laruche-queen-xxx.railway.app/api/health` |

---

*Une fois GO_LIVE terminé, supprimer ce fichier ou le déplacer dans docs/.*
