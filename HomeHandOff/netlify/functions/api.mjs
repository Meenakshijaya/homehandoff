const json = (status, payload) => Response.json(payload, {
  status,
  headers: { 'cache-control': 'no-store' },
});

function upstreamBase() {
  const configured = process.env.HOMEHANDOFF_API_URL;
  if (!configured) return undefined;
  let url;
  try {
    url = new URL(configured);
  } catch {
    throw new Error('HOMEHANDOFF_API_URL must be an absolute HTTP(S) origin.');
  }
  const isLocal = ['localhost', '127.0.0.1'].includes(url.hostname);
  if (process.env.NETLIFY === 'true' && isLocal) {
    throw new Error('HOMEHANDOFF_API_URL cannot point to localhost in a deployed Netlify Function. Deploy the API to a public HTTPS host.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || (url.protocol !== 'https:' && !isLocal)) {
    throw new Error('The production API URL must use HTTPS. HTTP is allowed only for local development.');
  }
  if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error('HOMEHANDOFF_API_URL must contain only the backend origin, without a path or credentials.');
  }
  return url;
}

function secureCookie(cookie) {
  if (/;\s*secure(?:;|$)/i.test(cookie)) return cookie;
  return `${cookie}; Secure`;
}

export default async function handler(request) {
  let base;
  try {
    base = upstreamBase();
  } catch (error) {
    return json(500, { error: error.message });
  }
  if (!base) {
    return json(503, {
      error: 'HomeHandoff API is not configured. Set HOMEHANDOFF_API_URL to the HTTPS origin of the persistent Node API service.',
    });
  }

  const incoming = new URL(request.url);
  const path = incoming.pathname === '/health' ? '/health' : incoming.pathname;
  const destination = new URL(`${path}${incoming.search}`, base);
  const headers = new Headers();
  for (const name of ['accept', 'content-type', 'cookie']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  let body;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const payload = await request.arrayBuffer();
    if (payload.byteLength > 1_000_000) return json(413, { error: 'Request body too large.' });
    if (payload.byteLength) body = payload;
  }

  let response;
  try {
    response = await fetch(destination, {
      method: request.method,
      headers,
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return json(502, { error: 'The HomeHandoff API backend could not be reached. Check that the service is running and HOMEHANDOFF_API_URL is correct.' });
  }

  const responseHeaders = new Headers();
  for (const name of ['content-type', 'cache-control', 'vary']) {
    const value = response.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  const cookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter(Boolean);
  for (const cookie of cookies) responseHeaders.append('set-cookie', secureCookie(cookie));

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

export const config = {
  path: ['/api/*', '/health'],
};
