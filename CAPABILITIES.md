# LaRuche — Capacités complètes

## Ce que LaRuche peut faire aujourd'hui

### Computer Use (macOS)
| Commande | Exemple |
|----------|---------|
| Ouvrir une app | "ouvre Safari" / "lance Terminal" |
| Naviguer vers une URL | "va sur github.com" |
| Prendre un screenshot | "prends un screenshot" |
| Taper du texte | "tape bonjour dans le champ" |
| Appuyer sur une touche | "appuie sur Entrée" |
| Ouvrir VSCode | "ouvre VSCode dans LaRuche" |

### Fichiers & Code
| Commande | Exemple |
|----------|---------|
| Lire un fichier | "lis le contenu de package.json" |
| Lister gros fichiers | "liste les 5 fichiers les plus gros" |
| Résumé de projet | "résume l'architecture du projet" |
| Exécuter une commande | "exécute git status" |
| Fetch HTTP | "fais un GET sur http://localhost:3000/api/status" |

### Web
| Commande | Exemple |
|----------|---------|
| Recherche YouTube | "cherche jazz music sur YouTube" |
| Ouvrir URL | "ouvre https://docs.anthropic.com" |

### Intelligence
| Capacité | Description |
|----------|-------------|
| Fast path | Réponse en 1.3s pour questions simples |
| Butterfly Loop | Plan → tâches parallèles → synthèse pour tâches complexes |
| Skills dynamiques | Créer de nouveaux skills depuis le dashboard |
| Auto-correction | Retry automatique si un step échoue |
| Vision | Analyser un screenshot avec llava:7b |

## Limitations actuelles
- **Vitesse** : ~12 tok/s sur CPU (pas de GPU), missions complexes = 1-5 min
- **Contexte** : 4096 tokens max par appel
- **Vision** : llava:7b basique, pas de raisonnement visuel fin
- **Actions web** : Playwright (headless) — pas de vrai navigateur visible
- **Mémoire** : pas de mémoire cross-missions (chaque mission repart de zéro)

## Comparaison avec alternatives cloud
| Critère | LaRuche Local | GPT-4 Cloud |
|---------|--------------|-------------|
| Coût | 0€/mois | 20-200€/mois |
| Vie privée | Total | Données envoyées |
| Computer Use | macOS natif | Limité |
| Vitesse | Lent (CPU) | Rapide |
| Disponibilité | Toujours | Dépend internet |
