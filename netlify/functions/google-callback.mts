import type { Config } from '@netlify/functions';
import { google } from 'googleapis';
import { encryptText } from './_shared/crypto.mts';
import { googleOAuthClient } from './_shared/google.mts';
import { findCustomerByCheckoutSession, sql } from './_shared/db.mts';
import { json, methodNotAllowed, redirect } from './_shared/responses.mts';
import { siteUrl } from './_shared/env.mts';

export default async (req: Request) => {
  if (req.method !== 'GET') return methodNotAllowed();

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    if (error) return redirect(`${siteUrl()}/connexion-google.html?status=refused`);
    if (!code || !state) return json({ error: 'Retour Google incomplet.' }, 400);

    const db = sql();
    const stateRows = await db`
      update public.google_oauth_states
      set used_at = now()
      where state = ${state}
        and used_at is null
        and expires_at > now()
      returning stripe_checkout_session_id
    `;
    const stateRow = stateRows[0] as { stripe_checkout_session_id: string } | undefined;
    if (!stateRow) return json({ error: 'Lien Google expiré ou déjà utilisé.' }, 400);

    const customer = await findCustomerByCheckoutSession(stateRow.stripe_checkout_session_id);
    if (!customer) return json({ error: 'Client introuvable pour cette session.' }, 404);

    const oauth = googleOAuthClient();
    const tokenResponse = await oauth.getToken(code);
    const tokens = tokenResponse.tokens;
    oauth.setCredentials(tokens);

    let googleEmail: string | null = null;
    try {
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth });
      const info = await oauth2.userinfo.get();
      googleEmail = info.data.email ?? null;
    } catch {
      googleEmail = null;
    }

    await db`
      insert into public.google_tokens (
        customer_id,
        stripe_checkout_session_id,
        google_email,
        scope,
        token_type,
        access_token_enc,
        refresh_token_enc,
        expiry_date,
        raw_token_enc,
        updated_at
      )
      values (
        ${customer.id},
        ${stateRow.stripe_checkout_session_id},
        ${googleEmail},
        ${tokens.scope ?? null},
        ${tokens.token_type ?? null},
        ${tokens.access_token ? encryptText(tokens.access_token) : null},
        ${tokens.refresh_token ? encryptText(tokens.refresh_token) : null},
        ${tokens.expiry_date ? new Date(tokens.expiry_date) : null},
        ${encryptText(JSON.stringify(tokens))},
        now()
      )
      on conflict (customer_id)
      do update set
        stripe_checkout_session_id = excluded.stripe_checkout_session_id,
        google_email = excluded.google_email,
        scope = excluded.scope,
        token_type = excluded.token_type,
        access_token_enc = excluded.access_token_enc,
        refresh_token_enc = coalesce(excluded.refresh_token_enc, public.google_tokens.refresh_token_enc),
        expiry_date = excluded.expiry_date,
        raw_token_enc = excluded.raw_token_enc,
        updated_at = now()
    `;

    return redirect(`${siteUrl()}/connexion-google.html?status=connected`);
  } catch (error) {
    console.error(error);
    return json({ error: 'Impossible de terminer la connexion Google Calendar.' }, 500);
  }
};

export const config: Config = {
  path: '/api/google/callback',
};
