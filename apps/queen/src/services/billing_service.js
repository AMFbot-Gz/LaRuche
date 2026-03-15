/**
 * billing_service.js — Stripe billing pour Chimera SaaS
 * Plans : FREE (gratuit) / PRO ($19/mois) / TEAMS ($79/mois)
 */
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-11-20.acacia',
});

// Price IDs Stripe (à configurer dans .env après création des produits)
export const PLANS = {
  FREE: {
    name: 'Free',
    price: 0,
    stripePriceId: null,
    limits: { sessionsPerMonth: 10, maxSessionDuration: 30 * 60 }
  },
  PRO: {
    name: 'Pro',
    price: 19,
    stripePriceId: process.env.STRIPE_PRO_PRICE_ID,
    limits: { sessionsPerMonth: -1, maxSessionDuration: 4 * 60 * 60 }
  },
  TEAMS: {
    name: 'Teams',
    price: 79,
    stripePriceId: process.env.STRIPE_TEAMS_PRICE_ID,
    limits: { sessionsPerMonth: -1, maxSessionDuration: 8 * 60 * 60, workspaces: 5 }
  }
};

export class BillingService {
  /**
   * Crée ou récupère le customer Stripe pour un user.
   * Recherche d'abord par email pour éviter les doublons.
   */
  async getOrCreateCustomer(userId, email) {
    const existing = await stripe.customers.list({ email, limit: 1 });
    if (existing.data.length > 0) return existing.data[0];
    return stripe.customers.create({ email, metadata: { chimera_user_id: userId } });
  }

  /**
   * Crée une session Stripe Checkout pour un plan payant.
   * Lève une erreur si le plan est gratuit ou inconnu.
   */
  async createCheckoutSession({ userId, email, plan, successUrl, cancelUrl }) {
    const customer = await this.getOrCreateCustomer(userId, email);
    const planConfig = PLANS[plan];
    if (!planConfig?.stripePriceId) throw new Error(`Plan invalide ou gratuit: ${plan}`);

    return stripe.checkout.sessions.create({
      customer: customer.id,
      payment_method_types: ['card'],
      line_items: [{ price: planConfig.stripePriceId, quantity: 1 }],
      mode: 'subscription',
      success_url: successUrl || `${process.env.APP_URL}/dashboard?upgrade=success`,
      cancel_url: cancelUrl || `${process.env.APP_URL}/pricing`,
      metadata: { chimera_user_id: userId, plan },
      subscription_data: { metadata: { chimera_user_id: userId, plan } }
    });
  }

  /**
   * Crée une session Customer Portal Stripe pour gérer l'abonnement existant.
   * Permet au client de modifier/annuler son abonnement directement via Stripe.
   */
  async createPortalSession(customerId, returnUrl) {
    return stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl || `${process.env.APP_URL}/settings/billing`,
    });
  }

  /**
   * Vérifie la signature d'un webhook Stripe entrant.
   * Lance une erreur Stripe si la signature est invalide.
   */
  constructWebhookEvent(payload, signature) {
    return stripe.webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET || ''
    );
  }

  /**
   * Vérifie si un user peut démarrer une nouvelle session agent selon son plan.
   * Retourne { allowed: true } ou { allowed: false, reason, upgradeUrl }.
   */
  async canStartSession(userId, plan, sessionsThisMonth) {
    const limits = PLANS[plan]?.limits;
    if (!limits) return { allowed: false, reason: 'Plan inconnu' };
    // -1 = illimité (plans PRO et TEAMS)
    if (limits.sessionsPerMonth === -1) return { allowed: true };
    if (sessionsThisMonth >= limits.sessionsPerMonth) {
      return {
        allowed: false,
        reason: `Limite ${limits.sessionsPerMonth} sessions/mois atteinte. Upgrade vers Pro.`,
        upgradeUrl: '/pricing'
      };
    }
    return { allowed: true };
  }
}

export const billingService = new BillingService();
