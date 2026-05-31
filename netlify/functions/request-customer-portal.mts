import type { Config } from '@netlify/functions';
import { findCustomerByBillingEmail } from './_shared/db.mts';
import { hasEmailConfig, sendEmail } from './_shared/email.mts';
import { optionalEnv, siteUrl } from './_shared/env.mts';
import { json, methodNotAllowed } from './_shared/responses.mts';
import { stripeClient } from './_shared/stripe.mts';

const GENERIC_SUCCESS =
  'Si un abonnement Nama IA existe pour cet email, un lien privé vient d’être envoyé à l’adresse de facturation.';

function normalizeEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default async (req: Request) => {
  if (req.method !== 'POST') return methodNotAllowed();

  try {
    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(body.email);

    if (!isEmail(email)) {
      return json({ error: 'Entrez une adresse email valide.' }, 400);
    }

    if (!hasEmailConfig()) {
      return json({ error: 'Le service email n’est pas encore configuré.' }, 503);
    }

    const customer = await findCustomerByBillingEmail(email);
    if (!customer) {
      return json({ ok: true, message: GENERIC_SUCCESS });
    }

    const origin = siteUrl();
    const stripe = stripeClient();
    const configuration = optionalEnv('STRIPE_PORTAL_CONFIGURATION_ID');
    const portal = await stripe.billingPortal.sessions.create({
      customer: customer.stripe_customer_id,
      ...(configuration ? { configuration } : {}),
      locale: 'fr',
      return_url: `${origin}/abonnement.html?status=retour`,
    });

    const safeName = escapeHtml(customer.name || 'client Nama IA');
    const safeUrl = escapeHtml(portal.url);
    const text = [
      'Bonjour,',
      '',
      'Voici votre lien privé pour gérer ou résilier votre abonnement Nama IA :',
      portal.url,
      '',
      'Ce lien est personnel et temporaire. S’il expire, vous pouvez refaire une demande depuis le site.',
      '',
      'Nama IA',
    ].join('\n');

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#16120d">
        <p>Bonjour ${safeName},</p>
        <p>Voici votre lien privé pour gérer ou résilier votre abonnement Nama IA.</p>
        <p><a href="${safeUrl}" style="display:inline-block;background:#16120d;color:#fff;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:700">Ouvrir mon espace sécurisé</a></p>
        <p>Ce lien est personnel et temporaire. S’il expire, vous pouvez refaire une demande depuis le site.</p>
        <p>Nama IA</p>
      </div>
    `;

    await sendEmail({
      to: customer.email || email,
      subject: 'Votre lien privé pour gérer votre abonnement Nama IA',
      text,
      html,
    });

    return json({ ok: true, message: GENERIC_SUCCESS });
  } catch (error) {
    console.error(error);
    return json({ error: 'Impossible d’envoyer le lien de gestion pour l’instant.' }, 500);
  }
};

export const config: Config = {
  path: '/api/request-customer-portal',
};
