export function requireEnv(name: string): string {
  const value = Netlify.env.get(name);
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

export function optionalEnv(name: string): string | undefined {
  return Netlify.env.get(name) || undefined;
}

export function siteUrl(): string {
  return requireEnv('SITE_URL').replace(/\/+$/, '');
}
