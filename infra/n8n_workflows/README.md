# N8N Workflows — La Ruche

## 7 workflows prêts à déployer

| Fichier | Workflow | Déclencheur | Action |
|---------|----------|-------------|--------|
| 01-health-monitor | Health Monitor | Cron 15min | Vérifie La Ruche, alerte Telegram |
| 02-daily-report | Rapport Quotidien | Cron 9h00 | Génère + envoie rapport Telegram |
| 03-mission-webhook | Mission Webhook | POST /la-ruche-mission | Ajoute mission à La Ruche |
| 04-github-pr-review | GitHub PR Review | GitHub webhook | Revue code auto + Telegram |
| 05-email-triage | Email Triage | Cron 5min | Trie emails via La Ruche |
| 06-website-monitor | Website Monitor | Cron 5min | Vérifie URLs, alerte si down |
| 07-nightly-goals | Objectifs Nocturnes | Cron 1h00 | Génère objectifs, Telegram |

## Import rapide

```bash
cd ~/Projects/la-ruche
bash infra/n8n_workflows/import_all.sh
```

## Configuration après import

1. **Ouvrir N8N** : http://localhost:5678
2. **Créer credential Telegram** :
   - Settings → Credentials → Add → Telegram
   - Nom: `Telegram`
   - Token: ton bot token
3. **Variables d'environnement** dans N8N :
   - `TELEGRAM_ADMIN_ID` : ton chat ID Telegram
   - `RUCHE_URL` : URL de La Ruche (défaut: http://host.docker.internal:3000)
4. **Activer les workflows** souhaités (toggle ON)

## GitHub PR Review — Configuration webhook

1. Dans ton repo GitHub → Settings → Webhooks → Add webhook
2. URL: `http://TON_IP:5678/webhook/github-pr`
3. Content type: `application/json`
4. Events: Pull requests

## Variables d'env N8N (docker-compose)

```yaml
environment:
  - TELEGRAM_ADMIN_ID=123456789
  - RUCHE_URL=http://host.docker.internal:3000
  - DASHBOARD_URL=http://host.docker.internal:3001
```
