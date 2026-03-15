/**
 * packages/marketplace/src/skills_marketplace.js
 * Chimera — Marketplace de skills
 *
 * Porté depuis ghost-os-ultimate/ecosystem/marketplace/skills_marketplace.js
 * Chemins adaptés au monorepo Chimera :
 *   - Registry : ~/Projects/chimera/skills/registry.json (dans skills/core/)
 *   - Installed : ~/Projects/chimera/skills/installed/
 *
 * Fonctionnalités :
 *   - Recherche et filtrage de skills
 *   - Installation avec comparaison semver (upgrade automatique)
 *   - Upgrade avec backup/rollback
 *   - Désinstallation avec protection anti-path-traversal
 *   - Publication avec validation manifest
 */

import {
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  mkdirSync,
  cpSync,
  rmSync,
  renameSync,
} from 'fs';
import { join, basename, resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Chemins adaptés au monorepo Chimera
const CHIMERA_ROOT    = resolve(__dirname, '..', '..', '..'); // ~/Projects/chimera/
const REGISTRY_FILE   = join(CHIMERA_ROOT, 'skills', 'core', 'registry.json');
const INSTALLED_DIR   = join(CHIMERA_ROOT, 'skills', 'installed');

export class SkillsMarketplace {
  constructor(options = {}) {
    // skills_dir pointe vers installed/ pour les skills gérés par le marketplace
    this.skills_dir    = options.skills_dir    || INSTALLED_DIR;
    this.registry_file = options.registry_file || REGISTRY_FILE;
    this._registry     = this._loadRegistry();
    this._validator    = new SkillValidator();
  }

  // ─── Recherche ─────────────────────────────────────────────────────────────

  /**
   * Recherche des skills dans le registry par texte, tier ou version minimale.
   * @param {string} query — texte libre (cherche dans name + description)
   * @param {{ tier?: string, version_min?: string }} filters
   * @returns {Array<Object>} — skills avec champ _installed
   */
  search(query, filters = {}) {
    const q = (query || '').toLowerCase();
    let results = this._registry.skills || [];

    // Filtre par texte libre
    if (q) {
      results = results.filter(s =>
        s.name.toLowerCase().includes(q) ||
        (s.description || '').toLowerCase().includes(q)
      );
    }

    // Filtre par tier (core, community, learned, etc.)
    if (filters.tier) {
      results = results.filter(s => s.tier === filters.tier);
    }

    // Filtre par version minimale
    if (filters.version_min) {
      results = results.filter(s => this._versionGte(s.version, filters.version_min));
    }

    // Enrichit chaque résultat avec le statut d'installation
    return results.map(s => ({ ...s, _installed: this._isInstalled(s.name) }));
  }

  /**
   * Liste les skills actuellement installés dans skills/installed/
   * (lit manifest.json de chaque sous-dossier)
   */
  listInstalled() {
    if (!existsSync(this.skills_dir)) return [];
    return readdirSync(this.skills_dir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => {
        const manifest_path = join(this.skills_dir, d.name, 'manifest.json');
        if (!existsSync(manifest_path)) return null;
        try {
          return JSON.parse(readFileSync(manifest_path, 'utf-8'));
        } catch { return { name: d.name }; }
      })
      .filter(Boolean);
  }

  // ─── Installation / suppression ────────────────────────────────────────────

  /**
   * Installe un skill depuis une source locale ou crée un stub marketplace.
   * Si le skill est déjà installé, compare les versions semver et déclenche
   * un upgrade automatique si la version cible est supérieure.
   *
   * @param {string} skill_id — nom snake_case du skill
   * @param {string|null} source — chemin local vers le dossier source (optionnel)
   */
  async install(skill_id, source = null) {
    // Validation du nom avant toute opération
    const validation = this._validator.validate({ name: skill_id, source });
    if (!validation.valid) {
      return { success: false, errors: validation.errors };
    }

    // Déjà installé ? Comparer les versions semver
    if (this._isInstalled(skill_id)) {
      const installed_version = this._installedVersion(skill_id);
      const target_version    = source ? this._sourceVersion(source) : null;

      // Version identique ou inférieure → skip
      if (!target_version || !this._versionGt(target_version, installed_version)) {
        return {
          success: true,
          message: `${skill_id} v${installed_version} déjà installé`,
          skipped: true,
        };
      }

      // Version cible supérieure → upgrade automatique
      return this.upgrade(skill_id, source, { from: installed_version, to: target_version });
    }

    const target_dir = join(this.skills_dir, skill_id);

    try {
      if (source && existsSync(source)) {
        // Copie locale depuis la source
        mkdirSync(target_dir, { recursive: true });
        cpSync(source, target_dir, { recursive: true });
      } else {
        // Stub marketplace — à remplacer par un vrai téléchargement depuis le registry central
        mkdirSync(target_dir, { recursive: true });
        writeFileSync(
          join(target_dir, 'manifest.json'),
          JSON.stringify({
            name:        skill_id,
            version:     '0.0.1',
            description: 'Skill installé depuis marketplace Chimera',
          }, null, 2)
        );
        writeFileSync(
          join(target_dir, 'skill.js'),
          `export async function run(params) {\n  return { success: true, skill: '${skill_id}' };\n}\n`
        );
      }

      // Enregistrement dans le registry
      this._addToRegistry(skill_id);

      return { success: true, skill: skill_id, path: target_dir };
    } catch (err) {
      return { success: false, skill: skill_id, error: err.message };
    }
  }

  // ─── Mise à jour semver ────────────────────────────────────────────────────

  /**
   * Met à jour un skill installé vers une version supérieure.
   * Crée un backup avant modification, rollback automatique en cas d'échec.
   *
   * @param {string} skill_id
   * @param {string|null} source — chemin local vers la nouvelle version
   * @param {{ from?: string, to?: string }} versions
   */
  async upgrade(skill_id, source = null, versions = null) {
    // Si pas encore installé, déléguer à install()
    if (!this._isInstalled(skill_id)) {
      return this.install(skill_id, source);
    }

    const from_version = versions?.from || this._installedVersion(skill_id);
    const skill_dir    = join(this.skills_dir, skill_id);
    const backup_dir   = join(this.skills_dir, `${skill_id}.bak`);

    try {
      // 1. Backup de la version actuelle
      if (existsSync(backup_dir)) rmSync(backup_dir, { recursive: true, force: true });
      cpSync(skill_dir, backup_dir, { recursive: true });

      // 2. Supprimer l'ancienne version
      rmSync(skill_dir, { recursive: true, force: true });

      // 3. Installer la nouvelle version
      if (source && existsSync(source)) {
        mkdirSync(skill_dir, { recursive: true });
        cpSync(source, skill_dir, { recursive: true });
      } else {
        // Stub marketplace
        mkdirSync(skill_dir, { recursive: true });
        const new_version = versions?.to || '0.0.2';
        writeFileSync(
          join(skill_dir, 'manifest.json'),
          JSON.stringify({
            name:        skill_id,
            version:     new_version,
            description: 'Skill mis à jour depuis marketplace Chimera',
          }, null, 2)
        );
        writeFileSync(
          join(skill_dir, 'skill.js'),
          `export async function run(params) {\n  return { success: true, skill: '${skill_id}', version: '${new_version}' };\n}\n`
        );
      }

      // 4. Mettre à jour le registry
      const to_version = this._installedVersion(skill_id);
      this._addToRegistry(skill_id);

      // 5. Supprimer le backup si succès
      rmSync(backup_dir, { recursive: true, force: true });

      return { success: true, skill: skill_id, upgraded: true, from: from_version, to: to_version };
    } catch (err) {
      // Rollback : restaurer depuis le backup
      if (existsSync(backup_dir)) {
        try {
          if (existsSync(skill_dir)) rmSync(skill_dir, { recursive: true, force: true });
          renameSync(backup_dir, skill_dir);
        } catch { /* rollback partiel — log seulement */ }
      }
      return {
        success: false,
        skill:   skill_id,
        error:   `Upgrade échoué (rollback effectué): ${err.message}`,
      };
    }
  }

  /**
   * Désinstalle un skill.
   * Protection anti-path-traversal : vérifie que le chemin canonique du skill
   * est bien un sous-dossier direct de skills_dir avant suppression.
   *
   * @param {string} skill_id
   */
  uninstall(skill_id) {
    // Anti-path-traversal : le chemin canonique doit rester dans skills_dir
    const allowed_root = resolve(this.skills_dir);
    const skill_dir    = resolve(join(this.skills_dir, skill_id));

    if (!skill_dir.startsWith(allowed_root + '/') || skill_dir === allowed_root) {
      return { success: false, error: `Chemin non autorisé: ${skill_id}` };
    }
    if (!existsSync(skill_dir)) {
      return { success: false, error: `Skill ${skill_id} non trouvé` };
    }

    try {
      rmSync(skill_dir, { recursive: true, force: true });
      this._removeFromRegistry(skill_id);
      return { success: true, skill: skill_id };
    } catch (err) {
      return { success: false, skill: skill_id, error: err.message };
    }
  }

  // ─── Publication ──────────────────────────────────────────────────────────

  /**
   * Publie un skill local dans le registry Chimera.
   * Requiert manifest.json + skill.js dans skill_dir.
   * Dans une vraie implémentation, publierait vers un registry central.
   *
   * @param {string} skill_dir — chemin absolu vers le dossier du skill
   */
  publish(skill_dir) {
    const manifest_path = join(skill_dir, 'manifest.json');
    const skill_js_path = join(skill_dir, 'skill.js');

    if (!existsSync(manifest_path)) {
      return { success: false, error: 'manifest.json manquant' };
    }
    if (!existsSync(skill_js_path)) {
      return { success: false, error: 'skill.js manquant' };
    }

    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifest_path, 'utf-8'));
    } catch (err) {
      return { success: false, error: `manifest.json invalide: ${err.message}` };
    }

    const validation = this._validator.validateManifest(manifest);
    if (!validation.valid) {
      return { success: false, errors: validation.errors };
    }

    // Enregistrement local dans le registry Chimera
    this._addToRegistry(manifest.name, manifest);

    return { success: true, skill: manifest.name, version: manifest.version };
  }

  // ─── Stats ────────────────────────────────────────────────────────────────

  /** Retourne les statistiques globales du marketplace */
  getStats() {
    const installed = this.listInstalled();
    return {
      total_registered: (this._registry.skills || []).length,
      installed:        installed.length,
      registry_version: this._registry.version || '1.0.0',
      last_updated:     this._registry.lastUpdated,
    };
  }

  // ─── Helpers privés ───────────────────────────────────────────────────────

  /** Charge le registry depuis le fichier (crée un registry vide si absent) */
  _loadRegistry() {
    if (existsSync(this.registry_file)) {
      try { return JSON.parse(readFileSync(this.registry_file, 'utf-8')); }
      catch { /* fichier corrompu → fallback */ }
    }
    return { version: '1.0.0', skills: [], lastUpdated: new Date().toISOString() };
  }

  /** Persiste le registry sur disque */
  _saveRegistry() {
    const dir = dirname(this.registry_file);
    if (dir) mkdirSync(dir, { recursive: true });
    writeFileSync(this.registry_file, JSON.stringify(this._registry, null, 2));
  }

  _addToRegistry(name, manifest = null) {
    if (!this._registry.skills) this._registry.skills = [];
    const existing = this._registry.skills.findIndex(s => s.name === name);
    const entry    = manifest || { name, added_at: new Date().toISOString() };
    if (existing >= 0) {
      this._registry.skills[existing] = entry;
    } else {
      this._registry.skills.push(entry);
    }
    this._registry.lastUpdated = new Date().toISOString();
    this._saveRegistry();
  }

  _removeFromRegistry(name) {
    this._registry.skills = (this._registry.skills || []).filter(s => s.name !== name);
    this._registry.lastUpdated = new Date().toISOString();
    this._saveRegistry();
  }

  /** Vérifie si un skill est installé dans skills_dir */
  _isInstalled(name) {
    return existsSync(join(this.skills_dir, name));
  }

  /**
   * Lit la version du skill installé depuis manifest.json ou manifest.yaml.
   * Supporte le fallback YAML par regex (pas de dépendance js-yaml).
   */
  _installedVersion(skill_id) {
    const dir = join(this.skills_dir, skill_id);

    const json_path = join(dir, 'manifest.json');
    if (existsSync(json_path)) {
      try {
        const m = JSON.parse(readFileSync(json_path, 'utf-8'));
        return m.version || '0.0.0';
      } catch { /* ignoré */ }
    }

    // Fallback manifest.yaml — extraction par regex
    const yaml_path = join(dir, 'manifest.yaml');
    if (existsSync(yaml_path)) {
      const content = readFileSync(yaml_path, 'utf-8');
      const match   = content.match(/version:\s+['"]?(\d+\.\d+\.\d+)['"]?/);
      return match ? match[1] : '0.0.0';
    }

    return '0.0.0';
  }

  /** Lit la version d'une source locale (avant installation) */
  _sourceVersion(source) {
    const json_path = join(source, 'manifest.json');
    if (existsSync(json_path)) {
      try {
        const m = JSON.parse(readFileSync(json_path, 'utf-8'));
        return m.version || null;
      } catch { return null; }
    }

    const yaml_path = join(source, 'manifest.yaml');
    if (existsSync(yaml_path)) {
      const content = readFileSync(yaml_path, 'utf-8');
      const match   = content.match(/version:\s+['"]?(\d+\.\d+\.\d+)['"]?/);
      return match ? match[1] : null;
    }

    return null;
  }

  /** Retourne true si v1 > v2 (comparaison semver stricte, 3 composantes) */
  _versionGt(v1, v2) {
    const p1 = (v1 || '0.0.0').split('.').map(Number);
    const p2 = (v2 || '0.0.0').split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if ((p1[i] || 0) > (p2[i] || 0)) return true;
      if ((p1[i] || 0) < (p2[i] || 0)) return false;
    }
    return false; // égaux → pas supérieur
  }

  /** Retourne true si v1 >= v2 */
  _versionGte(v1, v2) {
    const p1 = (v1 || '0.0.0').split('.').map(Number);
    const p2 = (v2 || '0.0.0').split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if ((p1[i] || 0) > (p2[i] || 0)) return true;
      if ((p1[i] || 0) < (p2[i] || 0)) return false;
    }
    return true;
  }
}

// ─── SkillValidator ─────────────────────────────────────────────────────────

const SKILL_NAME_MAX_LENGTH = 40;

export class SkillValidator {
  /**
   * Valide un skill à l'installation (nom snake_case, longueur max).
   * @param {{ name: string, source?: string }} skill
   */
  validate(skill) {
    const errors = [];

    if (!skill.name || !/^[a-z0-9_]+$/.test(skill.name)) {
      errors.push('name doit être snake_case alphanumérique');
    } else if (skill.name.length > SKILL_NAME_MAX_LENGTH) {
      errors.push(`name trop long (${skill.name.length} chars) — max ${SKILL_NAME_MAX_LENGTH} caractères`);
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Valide un manifest complet avant publication.
   * Vérifie : name, version (semver x.y.z), description.
   * @param {Object} manifest
   */
  validateManifest(manifest) {
    const errors = [];

    if (!manifest.name)        errors.push('name requis');
    if (!manifest.version)     errors.push('version requise (format x.y.z)');
    if (!manifest.description) errors.push('description requise');

    if (manifest.version && !/^\d+\.\d+\.\d+/.test(manifest.version)) {
      errors.push('version doit être au format semver (ex: 1.0.0)');
    }

    return { valid: errors.length === 0, errors };
  }
}
