import type { Config } from '@netlify/functions';
import { decryptText, encryptText } from './_shared/crypto.mts';
import { sql } from './_shared/db.mts';
import { optionalEnv } from './_shared/env.mts';
import { googleOAuthClient } from './_shared/google.mts';
import { json, methodNotAllowed } from './_shared/responses.mts';

type GoogleTokenRow = {
  id: string;
  customer_id: string;
  google_email: string | null;
  scope: string | null;
  token_type: string | null;
  expiry_date: string | Date | null;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  calendar_id: string | null;
  business_name: string | null;
};

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

function assertInternalAccess(req: Request): Response | null {
  const secret = optionalEnv('N8N_INTERNAL_SECRET');
  if (!secret) return null;

  const provided = req.headers.get('x-nama-internal-secret');
  if (provided !== secret) {
    return json({ error: 'Unauthorized' }, 401);
  }

  return null;
}

function isUsable(expiryDate: string | Date | null): boolean {
  if (!expiryDate) return false;
  return new Date(expiryDate).getTime() > Date.now() + REFRESH_MARGIN_MS;
}

function publicTokenPayload(row: GoogleTokenRow, accessToken: string, refreshed: boolean) {
  return {
    customer_id: row.customer_id,
    business_name: row.business_name,
    google_email: row.google_email,
    calendar_id: row.calendar_id || 'primary',
    scope: row.scope,
    token_type: row.token_type || 'Bearer',
    access_token: accessToken,
    expires_at: row.expiry_date ? new Date(row.expiry_date).toISOString() : null,
    refreshed,
  };
}

export default async (req: Request) => {
  if (req.method !== 'GET') return methodNotAllowed();

  const unauthorized = assertInternalAccess(req);
  if (unauthorized) return unauthorized;

  try {
    const url = new URL(req.url);
    const customerId = url.searchParams.get('customer_id');
    if (!customerId) return json({ error: 'customer_id manquant.' }, 400);

    const db = sql();
    const rows = await db`
      select
        gt.id,
        gt.customer_id,
        gt.google_email,
        gt.scope,
        gt.token_type,
        gt.expiry_date,
        gt.access_token_enc,
        gt.refresh_token_enc,
        c.calendar_id,
        c.business_name
      from public.google_tokens gt
      join public.nama_customers c on c.id = gt.customer_id
      where gt.customer_id = ${customerId}
        and gt.token_status = 'active'
      limit 1
    `;

    const row = rows[0] as GoogleTokenRow | undefined;
    if (!row) {
      return json({ error: 'Aucun token Google actif pour ce client.', code: 'TOKEN_MISSING' }, 404);
    }

    if (row.access_token_enc && isUsable(row.expiry_date)) {
      const accessToken = decryptText(row.access_token_enc);
      return json(publicTokenPayload(row, accessToken, false));
    }

    if (!row.refresh_token_enc) {
      await db`
        update public.google_tokens
        set
          token_status = 'disconnected',
          last_refresh_error = ${'Refresh token absent.'},
          last_refresh_at = now(),
          updated_at = now()
        where id = ${row.id}
      `;
      return json({ error: 'Connexion Google a refaire pour ce client.', code: 'TOKEN_DISCONNECTED' }, 409);
    }

    const oauth = googleOAuthClient();
    const refreshToken = decryptText(row.refresh_token_enc);
    oauth.setCredentials({ refresh_token: refreshToken });

    try {
      const accessTokenResponse = await oauth.getAccessToken();
      const accessToken = accessTokenResponse.token;
      if (!accessToken) throw new Error("Google n'a pas renvoye de nouvel access token.");

      const credentials = oauth.credentials;
      const expiryDate = credentials.expiry_date ? new Date(credentials.expiry_date) : null;
      const refreshedRow: GoogleTokenRow = {
        ...row,
        access_token_enc: encryptText(accessToken),
        refresh_token_enc: credentials.refresh_token ? encryptText(credentials.refresh_token) : row.refresh_token_enc,
        expiry_date: expiryDate,
        token_type: credentials.token_type ?? row.token_type ?? 'Bearer',
        scope: credentials.scope ?? row.scope,
      };

      await db`
        update public.google_tokens
        set
          access_token_enc = ${refreshedRow.access_token_enc},
          refresh_token_enc = ${refreshedRow.refresh_token_enc},
          expiry_date = ${expiryDate},
          scope = ${refreshedRow.scope},
          token_type = ${refreshedRow.token_type},
          raw_token_enc = ${encryptText(JSON.stringify(credentials))},
          token_status = 'active',
          last_refresh_error = null,
          last_refresh_at = now(),
          updated_at = now()
        where id = ${row.id}
      `;

      return json(publicTokenPayload(refreshedRow, accessToken, true));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue pendant le refresh Google.';
      await db`
        update public.google_tokens
        set
          token_status = 'disconnected',
          last_refresh_error = ${message},
          last_refresh_at = now(),
          updated_at = now()
        where id = ${row.id}
      `;
      return json({ error: 'Impossible de rafraichir le token Google.', code: 'TOKEN_REFRESH_FAILED' }, 502);
    }
  } catch (error) {
    console.error(error);
    return json({ error: 'Impossible de recuperer le token Google.' }, 500);
  }
};

export const config: Config = {
  path: '/api/internal/google-token',
};
