# Feature Card — La Conscience de Chimera (HITL Loop)
> Version : 1.0 · Statut : **EN ATTENTE DE VALIDATION**
> Auteur : Clio (Architecte en chef) · Date : 2026-03-15

---

## 1. LE PROBLÈME — Pourquoi l'utilisateur en a besoin

### Ce qui se passe aujourd'hui

Chimera prend des décisions seule. Quand tu lui demandes "refactorise mon projet", elle choisit quels fichiers modifier, dans quel ordre, avec quel modèle. Elle agit. Elle n'hésite pas.

C'est puissant. C'est aussi le problème.

**Trois scénarios réels qui brisent la confiance :**

1. **L'ambiguïté silencieuse** : tu as deux projets nommés `chimera/`. Chimera choisit le mauvais. Elle modifie les mauvais fichiers. Tu le découvres 10 minutes plus tard.

2. **L'action irréversible** : Chimera va écrire dans un fichier de configuration critique. Elle pense que c'est OK. Toi, non — mais elle ne te demande pas.

3. **Le désaccord stratégique** : Chimera planifie 8 étapes pour résoudre ton problème. Tu en vois une qui est fausse dès le départ. Elle exécute tout avant que tu aies le temps de dire "stop".

### La conséquence

Tu n'as plus confiance. Tu surveilles chaque action comme si tu avais engagé un junior. La puissance de l'IA est annulée par ton anxiété. **L'assistant devient une charge.**

### Ce qu'on doit résoudre

> **Chimera doit savoir quand elle ne sait pas.** Elle doit pouvoir marquer une pause, te montrer son hésitation, et te donner le contrôle — sans te déranger pour les décisions triviales.

---

## 2. LA SOLUTION — Comment Chimera demande de l'aide

### Le principe : Confiance calibrée

Chimera évalue le risque de chaque action. En dessous d'un seuil → elle agit. Au-dessus → elle demande. Tu configures le seuil.

```
Risque 0.0-0.3  →  Action automatique (lire, analyser, chercher)
Risque 0.4-0.6  →  Notification visible mais pas bloquante
Risque 0.7-1.0  →  Pause complète, attente de ta décision
```

### Les 3 types d'interruptions

**Type A — La Clarification d'ambiguïté**
> *Chimera détecte plusieurs possibilités et ne sait pas laquelle choisir.*

```
╔════════════════════════════════════════════════════════╗
║  🤔 Chimera a besoin de toi                            ║
║                                                        ║
║  "Analyser mon projet chimera"                         ║
║  → J'ai trouvé 2 dossiers correspondants :            ║
║                                                        ║
║  ① ~/Projects/chimera/     (modifié il y a 2h)        ║
║  ② ~/Archive/chimera-old/  (modifié il y a 6 mois)    ║
║                                                        ║
║  [ ① Actif ]  [ ② Archive ]  [ Les deux ]  [ Annuler ]║
╚════════════════════════════════════════════════════════╝
```

**Type B — L'approbation d'action risquée**
> *Chimera va exécuter quelque chose d'irréversible.*

```
╔════════════════════════════════════════════════════════╗
║  ⚠️  Action risquée détectée                           ║
║                                                        ║
║  Chimera va exécuter :                                 ║
║  → rm -rf /tmp/chimera_build/                         ║
║  → git push origin main --force                       ║
║                                                        ║
║  Impact : irréversible sur la branche principale      ║
║                                                        ║
║  [ ✅ Approuver ]  [ ✏️ Modifier ]  [ ❌ Refuser ]    ║
╚════════════════════════════════════════════════════════╝
```

**Type C — La Validation de plan**
> *Avant d'exécuter un plan long, Chimera le montre d'abord.*

```
╔════════════════════════════════════════════════════════╗
║  📋 Plan en 5 étapes — Valider avant exécution        ║
║                                                        ║
║  1. ✅ Analyser la structure du projet                 ║
║  2. ✅ Identifier les fichiers à modifier              ║
║  3. ⚠️  Modifier config.ts (fichier critique)         ║
║  4. ✅ Lancer les tests                               ║
║  5. ⚠️  Déployer si tests OK                          ║
║                                                        ║
║  [ ▶ Exécuter tout ]  [ ⏸ Étape par étape ]          ║
║  [ ✏️ Modifier le plan ]  [ ❌ Annuler ]              ║
╚════════════════════════════════════════════════════════╝
```

---

## 3. L'EXPÉRIENCE UTILISATEUR — Comment ça se passe

### Scénario complet : "Mets à jour mes dépendances Python"

```
1. Tu envoies la commande dans le terminal ou le dashboard

2. Chimera analyse → silence de 2s

3. [Dashboard] Notification apparaît :
   "📋 Plan prêt — 4 étapes · 1 approbation requise"

4. [Dashboard] La carte HITL s'ouvre automatiquement :
   ────────────────────────────────────
   Étape 3 sur 4 nécessite ton OK :
   "pip install --upgrade $(cat requirements.txt)"
   → 47 packages à mettre à jour
   → Certaines versions pourraient casser la compatibilité
   ────────────────────────────────────
   [ ✅ OK ]  [ 👁️ Voir le diff ]  [ ❌ Skip cette étape ]

5. Tu cliques OK → Chimera continue

6. Mission terminée → rapport dans le dashboard
```

### Modes de fonctionnement

| Mode | Comportement | Usage |
|------|-------------|-------|
| `manual` | Toute action risque > 0.3 demande approbation | Exploration prudente |
| `auto` | Seulement risque > 0.7 (défaut) | Usage quotidien |
| `trust` | Toutes actions automatiques | Power users confirmés |
| `step` | Pause après chaque étape | Debug / apprentissage |

Configurable dans `.env` : `HITL_MODE=auto` · `HITL_THRESHOLD=0.7`

### Comportement sur timeout

Si tu ne réponds pas en `HITL_TIMEOUT_SECONDS` (défaut: 120s) :
- Mode `auto` → action refusée, mission continue sans cette étape
- Mode `manual` → mission mise en pause, sauvegardée, reprend à ton retour

---

## 4. LE PLAN TECHNIQUE — Ce qu'on va construire

### Ce qui existe déjà (à activer)

```
✅ agentLoop.js    — requestHITL() + TOOL_RISK_MAP
✅ executor.js     — détection d'actions HIGH-risk
✅ config.js       — HITL_TIMEOUT_SEC, HITL_AUTO_APPROVE
✅ MissionStatus   — states pending/running/failed
✅ WebSocket       — infrastructure temps réel Queen → Dashboard
✅ NeuralEventBus  — event bus interne
```

### Ce qui manque (à construire)

```
❌ MissionStatus.WAITING   — nouvel état dans la machine d'état
❌ WebSocket HITL event    — Queen → Dashboard via WS
❌ API endpoint HITL       — POST /api/mission/:id/hitl_response
❌ Dashboard HitlCard      — composant React de décision
❌ Dashboard notification   — badge rouge sur missions en attente
❌ Persistance HITL        — si l'utilisateur recharge la page, la demande est toujours là
```

### Architecture des composants

```
┌─────────────────────────────────────────────────────────┐
│  Flux d'une interruption HITL                           │
│                                                         │
│  Queen (queen_oss.js)                                   │
│    │                                                     │
│    ├─ requestHITL() détecte risque > seuil             │
│    ├─ updateMissionState → WAITING_FOR_INPUT            │
│    ├─ WS event: { type: 'hitl_request', missionId,     │
│    │              question, options, risk, timeout }    │
│    │                                                     │
│    ▼                                                     │
│  Dashboard (React)                                      │
│    ├─ useChimeraSocket reçoit 'hitl_request'            │
│    ├─ Ouvre HitlCard (modal ou sidebar)                 │
│    ├─ Affiche question + options + countdown            │
│    ├─ User clique → POST /api/mission/:id/hitl_response │
│    │                                                     │
│    ▼                                                     │
│  Queen (API)                                            │
│    ├─ Reçoit la réponse HTTP                            │
│    ├─ Émet 'laruche:hitl_response' sur process         │
│    ├─ requestHITL() se résout                          │
│    └─ Mission reprend                                   │
└─────────────────────────────────────────────────────────┘
```

### Nouveaux fichiers à créer

| Fichier | Rôle |
|---------|------|
| `apps/queen/src/types/hitl.js` | Types HITLRequest, HITLResponse, HITLStatus |
| `apps/queen/src/api/hitl_routes.js` | POST /api/mission/:id/hitl_response |
| `apps/dashboard/src/components/HitlCard.tsx` | Composant de décision utilisateur |
| `apps/dashboard/src/components/HitlBadge.tsx` | Badge missions en attente |
| `apps/queen/src/core/hitl_manager.js` | Gestionnaire centralisé des demandes HITL |

### Modifications de fichiers existants

| Fichier | Changement |
|---------|-----------|
| `apps/queen/src/types/mission.js` | Ajouter `WAITING_FOR_INPUT` à MissionStatus |
| `apps/queen/src/agents/agentLoop.js` | Connecter requestHITL() au hitl_manager |
| `apps/queen/src/api/missions.js` | Enregistrer hitl_routes |
| `apps/dashboard/src/store/chimera.ts` | Ajouter hitl_requests à l'état global |
| `apps/queen/src/queen_oss.js` | Brancher consciousness si `enabled: true` |
| `ruche_config.json` | `"consciousness": { "enabled": true }` |

---

## 5. PLAN DE LIVRAISON — 3 phases

### Phase 1 — MVP Terminal (1 jour)
> "La conscience parle dans ton terminal."

- Activer `enabled: true` dans ruche_config.json
- Brancher requestHITL() sur le WS Dashboard
- L'approbation se fait par `curl` ou via Dashboard
- **Résultat** : Chimera pause et attend. Tu réponds. Elle continue.

### Phase 2 — Interface Dashboard (2 jours)
> "Tu vois la pensée de Chimera en temps réel."

- HitlCard React avec countdown animé
- Badge rouge sur les missions en attente
- Persistance de la demande HITL (refresh-safe)
- **Résultat** : Interface de décision propre et intuitive.

### Phase 3 — Intelligence de la conscience (3 jours)
> "Chimera apprend de tes décisions."

- Mémoriser les décisions HITL dans Memory Agent
- "Tu as toujours approuvé les git push → je ne demande plus"
- Mode `step` avec visualisation du plan complet avant exécution
- **Résultat** : La conscience devient adaptive.

---

## 6. CRITÈRES DE SUCCÈS

- [ ] Une mission avec action HIGH-risk pause automatiquement
- [ ] La carte HITL apparaît dans le dashboard en < 500ms
- [ ] L'approbation/refus relance la mission sans perte de contexte
- [ ] Le timeout auto-refuse proprement (pas de mission zombie)
- [ ] Un test unitaire couvre chaque branche de hitl_manager.js
- [ ] La conscience peut être désactivée via `.env` sans redémarrage

---

## 7. DÉCISION ATTENDUE

> **Valides-tu cette feature card ?**
> Une fois validée, je passe au `plan_conscience.md` avec les schémas d'API détaillés,
> les contrats de données WebSocket, et les composants React annotés.
