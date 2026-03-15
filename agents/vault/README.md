# agents/vault/

Le Vault est le composant de stockage chiffré de Chimera.

## Rôle

- Stockage persistant des secrets et données sensibles de l'utilisateur
- Chiffrement AES-256-GCM (activé via `CHIMERA_ENCRYPTION_ENABLED=true`)
- Accessible par les autres agents via le Memory Agent (`VAULT_DIR` dans `.env`)

## État actuel

Ce module est en cours de développement. Le répertoire de stockage effectif
est configuré via la variable d'environnement :

```
VAULT_DIR=./agents/memory/data/vault
```

## Activation du chiffrement

Dans votre `.env` :

```
CHIMERA_ENCRYPTION_ENABLED=true
CHIMERA_MASTER_KEY=votre_clé_secrète  # ou dérivée automatiquement de HUD_TOKEN
```

## Intégration future

Le Vault agent sera un service FastAPI indépendant exposé sur un port dédié,
responsable de :
- Lecture/écriture chiffrée de fichiers dans `VAULT_DIR`
- Gestion des clés de chiffrement
- Audit log des accès aux secrets
