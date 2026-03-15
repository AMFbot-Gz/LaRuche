---
name: Feature Request
about: Proposer une nouvelle fonctionnalité ou une amélioration
title: "feat(<scope>): <description courte>"
labels: ["enhancement", "triage"]
assignees: []
---

## Résumé de la feature

<!-- Une phrase claire qui décrit ce que tu veux ajouter. -->

## Problème que ça résout

<!-- Quel problème ou limitation actuelle cette feature adresse-t-elle ?
     Ex : "En ce moment, je dois faire X manuellement à chaque fois que..." -->

## Solution proposée

<!-- Décris comment tu imagines la feature. Sois aussi précis que possible :
     - Nouveaux endpoints API ?
     - Nouvelle page dashboard ?
     - Nouveau comportement agent ?
     - Modification du sandbox / EventBus / Queen ? -->

## Alternatives envisagées

<!-- As-tu considéré d'autres approches ? Pourquoi la solution ci-dessus est préférable ? -->

## Impact sur l'architecture

<!-- Cette feature touche-t-elle :
     - [ ] Queen Node.js (:3000)
     - [ ] Dashboard Next.js (:3001)
     - [ ] Un ou plusieurs agents Python (:8001-:8010)
     - [ ] Le sandbox AST
     - [ ] NeuralEventBus
     - [ ] Billing / Auth (Stripe, Clerk)
     - [ ] Infra (docker-compose, Makefile, CI/CD)
     - [ ] Autre : ... -->

## Maquette / Exemple de code

<!-- Si applicable : wireframe, pseudo-code, exemple d'appel API attendu. -->

```python
# Exemple d'utilisation envisagée
```

## Contexte additionnel

<!-- Liens vers des projets similaires, papers, librairies pertinentes, etc. -->

## Checklist avant soumission

- [ ] J'ai cherché dans les issues existantes — cette feature n'a pas déjà été proposée
- [ ] Cette feature est alignée avec la vision de Chimera (local-first, autonomie, sécurité)
- [ ] J'ai considéré l'impact sur les tests et la documentation
