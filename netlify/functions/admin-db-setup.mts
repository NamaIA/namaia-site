import type { Config } from '@netlify/functions';
import { requireEnv } from './_shared/env.mts';
import { json, methodNotAllowed } from './_shared/responses.mts';
import { sql } from './_shared/db.mts';
import { CORE_SCHEMA_STATEMENTS } from './_shared/schema.mts';

export default async (req: Request) => {
  if (req.method !== 'POST') return methodNotAllowed();

  const token = req.headers.get('x-admin-setup-token');
  if (!token || token !== requireEnv('ADMIN_SETUP_TOKEN')) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const db = sql();

  for (const statement of CORE_SCHEMA_STATEMENTS) {
    await db.query(statement);
  }

  return json({ ok: true, statements: CORE_SCHEMA_STATEMENTS.length });
};

export const config: Config = {
  path: '/api/admin/db-setup',
};
