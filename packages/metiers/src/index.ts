/**
 * packages/metiers/src/index.ts
 * Fiches Métier — LaRuche
 *
 * Chaque fiche = un domaine professionnel complet avec skills, workflows,
 * et patterns de déclenchement Telegram.
 *
 * Usage :
 *   import { matchFicheMetier, FICHES_METIER } from '@laruche/metiers';
 *   const { fiche, workflow } = matchFicheMetier("rapport ventes du jour");
 */

export interface FicheMetier {
  id: string;
  nom: string;
  description: string;
  skills_requis: string[];
  workflows: Workflow[];
  exemples_telegram: string[];
}

export interface Workflow {
  nom: string;
  declencheur: string[];
  etapes: EtapeWorkflow[];
  livrable: string;
}

export interface EtapeWorkflow {
  ordre: number;
  skill: string;
  params: Record<string, unknown>;
  validation: string;
}

// ─── FICHES MÉTIER ────────────────────────────────────────────────────────────

export const FICHES_METIER: FicheMetier[] = [

  {
    id: 'ecommerce',
    nom: 'E-commerce Manager',
    description: 'Gestion complète boutique Shopify — commandes, stocks, CA, clients',
    skills_requis: ['shopify-backend', 'email-triage', 'google-workspace'],
    workflows: [
      {
        nom: 'Rapport quotidien ventes',
        declencheur: ['rapport ventes', 'chiffres du jour', 'commandes aujourd', 'ca du jour', 'chiffre affaires'],
        etapes: [
          { ordre: 1, skill: 'shopify-backend', params: { action: 'getOrders', status: 'any', limit: 50 }, validation: 'liste de commandes non vide' },
          { ordre: 2, skill: 'shopify-backend', params: { action: 'getRevenue', period: 'today' }, validation: 'chiffre >= 0' },
          { ordre: 3, skill: 'google-workspace', params: { action: 'appendSheet', sheet: 'Ventes quotidiennes' }, validation: 'ligne ajoutée' },
        ],
        livrable: 'Rapport : X commandes, Y€ de CA, Z clients',
      },
      {
        nom: 'Gestion stock critique',
        declencheur: ['stock faible', 'rupture', 'inventaire', 'produits en rupture'],
        etapes: [
          { ordre: 1, skill: 'shopify-backend', params: { action: 'getLowStock', threshold: 5 }, validation: 'liste produits' },
          { ordre: 2, skill: 'email-triage', params: { action: 'send', template: 'stock-alert' }, validation: 'email envoyé' },
        ],
        livrable: 'Liste des produits en rupture + alerte envoyée',
      },
      {
        nom: 'Suivi commandes en attente',
        declencheur: ['commandes en attente', 'commandes non traitées', 'orders pending'],
        etapes: [
          { ordre: 1, skill: 'shopify-backend', params: { action: 'getOrders', status: 'pending' }, validation: 'liste commandes' },
        ],
        livrable: 'X commandes en attente depuis Y heures',
      },
    ],
    exemples_telegram: [
      'rapport ventes du jour',
      'quels produits sont en rupture de stock',
      'combien de commandes en attente',
      'chiffre affaires cette semaine',
    ],
  },

  {
    id: 'assistant-personnel',
    nom: 'Assistant Personnel',
    description: 'Organisation quotidienne — emails, agenda, tâches, recherche',
    skills_requis: ['email-triage', 'google-workspace', 'http_fetch'],
    workflows: [
      {
        nom: 'Briefing matinal',
        declencheur: ['briefing', 'quoi aujourd hui', 'planning du jour', 'resume du matin', 'resumé matin'],
        etapes: [
          { ordre: 1, skill: 'email-triage', params: { action: 'fetchRecent', hours: 8 }, validation: 'emails récupérés' },
          { ordre: 2, skill: 'google-workspace', params: { action: 'listEvents', days: 1 }, validation: 'événements récupérés' },
          { ordre: 3, skill: 'email-triage', params: { action: 'classify' }, validation: 'emails classifiés par priorité' },
        ],
        livrable: 'X emails (Y urgents), Z réunions aujourd\'hui',
      },
      {
        nom: 'Triage emails',
        declencheur: ['trie mes emails', 'emails urgents', 'nouveaux emails', 'boite mail'],
        etapes: [
          { ordre: 1, skill: 'email-triage', params: { action: 'fetchUnread' }, validation: 'liste emails non lus' },
          { ordre: 2, skill: 'email-triage', params: { action: 'classify' }, validation: 'priorités assignées' },
        ],
        livrable: 'X emails non lus — Y urgents, Z en attente, W informatifs',
      },
      {
        nom: 'Rédaction email',
        declencheur: ['envoie un email', 'réponds à', 'écris à', 'email à'],
        etapes: [
          { ordre: 1, skill: 'google-workspace', params: { action: 'draftEmail' }, validation: 'brouillon créé' },
          { ordre: 2, skill: 'google-workspace', params: { action: 'sendEmail' }, validation: 'email envoyé' },
        ],
        livrable: 'Email envoyé à [destinataire]',
      },
    ],
    exemples_telegram: [
      'donne moi mon briefing du matin',
      'trie mes emails urgents',
      'envoie un email à client@example.com pour confirmer le rendez-vous',
      'quelles reunions ai je demain',
    ],
  },

  {
    id: 'developpeur',
    nom: 'Assistant Développeur',
    description: 'Git, tests, déploiement, monitoring, logs — toutes les tâches DevOps du quotidien',
    skills_requis: ['run_command', 'run_shell', 'docker_control', 'ollama_control'],
    workflows: [
      {
        nom: 'Déploiement projet',
        declencheur: ['deploie', 'met en prod', 'push et deploy', 'lance le deploy'],
        etapes: [
          { ordre: 1, skill: 'run_command', params: { cmd: 'npm test' }, validation: 'tous les tests passent' },
          { ordre: 2, skill: 'run_shell', params: { cmd: 'git add -A' }, validation: 'fichiers stagés' },
          { ordre: 3, skill: 'run_shell', params: { cmd: 'git commit -m "deploy"' }, validation: 'commit créé' },
          { ordre: 4, skill: 'run_shell', params: { cmd: 'git push' }, validation: 'push réussi' },
        ],
        livrable: 'Déployé sur main — tests OK, commit pushé',
      },
      {
        nom: 'Monitoring système',
        declencheur: ['etat du serveur', 'monitoring', 'logs erreur', 'sante systeme', 'pm2'],
        etapes: [
          { ordre: 1, skill: 'run_shell', params: { cmd: 'pm2 list' }, validation: 'liste des processus' },
          { ordre: 2, skill: 'docker_control', params: { action: 'ps' }, validation: 'containers listés' },
          { ordre: 3, skill: 'ollama_control', params: { action: 'ps' }, validation: 'modèles actifs' },
        ],
        livrable: 'X processus PM2 online, Y containers Docker, Z modèles Ollama actifs',
      },
      {
        nom: 'Logs erreurs',
        declencheur: ['montre les logs', 'logs de', 'erreurs dans', 'debug'],
        etapes: [
          { ordre: 1, skill: 'run_shell', params: { cmd: 'pm2 logs --lines 50 --nostream' }, validation: 'logs récupérés' },
        ],
        livrable: 'Dernières 50 lignes de logs avec erreurs surlignées',
      },
    ],
    exemples_telegram: [
      'deploie LaRuche en prod',
      'lance les tests du projet',
      'montre les logs d erreur de queen-node',
      'redemarre le service ghost-os',
      'etat de tous les containers docker',
    ],
  },

  {
    id: 'creatif',
    nom: 'Assistant Créatif',
    description: 'Screenshots, vision, analyse visuelle, captures web',
    skills_requis: ['take_screenshot', 'screen_elements', 'http_fetch'],
    workflows: [
      {
        nom: 'Capture et analyse écran',
        declencheur: ['screenshot', 'capture ecran', 'prends une photo', 'vois mon ecran', 'quoi a lecran'],
        etapes: [
          { ordre: 1, skill: 'take_screenshot', params: {}, validation: 'image capturée' },
          { ordre: 2, skill: 'screen_elements', params: {}, validation: 'éléments analysés' },
        ],
        livrable: 'Screenshot + description de ce qui est à l\'écran',
      },
      {
        nom: 'Organisation screenshots',
        declencheur: ['organise mes screenshots', 'range les screenshots', 'trie les captures'],
        etapes: [
          { ordre: 1, skill: 'organise_screenshots', params: {}, validation: 'screenshots déplacés' },
        ],
        livrable: 'X screenshots organisés par date dans ~/Pictures/Screenshots',
      },
      {
        nom: 'Organisation téléchargements',
        declencheur: ['organise mes telechargements', 'range downloads', 'trie les fichiers telecharges'],
        etapes: [
          { ordre: 1, skill: 'organise_telechargements', params: {}, validation: 'fichiers déplacés' },
        ],
        livrable: 'X fichiers organisés par type dans ~/Downloads',
      },
    ],
    exemples_telegram: [
      'prends un screenshot et dis moi ce que tu vois',
      'organise mes screenshots par date',
      'range mes telechargements',
      'quelles apps sont ouvertes en ce moment',
    ],
  },
];

// ─── MATCHING ─────────────────────────────────────────────────────────────────

/**
 * Trouve la fiche métier et le workflow correspondant à un message Telegram.
 * Retourne null si aucun match.
 */
export function matchFicheMetier(message: string): {
  fiche: FicheMetier | null;
  workflow: Workflow | null;
} {
  const msg = message.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // retire les accents pour la comparaison

  for (const fiche of FICHES_METIER) {
    for (const workflow of fiche.workflows) {
      const hit = workflow.declencheur.some((d) =>
        msg.includes(d.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
      );
      if (hit) return { fiche, workflow };
    }
  }

  return { fiche: null, workflow: null };
}

/**
 * Liste tous les patterns de déclenchement (utile pour debug / help Telegram).
 */
export function listTriggers(): Array<{ fiche: string; workflow: string; triggers: string[] }> {
  return FICHES_METIER.flatMap((f) =>
    f.workflows.map((w) => ({
      fiche: f.nom,
      workflow: w.nom,
      triggers: w.declencheur,
    }))
  );
}
