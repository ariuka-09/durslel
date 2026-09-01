import { verifyToken } from '@clerk/backend';

import { authenticate, requireUser } from '@/common/auth';

jest.mock('@clerk/backend', () => ({ verifyToken: jest.fn() }));

const SECRET = 'sk_test_the_real_secret';
const env = { DB: {} as D1Database, CLERK_SECRET_KEY: SECRET };

const request = (headers: Record<string, string>) => new Request('https://x/graphql', { headers });

beforeEach(() => jest.mocked(verifyToken).mockReset());

describe('authenticate — service calls', () => {
  /**
   * dursel-web presents this when it acts for a user from work that outlives their request: a
   * render streams for minutes, long past the life of the session token that started it.
   */
  it('accepts the named user when the secret matches', async () => {
    const headers = { 'X-Dursel-Service': SECRET, 'X-Dursel-User': 'user_abc' };

    await expect(authenticate(request(headers), env)).resolves.toBe('user_abc');
  });

  it('rejects a wrong secret', async () => {
    const headers = { 'X-Dursel-Service': 'not-the-secret', 'X-Dursel-User': 'user_abc' };

    await expect(authenticate(request(headers), env)).resolves.toBeNull();
  });

  /** Length is compared first, so a secret of the wrong size never reaches the byte loop. */
  it('rejects a secret of a different length', async () => {
    const headers = { 'X-Dursel-Service': 'short', 'X-Dursel-User': 'user_abc' };

    await expect(authenticate(request(headers), env)).resolves.toBeNull();
  });

  it('yields nobody when the secret is right but no user is named', async () => {
    await expect(authenticate(request({ 'X-Dursel-Service': SECRET }), env)).resolves.toBeNull();
  });

  /** Presenting the service header commits you to it — it must not fall back to a session. */
  it('does not fall through to token auth when the secret is wrong', async () => {
    const headers = { 'X-Dursel-Service': 'wrong-but-same-len!!!!', Authorization: 'Bearer good' };

    await expect(authenticate(request(headers), env)).resolves.toBeNull();
    expect(verifyToken).not.toHaveBeenCalled();
  });
});

describe('authenticate — session calls', () => {
  it('reads a bearer token', async () => {
    jest.mocked(verifyToken).mockResolvedValue({ sub: 'user_from_bearer' } as never);

    await expect(authenticate(request({ Authorization: 'Bearer tok' }), env)).resolves.toBe('user_from_bearer');
  });

  it('falls back to the __session cookie the browser sends', async () => {
    jest.mocked(verifyToken).mockResolvedValue({ sub: 'user_from_cookie' } as never);
    const headers = { Cookie: 'other=1; __session=tok; more=2' };

    await expect(authenticate(request(headers), env)).resolves.toBe('user_from_cookie');
  });

  /** Expired or malformed tokens are the anonymous case, not a server fault. */
  it('reports nobody when the token does not verify', async () => {
    jest.mocked(verifyToken).mockRejectedValue(new Error('expired'));

    await expect(authenticate(request({ Authorization: 'Bearer tok' }), env)).resolves.toBeNull();
  });

  it('reports nobody when no credential is presented at all', async () => {
    await expect(authenticate(request({}), env)).resolves.toBeNull();
    expect(verifyToken).not.toHaveBeenCalled();
  });

  /** Cookies are almost never just ours — the header can be full and still hold no session. */
  it('reports nobody when the cookie header carries no session', async () => {
    await expect(authenticate(request({ Cookie: 'other=1; more=2' }), env)).resolves.toBeNull();
    expect(verifyToken).not.toHaveBeenCalled();
  });

  /** A cleared session arrives as an empty value, which is no credential rather than an empty one. */
  it('treats an empty session cookie as absent', async () => {
    await expect(authenticate(request({ Cookie: '__session=' }), env)).resolves.toBeNull();
    expect(verifyToken).not.toHaveBeenCalled();
  });

  /** A verified token with no subject is nobody, not a user called undefined. */
  it('reports nobody when the token verifies but carries no subject', async () => {
    jest.mocked(verifyToken).mockResolvedValue({} as never);

    await expect(authenticate(request({ Authorization: 'Bearer tok' }), env)).resolves.toBeNull();
  });
});

describe('authenticate — misconfiguration', () => {
  /**
   * If the Worker is deployed without its secret, a service header must not become a way in.
   * Comparing against a missing key has to fail closed rather than throw or match.
   */
  it('rejects a service call when the Worker has no secret configured', async () => {
    const noSecret = { DB: {} as D1Database } as Env;
    const headers = { 'X-Dursel-Service': SECRET, 'X-Dursel-User': 'user_abc' };

    await expect(authenticate(request(headers), noSecret)).resolves.toBeNull();
  });
});

describe('requireUser', () => {
  it('passes a real id straight through', () => {
    expect(requireUser('user_abc')).toBe('user_abc');
  });

  it('raises UNAUTHENTICATED for nobody', () => {
    expect(() => requireUser(null)).toThrow('Not signed in');
  });
});
