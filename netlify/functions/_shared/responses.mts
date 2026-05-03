export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export function redirect(url: string, status = 303): Response {
  return new Response(null, {
    status,
    headers: { Location: url },
  });
}

export function methodNotAllowed(): Response {
  return json({ error: 'Method not allowed' }, 405);
}
