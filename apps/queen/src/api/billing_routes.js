/**
 * api/billing_routes.js — Routes Stripe Billing pour Chimera SaaS
 *
 * Routes :
 *   GET  /api/billing/plans     — liste les plans disponibles avec prix et limites
 *   POST /api/billing/checkout  — crée une session Stripe Checkout (upgrade plan)
 *   POST /api/billing/portal    — crée une session Customer Portal (gérer abonnement)
 *   POST /api/billing/webhook   — handler webhooks Stripe (signature vérifiée)
 *
 * Variables d'environnement requises :
 *   STRIPE_SECRET_KEY      — clé secrète Stripe (sk_test_... ou sk_live_...)
 *   STRIPE_WEBHOOK_SECRET  — secret de signature webhook (whsec_...)
 *   STRIPE_PRO_PRICE_ID    — price ID Stripe du plan Pro
 *   STRIPE_TEAMS_PRICE_ID  — price ID Stripe du plan Teams
 *   APP_URL                — URL de base de l'application (ex: http://localhost:3001)
 */

import { billingService, PLANS } from '../services/billing_service.js';
import { logger } from '../utils/logger.js';

/**
 * Enregistre les routes billing sur l'application Hono.
 * @param {import('hono').Hono} app
 */
export function registerBillingRoutes(app) {

  // ── GET /api/billing/plans ──────────────────────────────────────────────────
  // Retourne la liste des plans disponibles avec prix, limites et IDs Stripe
  // (stripePriceId masqué pour le plan FREE qui est null)
  app.get('/api/billing/plans', (c) => {
    const plans = Object.entries(PLANS).map(([key, plan]) => ({
      key,
      name: plan.name,
      price: plan.price,
      currency: 'usd',
      interval: plan.price > 0 ? 'month' : null,
      limits: plan.limits,
      // N'expose pas le stripePriceId côté client
    }));
    return c.json({ plans });
  });

  // ── POST /api/billing/checkout ─────────────────────────────────────────────
  // Crée une session Stripe Checkout pour upgrader vers un plan payant.
  // Body attendu : { userId, email, plan, successUrl?, cancelUrl? }
  app.post('/api/billing/checkout', async (c) => {
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Body JSON invalide' }, 400);
    }

    const { userId, email, plan, successUrl, cancelUrl } = body;

    // Validation des champs obligatoires
    if (!userId || typeof userId !== 'string') {
      return c.json({ error: 'userId (string) requis' }, 400);
    }
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return c.json({ error: 'email valide requis' }, 400);
    }
    if (!plan || !PLANS[plan]) {
      return c.json({ error: `plan invalide — valeurs autorisées: ${Object.keys(PLANS).join(', ')}` }, 400);
    }

    try {
      const session = await billingService.createCheckoutSession({
        userId,
        email,
        plan,
        successUrl,
        cancelUrl,
      });
      logger.info(`[Billing] Checkout session créée — user: ${userId}, plan: ${plan}, session: ${session.id}`);
      return c.json({ url: session.url, sessionId: session.id });
    } catch (err) {
      logger.error(`[Billing] Erreur création checkout: ${err.message}`);
      return c.json({ error: err.message }, 400);
    }
  });

  // ── POST /api/billing/portal ────────────────────────────────────────────────
  // Crée une session Customer Portal Stripe pour gérer l'abonnement existant.
  // Body attendu : { customerId, returnUrl? }
  app.post('/api/billing/portal', async (c) => {
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Body JSON invalide' }, 400);
    }

    const { customerId, returnUrl } = body;

    if (!customerId || typeof customerId !== 'string') {
      return c.json({ error: 'customerId (string) requis' }, 400);
    }

    try {
      const session = await billingService.createPortalSession(customerId, returnUrl);
      logger.info(`[Billing] Portal session créée — customer: ${customerId}`);
      return c.json({ url: session.url });
    } catch (err) {
      logger.error(`[Billing] Erreur création portal: ${err.message}`);
      return c.json({ error: err.message }, 400);
    }
  });

  // ── POST /api/billing/webhook ───────────────────────────────────────────────
  // Handler webhooks Stripe — signature vérifiée via STRIPE_WEBHOOK_SECRET.
  // IMPORTANT : Hono doit recevoir le body RAW (buffer) pour que la vérification
  // de signature Stripe fonctionne. On lit c.req.raw directement.
  app.post('/api/billing/webhook', async (c) => {
    const signature = c.req.header('stripe-signature');
    if (!signature) {
      return c.json({ error: 'En-tête stripe-signature manquant' }, 400);
    }

    // Lecture du body brut (requis par stripe.webhooks.constructEvent)
    let rawBody;
    try {
      rawBody = await c.req.raw.arrayBuffer();
      rawBody = Buffer.from(rawBody);
    } catch {
      return c.json({ error: 'Impossible de lire le body' }, 400);
    }

    // Vérification de la signature Stripe — lève une erreur si invalide
    let event;
    try {
      event = billingService.constructWebhookEvent(rawBody, signature);
    } catch (err) {
      logger.warn(`[Billing] Webhook signature invalide: ${err.message}`);
      return c.json({ error: `Signature invalide: ${err.message}` }, 400);
    }

    // Dispatch des événements Stripe
    try {
      switch (event.type) {

        // Paiement initial réussi — l'abonnement est actif
        case 'checkout.session.completed': {
          const session = event.data.object;
          const { chimera_user_id, plan } = session.metadata || {};
          logger.info(
            `[Billing] checkout.session.completed — user: ${chimera_user_id}, ` +
            `plan: ${plan}, customer: ${session.customer}, session: ${session.id}`
          );
          break;
        }

        // Mise à jour d'un abonnement (changement de plan, renouvellement, etc.)
        case 'customer.subscription.updated': {
          const sub = event.data.object;
          const { chimera_user_id, plan } = sub.metadata || {};
          logger.info(
            `[Billing] customer.subscription.updated — user: ${chimera_user_id}, ` +
            `plan: ${plan}, status: ${sub.status}, sub: ${sub.id}`
          );
          break;
        }

        // Résiliation d'un abonnement — downgrade vers FREE à prévoir
        case 'customer.subscription.deleted': {
          const sub = event.data.object;
          const { chimera_user_id } = sub.metadata || {};
          logger.info(
            `[Billing] customer.subscription.deleted — user: ${chimera_user_id}, ` +
            `sub: ${sub.id} — downgrade vers FREE`
          );
          break;
        }

        // Paiement réussi (renouvellement mensuel)
        case 'invoice.paid': {
          const invoice = event.data.object;
          logger.info(
            `[Billing] invoice.paid — customer: ${invoice.customer}, ` +
            `montant: ${invoice.amount_paid / 100} ${invoice.currency?.toUpperCase()}`
          );
          break;
        }

        // Échec de paiement — abonnement en retard
        case 'invoice.payment_failed': {
          const invoice = event.data.object;
          logger.warn(
            `[Billing] invoice.payment_failed — customer: ${invoice.customer}, ` +
            `tentative: ${invoice.attempt_count}`
          );
          break;
        }

        default:
          // Événements non gérés — loggés en debug seulement
          if (process.env.LOG_LEVEL === 'debug') {
            logger.info(`[Billing] Événement non géré: ${event.type}`);
          }
      }
    } catch (err) {
      logger.error(`[Billing] Erreur traitement webhook ${event.type}: ${err.message}`);
      // On retourne 200 quand même — Stripe ne doit pas retenter indéfiniment
    }

    // Stripe attend un 200 pour confirmer la réception
    return c.json({ received: true });
  });
}
