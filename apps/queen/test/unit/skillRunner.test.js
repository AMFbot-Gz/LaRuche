/**
 * test/unit/skillRunner.test.js — Tests unitaires du skill runner
 *
 * Stratégie :
 * - Mock du système de fichiers via jest.unstable_mockModule pour ESM
 * - Tests sur runSkill(), generateAndRun(), listSkills()
 * - Import dynamique après mocks
 */

import { jest } from '@jest/globals';

// ─── Mocks ESM via unstable_mockModule ─────────────────────────────────────────

const mockExistsSync   = jest.fn();
const mockReadFileSync = jest.fn();
const mockWriteFileSync = jest.fn();
const mockMkdirSync    = jest.fn();
const mockReaddirSync  = jest.fn();
const mockStatSync     = jest.fn();
const mockAsk          = jest.fn();

jest.unstable_mockModule('fs', () => ({
  existsSync:   mockExistsSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  mkdirSync:    mockMkdirSync,
  readdirSync:  mockReaddirSync,
  statSync:     mockStatSync,
  // autres exports fs utilisés par ESM imports
  default: {
    existsSync:   mockExistsSync,
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync,
    mkdirSync:    mockMkdirSync,
    readdirSync:  mockReaddirSync,
    statSync:     mockStatSync,
  },
}));

jest.unstable_mockModule('../../src/model_router.js', () => ({
  ask: mockAsk,
}));

jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  logger: {
    info:  jest.fn(),
    warn:  jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// ─── Dynamic imports APRÈS les mocks ──────────────────────────────────────────

const { runSkill, generateAndRun, listSkills } = await import('../../src/skill_runner.js');

// ─── Tests runSkill ─────────────────────────────────────────────────────────────

describe('runSkill', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('skill inexistant → erreur claire avec nom du skill', async () => {
    mockExistsSync.mockReturnValue(false);

    await expect(runSkill('skill_inexistant')).rejects.toThrow('skill_inexistant');
  });

  test('skill inexistant → message d\'erreur informatif (pas juste un crash)', async () => {
    mockExistsSync.mockReturnValue(false);

    try {
      await runSkill('mon_skill');
      expect(true).toBe(false); // ne doit pas arriver
    } catch (err) {
      expect(err.message).toContain('mon_skill');
      expect(err.message).not.toBe('');
    }
  });

  test('skill non trouvé → Error propre avec message Skill "x" introuvable', async () => {
    mockExistsSync.mockReturnValue(false);

    const err = await runSkill('inexistant').catch(e => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain('Skill "inexistant" introuvable');
  });

  test('skill non trouvé → suggestion de commande create dans le message', async () => {
    mockExistsSync.mockReturnValue(false);

    const err = await runSkill('mon_skill').catch(e => e);
    expect(err.message).toContain('laruche skill create');
  });

  test('runSkill avec params vide → ne crashe pas avant l\'import', async () => {
    mockExistsSync.mockReturnValue(false);

    const err = await runSkill('test_skill', {}).catch(e => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain('test_skill');
  });

  test('runSkill avec paramètre null → ne crashe pas (default {} appliqué)', async () => {
    mockExistsSync.mockReturnValue(false);

    // null est passé, mais la signature est runSkill(skillName, params = {})
    const err = await runSkill('test_skill', null).catch(e => e);
    // L'erreur doit venir du skill not found, pas d'un TypeError sur params
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain('test_skill');
  });

  test('plusieurs skills différents → erreur pour chacun si inexistants', async () => {
    mockExistsSync.mockReturnValue(false);

    const err1 = await runSkill('skill_a').catch(e => e);
    const err2 = await runSkill('skill_b').catch(e => e);

    expect(err1.message).toContain('skill_a');
    expect(err2.message).toContain('skill_b');
  });
});

// ─── Tests listSkills ───────────────────────────────────────────────────────────

describe('listSkills', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('retourne tableau vide si SKILLS_DIR n\'existe pas', () => {
    mockExistsSync.mockReturnValue(false);

    const skills = listSkills();
    expect(Array.isArray(skills)).toBe(true);
    expect(skills).toHaveLength(0);
  });

  test('retourne liste des skills si SKILLS_DIR existe', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['echo_hello', 'ping_pong']);
    mockStatSync.mockReturnValue({ isDirectory: () => true });
    mockReadFileSync
      .mockReturnValueOnce(JSON.stringify({ name: 'echo_hello', description: 'Echo hello', version: '1.0.0' }))
      .mockReturnValueOnce(JSON.stringify({ name: 'ping_pong', description: 'Ping pong', version: '1.0.0' }));

    const skills = listSkills();

    expect(Array.isArray(skills)).toBe(true);
    expect(skills).toHaveLength(2);
    expect(skills[0].name).toBe('echo_hello');
    expect(skills[1].name).toBe('ping_pong');
  });

  test('skill sans manifest.json → retourne {name: skillName} gracieusement', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['broken_skill']);
    mockStatSync.mockReturnValue({ isDirectory: () => true });
    mockReadFileSync.mockImplementation(() => { throw new Error('ENOENT'); });

    const skills = listSkills();

    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({ name: 'broken_skill' });
  });

  test('manifest.json avec JSON invalide → fallback {name: skillName}', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['bad_json_skill']);
    mockStatSync.mockReturnValue({ isDirectory: () => true });
    mockReadFileSync.mockReturnValue('{ invalid json }');

    expect(() => listSkills()).not.toThrow();
    const skills = listSkills();
    expect(skills[0]).toMatchObject({ name: 'bad_json_skill' });
  });

  test('filtre les fichiers (pas des dossiers) correctement', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['un_skill', 'un_fichier.txt']);
    mockStatSync
      .mockReturnValueOnce({ isDirectory: () => true })
      .mockReturnValueOnce({ isDirectory: () => false });
    mockReadFileSync.mockReturnValue(JSON.stringify({ name: 'un_skill', description: 'Test' }));

    const skills = listSkills();

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('un_skill');
  });

  test('statSync qui throw → skill ignoré gracieusement', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['bon_skill', 'mauvais_chemin']);
    mockStatSync
      .mockReturnValueOnce({ isDirectory: () => true })
      .mockImplementationOnce(() => { throw new Error('EACCES'); });
    mockReadFileSync.mockReturnValue(JSON.stringify({ name: 'bon_skill' }));

    const skills = listSkills();

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('bon_skill');
  });

  test('SKILLS_DIR vide → tableau vide', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([]);

    const skills = listSkills();

    expect(skills).toHaveLength(0);
  });

  test('manifest avec champs optionnels → conservé dans le résultat', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['rich_skill']);
    mockStatSync.mockReturnValue({ isDirectory: () => true });
    mockReadFileSync.mockReturnValue(JSON.stringify({
      name: 'rich_skill',
      description: 'Un skill riche',
      version: '2.0.0',
      auto_generated: true,
    }));

    const skills = listSkills();

    expect(skills[0].version).toBe('2.0.0');
    expect(skills[0].auto_generated).toBe(true);
  });
});

// ─── Tests generateAndRun ───────────────────────────────────────────────────────

describe('generateAndRun', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('skillName généré depuis la description (lowercase, underscores)', async () => {
    // Skill n'existe pas encore → sera créé
    mockExistsSync
      .mockReturnValueOnce(false)  // skillDir n'existe pas → création
      .mockReturnValueOnce(false); // skillFile n'existe pas → runSkill échoue

    mockMkdirSync.mockImplementation(() => {});
    mockWriteFileSync.mockImplementation(() => {});
    mockAsk.mockResolvedValueOnce({
      success: true,
      text: 'export async function run(params) { return { success: true }; }',
      model: 'qwen3-coder',
    });

    await generateAndRun('Echo Hello Test').catch(() => {});

    // mkdirSync doit avoir été appelé avec un path contenant le nom normalisé
    expect(mockMkdirSync).toHaveBeenCalled();
    const mkdirPath = mockMkdirSync.mock.calls[0][0];
    expect(mkdirPath).toContain('echo_hello_test');
  });

  test('description trop longue → skillName tronqué à 25 chars', async () => {
    mockExistsSync
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false);

    mockMkdirSync.mockImplementation(() => {});
    mockWriteFileSync.mockImplementation(() => {});
    mockAsk.mockResolvedValueOnce({
      success: true,
      text: 'export async function run(params) { return { success: true }; }',
      model: 'qwen3-coder',
    });

    const description = 'Ceci est une description très longue qui dépasse vingt-cinq caractères facilement ok';
    await generateAndRun(description).catch(() => {});

    if (mockMkdirSync.mock.calls.length > 0) {
      const mkdirPath = mockMkdirSync.mock.calls[0][0];
      const skillName = mkdirPath.split('/').pop();
      expect(skillName.length).toBeLessThanOrEqual(25);
    }
  });

  test('skill déjà généré (skillDir existsSync true) → n\'appelle pas ask()', async () => {
    // skillDir existe → on skip la génération, runSkill est appelé directement
    // skillFile existe aussi → l'import dynamique sera tenté
    mockExistsSync
      .mockReturnValueOnce(true)   // skillDir existe → pas de génération
      .mockReturnValueOnce(false); // skillFile n'existe pas → runSkill échoue

    await generateAndRun('echo test').catch(() => {});

    // ask ne doit pas avoir été appelé (skill déjà présent)
    expect(mockAsk).not.toHaveBeenCalled();
  });

  test('ask() appelé une fois lors de la génération d\'un nouveau skill', async () => {
    mockExistsSync
      .mockReturnValueOnce(false)  // skillDir n'existe pas
      .mockReturnValueOnce(false); // skillFile n'existe pas

    mockMkdirSync.mockImplementation(() => {});
    mockWriteFileSync.mockImplementation(() => {});
    mockAsk.mockResolvedValueOnce({
      success: true,
      text: 'export async function run(params) { return { success: true }; }',
      model: 'qwen3',
    });

    await generateAndRun('ma nouvelle tâche').catch(() => {});

    expect(mockAsk).toHaveBeenCalledTimes(1);
  });

  test('deux fichiers créés lors de la génération : skill.js et manifest.json', async () => {
    mockExistsSync
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false);

    mockMkdirSync.mockImplementation(() => {});
    mockWriteFileSync.mockImplementation(() => {});
    mockAsk.mockResolvedValueOnce({
      success: true,
      text: 'export async function run(p) {}',
      model: 'qwen3',
    });

    await generateAndRun('créer un fichier test').catch(() => {});

    // writeFileSync doit être appelé 2x : skill.js + manifest.json
    expect(mockWriteFileSync).toHaveBeenCalledTimes(2);
    const filenames = mockWriteFileSync.mock.calls.map(c => c[0]);
    expect(filenames.some(f => f.includes('skill.js'))).toBe(true);
    expect(filenames.some(f => f.includes('manifest.json'))).toBe(true);
  });
});
