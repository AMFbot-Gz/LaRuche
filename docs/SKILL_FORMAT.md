# Format de Skill — Spécification LaRuche

> Inspiré du format SKILL.md d'OpenClaw. Adapté à la stack LaRuche (Node.js, Ollama, MCP servers).

---

## Structure d'un skill

```
skills/<nom>/
├── SKILL.md              # REQUIS — Instructions LLM + métadonnées (frontmatter YAML)
├── manifest.yaml         # Optionnel — Métadonnées machine (CI, registry)
├── index.js              # Optionnel — Logique exécutable (ESM)
├── config.schema.yaml    # Optionnel — Schéma de config utilisateur
└── README.md             # Optionnel — Doc humaine
```

---

## SKILL.md — Frontmatter YAML

```yaml
---
# Obligatoires
name: google-search          # Identifiant unique kebab-case
version: 1.0.0               # SemVer
description: "..."

# Recommandés
tags:                        # Tags pour la sélection par pertinence
  - web
  - search
tools:                       # Outils MCP utilisés (noms logiques config/agents.yml)
  - browser.goto
  - browser.typeInFocusedField
gpu_class: light             # light | medium | heavy | vision
enabled: true

# Optionnels
permissions: [browser]       # Permissions requises
mcps: [mcp-browser]          # Serveurs MCP requis
author: laruche-core
license: MIT
keywords:                    # Mots-clés déclencheurs (FR + EN)
  - cherche
  - recherche
  - google
  - search
requires:                    # Dépendances (autres skills)
  - take-screenshot
---
```

## SKILL.md — Corps (lu par le LLM)

Le corps du SKILL.md est injecté dans le prompt du LLM pour lui expliquer
comment utiliser le skill. Structure recommandée :

```markdown
## Description
Description précise du skill.

## Quand utiliser
Critères de déclenchement.

## Étapes
1. Étape 1
2. Étape 2

## Exemples
- Exemple de requête utilisateur

## Limitations
- Limitation connue
```

---

## manifest.yaml

```yaml
name: google-search
version: 1.0.0
description: "Recherche Google"
author: laruche-core
license: MIT
homepage: https://github.com/AMFbot-Gz/LaRuche/tree/main/skills/google-search
repository:
  type: git
  url: https://github.com/AMFbot-Gz/LaRuche
category: web
tags: [web, search]
requires_node: ">=20"
requires_mcps:
  - mcp-browser
configuration: []
```

---

## index.js — Logique exécutable (optionnel)

Si le skill nécessite une logique plus complexe qu'un simple appel MCP :

```js
/**
 * skills/google-search/index.js
 * Logique exécutable du skill google-search.
 * Exporté : execute(step, context) → Promise<StepResult>
 */

export async function execute(step, context) {
  const { query } = step.args;
  // Appel direct MCP ou logique custom
  return {
    success: true,
    output: `Résultats pour: ${query}`,
    data: []
  };
}
```

---

## Niveaux de priorité

| Niveau | Chemin | Modifiable par |
|--------|--------|----------------|
| 1 (max) | `workspace/skills/` | Utilisateur |
| 2 | `.laruche/skills/` | CLI install |
| 3 | `skills/` | Repo / équipe |
| 4 (min) | BUILTIN_SKILLS in planner.js | Dev core |

En cas de conflit de nom, le niveau le plus haut gagne.

---

## Classes GPU

| Classe | Modèle utilisé | Usage |
|--------|---------------|-------|
| `light` | llama3.2:3b | Routing, classification, réponses simples |
| `medium` | glm-4.6 / qwen3 | Planification, analyse |
| `heavy` | qwen3-coder:32b | Génération de code, architecture |
| `vision` | llama3.2-vision | Analyse d'écran (activé explicitement) |

---

*Spec LaRuche v4.0 — inspirée du format SKILL.md OpenClaw.*
