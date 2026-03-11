# 🐝 Contribuer à LaRuche

Bienvenue dans la Ruche Mondiale ! Voici comment participer.

## Créer un Skill

Un skill LaRuche est un module MCP autonome dans `skills/<nom>/` :

```
skills/mon_skill/
├── manifest.json   # Métadonnées
├── skill.js        # Code principal
└── tests/          # Tests Jest
```

### manifest.json
```json
{
  "name": "mon_skill",
  "description": "Ce que fait ce skill",
  "version": "1.0.0",
  "author": "votre_nom",
  "tags": ["automation", "web"],
  "ttl": null
}
```

### skill.js
```js
export async function run(params) {
  // Votre logique ici
  return { success: true, result: "..." };
}
```

## Conventions

- **Code** : ES Modules (import/export), async/await
- **Nommage** : snake_case pour les skills, camelCase pour le JS
- **Tests** : Jest obligatoire pour les PRs
- **Sécurité** : Jamais de credentials en dur, utiliser process.env

## Soumettre une PR

1. Fork le repo
2. `git checkout -b feat/mon-skill`
3. Développer + tester
4. `git push origin feat/mon-skill`
5. Ouvrir une Pull Request

## Code de Conduite

- Respectueux et inclusif
- Feedback constructif
- Partager les connaissances

🐝 *Une abeille seule fait du miel. Un essaim change le monde.*
