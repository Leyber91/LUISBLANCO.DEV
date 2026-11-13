import { describe, expect, it } from 'vitest';
import { isOwnerAddress, jwtClaims, MAX_PAGES, OwnerReadError, ownerClient, PAGE_ROWS, SESSION_STORE_KEY, sessionFromFragment } from '../owner.js';
import type { OwnerSession } from '../owner.js';
import { BACKEND } from '../transport.js';
import { clock, HOUR, T0 } from './helpers.js';
import { network } from './setup.js';

const b64url = (o: unknown): string =>
  btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = (claims: Record<string, unknown>): string => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(claims)}.signature`;
const TOKEN = jwt({ sub: 'user-1', email: 'someone@example.org', exp: Math.floor(T0 / 1000) + 3600 });

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
    size: () => m.size,
  };
}

interface Seen { url: string; method: string; headers: Record<string, string>; body: unknown }
type Reply = { status: number; json?: unknown } | Error;
/** a backend that answers from a script: the first function to return something wins */
function scripted(...rules: ((req: Seen) => Reply | undefined)[]) {
  const seen: Seen[] = [];
  const fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries((init.headers ?? {}) as Record<string, string>)) headers[k.toLowerCase()] = v;
    const req: Seen = { url: String(input), method: init.method ?? 'GET', headers, body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined };
    seen.push(req);
    for (const rule of rules) {
      const r = rule(req);
      if (r instanceof Error) throw r;
      if (r) return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.json } as unknown as Response;
    }
    return { ok: false, status: 404, json: async () => null } as unknown as Response;
  };
  return { fetch: fetch as typeof globalThis.fetch, seen };
}

const session = (over: Partial<OwnerSession> = {}): OwnerSession =>
  ({ accessToken: TOKEN, refreshToken: 'refresh-1', expiresAt: T0 + HOUR, email: 'someone@example.org', ...over });

describe('what a magic link leaves in the URL', () => {
  it('is a session: both tokens, when it ends, and the address for display', () => {
    const r = sessionFromFragment(`#access_token=${TOKEN}&expires_at=${Math.floor(T0 / 1000) + 3600}&expires_in=3600&refresh_token=r1&token_type=bearer&type=magiclink`, T0);
    expect(r).toEqual({ session: { accessToken: TOKEN, refreshToken: 'r1', expiresAt: T0 + HOUR, email: 'someone@example.org' } });
    const noExpiry = sessionFromFragment(`#access_token=${TOKEN}&refresh_token=r1&expires_in=600`, T0);
    expect(noExpiry).toMatchObject({ session: { expiresAt: T0 + 600_000 } });
  });

  it('is an error when the auth server reports one', () => {
    expect(sessionFromFragment('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired', T0))
      .toEqual({ error: 'Email link is invalid or has expired' });
  });

  it('is nothing for any other fragment', () => {
    expect(sessionFromFragment('', T0)).toBeNull();
    expect(sessionFromFragment('#your-data', T0)).toBeNull();
    expect(sessionFromFragment(`#access_token=${TOKEN}`, T0)).toBeNull();          // no refresh token: not a session
  });

  it('reads the claims without trusting them, and survives a token that is not one', () => {
    expect(jwtClaims(TOKEN)).toMatchObject({ sub: 'user-1', email: 'someone@example.org' });
    expect(jwtClaims(jwt({ email: 'josé@example.org' }))).toEqual({ email: 'josé@example.org' });     // UTF-8, as tokens are
    expect(jwtClaims('not-a-token')).toBeNull();
    expect(jwtClaims('a.%%%.c')).toBeNull();
  });
});

describe('the owner hint', () => {
  it('is false for any address but the owner\'s, and for none', async () => {
    expect(await isOwnerAddress('someone@example.org')).toBe(false);
    expect(await isOwnerAddress('')).toBe(false);
    expect(await isOwnerAddress(null)).toBe(false);
  });
});

describe('the session', () => {
  it('is kept in the storage it is given and nowhere else', () => {
    const storage = memoryStorage();
    const client = ownerClient({ storage, fetch: scripted().fetch });
    expect(client.session()).toBeNull();
    client.adopt(session());
    expect(JSON.parse(storage.getItem(SESSION_STORE_KEY) as string)).toEqual(session());
    expect(ownerClient({ storage, fetch: scripted().fetch }).session()).toEqual(session());   // the same tab, after a reload
    expect(localStorage.length).toBe(0);
  });

  it('defaults to sessionStorage, which a closed tab forgets', () => {
    sessionStorage.clear();
    ownerClient({ fetch: scripted().fetch }).adopt(session());
    expect(sessionStorage.getItem(SESSION_STORE_KEY)).not.toBeNull();
    expect(localStorage.getItem(SESSION_STORE_KEY)).toBeNull();
    sessionStorage.clear();
  });

  it('ignores a stored value that is not a session', () => {
    const storage = memoryStorage();
    storage.setItem(SESSION_STORE_KEY, '{"accessToken": 5}');
    expect(ownerClient({ storage }).session()).toBeNull();
    storage.setItem(SESSION_STORE_KEY, 'not json');
    expect(ownerClient({ storage }).session()).toBeNull();
  });

  it('sign-out forgets it here and tells the auth server', async () => {
    const storage = memoryStorage();
    const backend = scripted(() => ({ status: 204 }));
    const client = ownerClient({ storage, fetch: backend.fetch });
    client.adopt(session());
    await client.signOut();
    expect(client.session()).toBeNull();
    expect(storage.size()).toBe(0);
    expect(backend.seen).toHaveLength(1);
    expect(backend.seen[0]).toMatchObject({ url: `${BACKEND.url}/auth/v1/logout`, method: 'POST', headers: { apikey: BACKEND.key, authorization: `Bearer ${TOKEN}` } });
    await ownerClient({ storage, fetch: scripted(() => new TypeError('offline')).fetch }).signOut();   // never throws
  });
});

describe('asking for a sign-in link', () => {
  const page = 'https://luisblanco.dev/labs/dashboard.html';

  it('posts the address to the auth server, with where the link returns to', async () => {
    const backend = scripted(() => ({ status: 200, json: {} }));
    const r = await ownerClient({ storage: null, fetch: backend.fetch }).requestLink('someone@example.org', page);
    expect(r).toEqual({ ok: true });
    expect(backend.seen).toHaveLength(1);
    expect(backend.seen[0]?.url).toBe(`${BACKEND.url}/auth/v1/otp?redirect_to=${encodeURIComponent(page)}`);
    expect(backend.seen[0]?.method).toBe('POST');
    expect(backend.seen[0]?.headers).toEqual({ apikey: BACKEND.key, 'content-type': 'application/json' });
    expect(backend.seen[0]?.body).toEqual({ email: 'someone@example.org', create_user: true, email_redirect_to: page });
  });

  it('says plainly when the mailer has sent its links for the hour', async () => {
    const backend = scripted(() => ({ status: 429, json: { code: 429, error_code: 'over_email_send_rate_limit', msg: 'email rate limit exceeded' } }));
    expect(await ownerClient({ storage: null, fetch: backend.fetch }).requestLink('a@b.c', page))
      .toEqual({ ok: false, reason: 'rate-limited', detail: '429: email rate limit exceeded' });
  });

  it('reports a refusal with what the server said, and a network failure as one', async () => {
    const refused = scripted(() => ({ status: 400, json: { msg: 'Email address not authorized' } }));
    expect(await ownerClient({ storage: null, fetch: refused.fetch }).requestLink('a@b.c', page))
      .toEqual({ ok: false, reason: 'refused', detail: '400: Email address not authorized' });
    const silent = scripted(() => ({ status: 500 }));
    expect(await ownerClient({ storage: null, fetch: silent.fetch }).requestLink('a@b.c', page))
      .toEqual({ ok: false, reason: 'refused', detail: '500' });
    const down = scripted(() => new TypeError('Failed to fetch'));
    expect(await ownerClient({ storage: null, fetch: down.fetch }).requestLink('a@b.c', page))
      .toEqual({ ok: false, reason: 'network', detail: 'Failed to fetch' });
  });
});

describe('reading usage', () => {
  const byDayRow = { day: '2026-11-13', lab: 'hub', type: 'lab.open', events: 3, installs: 2, sessions: 3, visible_ms: 0 };
  const rawRow = { t: '2026-11-13T10:00:00+00:00', lab: 'hub', type: 'lab.open', install_id: 'i', session: 's', data: null };
  const isProbe = (r: Seen) => r.url.includes('usage_by_day?select=day&limit=1');

  it('signs each request as the account, with the key, and sends no install header', async () => {
    const first = (r: Seen): boolean => r.url.endsWith('offset=0');
    const backend = scripted(
      (r) => (isProbe(r) ? { status: 200, json: [{ day: '2026-11-13' }] } : undefined),
      (r) => (r.url.includes('/usage_by_day?') ? { status: 200, json: first(r) ? [byDayRow] : [] } : undefined),
      (r) => (r.url.includes('/usage_events?') ? { status: 200, json: first(r) ? [rawRow] : [] } : undefined),
    );
    const c = clock();
    const client = ownerClient({ storage: memoryStorage(), fetch: backend.fetch, now: c.now });
    client.adopt(session());
    const read = await client.readUsage('2026-08-16');
    expect(read).toEqual({ byDay: [byDayRow], raw: [rawRow], anyRows: true, truncated: false });
    const byDayUrl = `${BACKEND.url}/rest/v1/usage_by_day?select=*&day=gte.2026-08-16&order=day.asc,lab.asc,type.asc&limit=1000`;
    const rawUrl = `${BACKEND.url}/rest/v1/usage_events?select=t,lab,type,install_id,session,data&type=in.(%22lab.open%22%2C%22lab.leave%22%2C%22lab.handoff%22)&t=gte.2026-08-16T00:00:00Z&order=t.desc,id.desc&limit=1000`;
    expect(backend.seen.map((r) => r.url)).toEqual([
      `${BACKEND.url}/rest/v1/usage_by_day?select=day&limit=1`,
      `${byDayUrl}&offset=0`, `${byDayUrl}&offset=1`,          // the second page is empty: the read is complete
      `${rawUrl}&offset=0`, `${rawUrl}&offset=1`,
    ]);
    for (const r of backend.seen) {
      expect(r.headers).toEqual({ apikey: BACKEND.key, authorization: `Bearer ${TOKEN}` });
      expect(r.method).toBe('GET');
    }
  });

  it('an account that sees no row at all reads nothing more', async () => {
    const backend = scripted(() => ({ status: 200, json: [] }));
    const client = ownerClient({ storage: memoryStorage(), fetch: backend.fetch, now: clock().now });
    client.adopt(session());
    expect(await client.readUsage('2026-08-16')).toEqual({ byDay: [], raw: [], anyRows: false, truncated: false });
    expect(backend.seen).toHaveLength(1);
  });

  it('reads a long range a page at a time, and says when it stopped short', async () => {
    const full = Array.from({ length: PAGE_ROWS }, () => rawRow);
    const two = scripted(
      (r) => (isProbe(r) ? { status: 200, json: [{}] } : undefined),
      (r) => (r.url.includes('/usage_by_day?') ? { status: 200, json: [] } : undefined),
      (r) => ({ status: 200, json: r.url.endsWith('offset=0') ? full : r.url.endsWith('offset=1000') ? full.slice(0, 200) : [] }),
    );
    const client = ownerClient({ storage: memoryStorage(), fetch: two.fetch, now: clock().now });
    client.adopt(session());
    const read = await client.readUsage('2026-08-16');
    expect(read.raw).toHaveLength(1200);
    expect(read.truncated).toBe(false);
    expect(two.seen.filter((r) => r.url.includes('/usage_events?')).map((r) => r.url.split('&').slice(-1)[0])).toEqual(['offset=0', 'offset=1000', 'offset=1200']);

    // an API set to return at most 100 rows a request: a short page is not the last one
    const hundred = Array.from({ length: 250 }, (_, i) => ({ ...rawRow, session: `s${i}` }));
    const capped100 = scripted(
      (r) => (isProbe(r) ? { status: 200, json: [{}] } : undefined),
      (r) => (r.url.includes('/usage_by_day?') ? { status: 200, json: [] } : undefined),
      (r) => { const at = Number(r.url.split('offset=')[1]); return { status: 200, json: hundred.slice(at, at + 100) }; },
    );
    const small = ownerClient({ storage: memoryStorage(), fetch: capped100.fetch, now: clock().now });
    small.adopt(session());
    const all = await small.readUsage('2026-08-16');
    expect(all.raw).toEqual(hundred);
    expect(all.truncated).toBe(false);

    const endless = scripted(
      (r) => (isProbe(r) ? { status: 200, json: [{}] } : undefined),
      (r) => (r.url.includes('/usage_by_day?') ? { status: 200, json: [] } : undefined),
      () => ({ status: 200, json: full }),
    );
    const capped = ownerClient({ storage: memoryStorage(), fetch: endless.fetch, now: clock().now });
    capped.adopt(session());
    const big = await capped.readUsage('2026-08-16');
    expect(big.raw).toHaveLength(MAX_PAGES * PAGE_ROWS);
    expect(big.truncated).toBe(true);
  });

  it('refreshes a session that is about to end before it reads', async () => {
    const NEW = jwt({ sub: 'user-1', email: 'someone@example.org', n: 2 });
    const backend = scripted(
      (r) => (r.url.includes('/auth/v1/token') ? { status: 200, json: { access_token: NEW, refresh_token: 'refresh-2', expires_in: 3600 } } : undefined),
      () => ({ status: 200, json: [] }),
    );
    const c = clock();
    const storage = memoryStorage();
    const client = ownerClient({ storage, fetch: backend.fetch, now: c.now });
    client.adopt(session({ expiresAt: T0 + 30_000 }));
    await client.readUsage('2026-08-16');
    expect(backend.seen[0]).toMatchObject({
      url: `${BACKEND.url}/auth/v1/token?grant_type=refresh_token`, method: 'POST',
      headers: { apikey: BACKEND.key, 'content-type': 'application/json' }, body: { refresh_token: 'refresh-1' },
    });
    expect(backend.seen[1]?.headers['authorization']).toBe(`Bearer ${NEW}`);
    expect(client.session()).toEqual({ accessToken: NEW, refreshToken: 'refresh-2', expiresAt: T0 + HOUR, email: 'someone@example.org' });
  });

  it('refreshes once when the backend answers 401, then reads', async () => {
    const NEW = jwt({ sub: 'user-1', email: 'someone@example.org', n: 3 });
    const backend = scripted(
      (r) => (r.url.includes('/auth/v1/token') ? { status: 200, json: { access_token: NEW, refresh_token: 'refresh-2', expires_in: 3600 } } : undefined),
      (r) => (r.headers['authorization'] === `Bearer ${TOKEN}` ? { status: 401 } : { status: 200, json: [] }),
    );
    const client = ownerClient({ storage: memoryStorage(), fetch: backend.fetch, now: clock().now });
    client.adopt(session());
    expect((await client.readUsage('2026-08-16')).anyRows).toBe(false);
    expect(backend.seen.map((r) => r.url.split('/').slice(3, 5).join('/'))).toEqual(['rest/v1', 'auth/v1', 'rest/v1']);
  });

  it('ends the session when the auth server refuses the refresh token', async () => {
    const backend = scripted(
      (r) => (r.url.includes('/auth/v1/token') ? { status: 400, json: { error_code: 'refresh_token_not_found' } } : undefined),
      () => ({ status: 401 }),
    );
    const storage = memoryStorage();
    const client = ownerClient({ storage, fetch: backend.fetch, now: clock().now });
    client.adopt(session());
    await expect(client.readUsage('2026-08-16')).rejects.toMatchObject({ name: 'OwnerReadError', kind: 'signed-out' });
    expect(client.session()).toBeNull();
    expect(storage.size()).toBe(0);
  });

  it('tells a backend that fails from a network that fails, and keeps the session for another try', async () => {
    const storage = memoryStorage();
    const failing = ownerClient({ storage, fetch: scripted(() => ({ status: 503 })).fetch, now: clock().now });
    failing.adopt(session());
    const e1 = await failing.readUsage('2026-08-16').catch((e: unknown) => e);
    expect(e1).toBeInstanceOf(OwnerReadError);
    expect(e1).toMatchObject({ kind: 'backend', message: 'the backend answered 503' });
    const offline = ownerClient({ storage, fetch: scripted(() => new TypeError('Failed to fetch')).fetch, now: clock().now });
    await expect(offline.readUsage('2026-08-16')).rejects.toMatchObject({ kind: 'network', message: 'Failed to fetch' });
    const odd = ownerClient({ storage, fetch: scripted(() => ({ status: 200, json: { not: 'a list' } })).fetch, now: clock().now });
    await expect(odd.readUsage('2026-08-16')).rejects.toMatchObject({ kind: 'backend' });
    expect(failing.session()).toEqual(session());
  });

  it('with no session, asks the backend nothing', async () => {
    const backend = scripted();
    await expect(ownerClient({ storage: memoryStorage(), fetch: backend.fetch }).readUsage('2026-08-16')).rejects.toMatchObject({ kind: 'signed-out' });
    expect(backend.seen).toHaveLength(0);
    expect(network.attempts).toBe(0);
  });
});
