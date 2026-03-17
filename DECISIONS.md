# La Ruche — Décisions architecturales
*Historique des choix techniques clés*

## 2026-03-17

### D001 — Chimera comme base (pas ruche-corps)
**Décision** : Utiliser le monorepo Chimera (LaRuche) comme base, pas le projet ruche-corps (agent Python seul).
**Raison** : Chimera a déjà Queen Node.js + 9 agents + Dashboard + 250 tests. ruche-corps est solide mais limité (pas d'orchestration, pas de dashboard).
**Impact** : ruche-corps modules (ThinkingLayer, self_repair, goals, 58 outils) injectés dans les agents Chimera.

### D002 — 11 agents Python au lieu de 9
**Décision** : Ajouter `goals` (:8010) et `voice` (:8011) aux 9 agents Chimera existants.
**Raison** : Goals = objectifs autonomes (unique à ruche-corps). Voice = pipeline Whisper M2 pour commandes vocales.
**Impact** : Makefile mis à jour, ports :8001-:8011.

### D003 — Smart model routing
**Décision** : Router automatiquement chaque tâche vers le modèle optimal (9 types).
**Raison** : 15 modèles disponibles dont qwen3-coder:480b pour le code et llama3.2:3b pour le rapide. Utiliser le mauvais modèle = 10x plus lent pour rien.
**Impact** : model_router_service.py reécrit avec TaskType enum + MODEL_MAP.

### D004 — N8N comme backbone d'intégration
**Décision** : Utiliser N8N (déjà présent en Docker) comme hub d'automatisation plutôt que de construire les intégrations en Python.
**Raison** : N8N = 500+ connecteurs natifs (Gmail, GitHub, Slack, etc.). Ne pas réinventer la roue.
**Impact** : n8n_service.py dans executor, webhook /n8n dans Queen, 7 workflows prêts.

### D005 — ProactiveLoop dans Queen (pas dans les agents Python)
**Décision** : La boucle de surveillance (health checks, rapport quotidien) tourne dans Queen Node.js, pas dans un agent Python séparé.
**Raison** : Queen est le processus toujours actif et central. Évite un 12ème agent Python pour une tâche d'orchestration.
**Impact** : proactive_loop.js importé dans queen_oss.js.

### D006 — docker-compose pour déploiement client
**Décision** : Fournir un docker-compose.yml unifié + install.sh pour déploiement client one-click.
**Raison** : Reproductibilité garantie. Le client ne doit pas installer manuellement Node/Python/uv/pnpm.
**Impact** : docker-compose.yml avec Queen + Agents + Dashboard + Redis + ChromaDB + N8N.

### D007 — Workflows N8N en JSON versionnés dans Git
**Décision** : Stocker les 7 workflows N8N en tant que fichiers JSON dans infra/n8n_workflows/workflows/.
**Raison** : Reproductible, versionné, importable via `n8n import:workflow`. Pas de config manuelle en UI.
**Impact** : import_all.sh utilise `docker cp` + `n8n import:workflow` pour charger tous les workflows en un seul script.
