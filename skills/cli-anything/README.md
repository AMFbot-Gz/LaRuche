# CLI-Anything — Intégration LaRuche

CLI-Anything transforme n'importe quelle app GUI en CLI contrôlable par agent IA.
Source : https://github.com/HKUDS/CLI-Anything (18.3k stars, actif)

## Pourquoi ce dossier est vide pour l'instant

Les apps cibles (GIMP, Blender, LibreOffice, OBS, Inkscape, Audacity) ne sont pas installées
sur ce Mac. CLI-Anything a besoin que l'app soit présente pour générer son CLI.

## Installer CLI-Anything (plugin Claude Code)

Dans un terminal, lance Claude Code puis :

```
/plugin marketplace add HKUDS/CLI-Anything
/plugin install cli-anything
```

## Générer un CLI pour une app installée

Une fois CLI-Anything installé, dans Claude Code :

```
/cli-anything /Applications/LibreOffice.app
/cli-anything /Applications/GIMP.app
/cli-anything /Applications/Blender.app
/cli-anything /Applications/Audacity.app
/cli-anything /Applications/OBS.app
```

CLI-Anything génère automatiquement un package pip `cli-anything-{nom}`.

## Installer les CLIs générés

```bash
pip3 install cli-anything-libreoffice
pip3 install cli-anything-gimp
pip3 install cli-anything-blender
```

## Créer les skills LaRuche pour les nouvelles CLIs

Une fois installés, exécuter depuis ~/Projects/LaRuche :

```bash
node skills/cli-anything/generate-skills.js
```

## Apps avec CLIs pré-construits sur PyPI (sans installation)

- `pip3 install cli-anything-libreoffice` — nécessite LibreOffice installé
- Voir https://pypi.org/search/?q=cli-anything pour la liste complète
