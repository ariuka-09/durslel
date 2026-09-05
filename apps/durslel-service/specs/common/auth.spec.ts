import { verifyToken } from '@clerk/backend';

import { authenticate, requireAdmin, requireService, requireUser } from '@/common/auth';
import { Role } from '@/types/generated';

jest.mock('@clerk/backend', () => ({ verifyToken: jest.fn() }));

const SECRET = 'sk_test_the_real_secret';
const env = { DB: {} as D1Database, CLERK_SECRET_KEY: SECRET, RENDERER: {} as Fetcher };

const request = (headers: Record<string, string>) => new Request('https://x/graphql', { headers });

/** Nobody, with the role that grants nothing. Every rejection below has to land exactly here. */
const anonymous = { userId: null, role: Role.User, service: false };

beforeEach(() => jest.mocked(verifyToken).mockReset());

describe('authenticate — service calls', () => {
  /**
   * durslel-web presents this when it acts for a user from work that outlives their request: a
   * render streams for minutes, long past the life of the session token that started it.
   */
  it('accepts the named user when the secret matches', async () => {
    const headers = { 'X-Dursel-Service': SECRET, 'X-Dursel-User': 'user_abc' };

    await expect(authenticate(request(headers), env)).resolves.toEqual({
      userId: 'user_abc',
      role: Role.User,
      // What separates this from a session: only a caller holding the secret may record what an
      // outside system confirmed. See requireService.
      service: true,
    });
  });

  it('rejects a wrong secret', async () => {
    const headers = { 'X-Dursel-Service': 'not-the-secret', 'X-Dursel-User': 'user_abc' };

    await expect(authenticate(request(headers), env)).resolves.toEqual(anonymous);
  });

  /** Length is compared first, so a secret of the wrong size never reaches the byte loop. */
  it('rejects a secret of a different length', async () => {
    const headers = { 'X-Dursel-Service': 'short', 'X-Dursel-User': 'user_abc' };

    await expect(authenticate(request(headers), env)).resolves.toEqual(anonymous);
  });

  it('yields nobody when the secret is right but no user is named', async () => {
    await expect(authenticate(request({ 'X-Dursel-Service': SECRET }), env)).resolves.toEqual(anonymous);
  });

  /** Presenting the service header commits you to it — it must not fall back to a session. */
  it('does not fall through to token auth when the secret is wrong', async () => {
    const headers = { 'X-Dursel-Service': 'wrong-but-same-len!!!!', Authorization: 'Bearer good' };

    await expect(authenticate(request(headers), env)).resolves.toEqual(anonymous);
    expect(verifyToken).not.toHaveBeenCalled();
  });
});

describe('authenticate — session calls', () => {
  it('reads a bearer token', async () => {
    jest.mocked(verifyToken).mockResolvedValue({ sub: 'user_from_bearer' } as never);

    await expect(authenticate(request({ Authorization: 'Bearer tok' }), env)).resolves.toEqual({
      userId: 'user_from_bearer',
      role: Role.User,
      service: false,
    });
  });

  it('falls back to the __session cookie the browser sends', async () => {
    jest.mocked(verifyToken).mockResolvedValue({ sub: 'user_from_cookie' } as never);
    const headers = { Cookie: 'other=1; __session=tok; more=2' };

    await expect(authenticate(request(headers), env)).resolves.toEqual({
      userId: 'user_from_cookie',
      role: Role.User,
      service: false,
    });
  });

  /** Expired or malformed tokens are the anonymous case, not a server fault. */
  it('reports nobody when the token does not verify', async () => {
    jest.mocked(verifyToken).mockRejectedValue(new Error('expired'));

    await expect(authenticate(request({ Authorization: 'Bearer tok' }), env)).resolves.toEqual(anonymous);
  });

  it('reports nobody when no credential is presented at all', async () => {
    await expect(authenticate(request({}), env)).resolves.toEqual(anonymous);
    expect(verifyToken).not.toHaveBeenCalled();
  });

  /** Cookies are almost never just ours — the header can be full and still hold no session. */
  it('reports nobody when the cookie header carries no session', async () => {
    await expect(authenticate(request({ Cookie: 'other=1; more=2' }), env)).resolves.toEqual(anonymous);
    expect(verifyToken).not.toHaveBeenCalled();
  });

  /** A cleared session arrives as an empty value, which is no credential rather than an empty one. */
  it('treats an empty session cookie as absent', async () => {
    await expect(authenticate(request({ Cookie: '__session=' }), env)).resolves.toEqual(anonymous);
    expect(verifyToken).not.toHaveBeenCalled();
  });

  /** A verified token with no subject is nobody, not a user called undefined. */
  it('reports nobody when the token verifies but carries no subject', async () => {
    jest.mocked(verifyToken).mockResolvedValue({} as never);

    await expect(authenticate(request({ Authorization: 'Bearer tok' }), env)).resolves.toEqual(anonymous);
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

    await expect(authenticate(request(headers), noSecret)).resolves.toEqual(anonymous);
  });
});

describe('authenticate — the role the token carries', () => {
  const verified = (claims: Record<string, unknown>) => {
    jest.mocked(verifyToken).mockResolvedValue({ sub: 'user_abc', ...claims } as never);

    return authenticate(request({ Authorization: 'Bearer tok' }), env);
  };

  /** The shape Clerk's `{"metadata": "{{user.public_metadata}}"}` session claim produces. */
  it('reads ADMIN out of the metadata claim', async () => {
    await expect(verified({ metadata: { role: 'ADMIN' } })).resolves.toEqual({ userId: 'user_abc', role: Role.Admin, service: false });
  });

  /** And the shape a template that maps the value straight through produces. */
  it('reads ADMIN out of a top-level role claim', async () => {
    await expect(verified({ role: 'ADMIN' })).resolves.toEqual({ userId: 'user_abc', role: Role.Admin, service: false });
  });

  /**
   * The dashboard claim is not configured by default. Until it is, no token carries a role — so
   * a missing claim has to mean plain user rather than anything more.
   */
  it('is a plain user when the token carries no role at all', async () => {
    await expect(verified({})).resolves.toEqual({ userId: 'user_abc', role: Role.User, service: false });
  });

  /** Anything unexpected demotes rather than promotes. */
  it.each([{ metadata: { role: 'admin' } }, { metadata: 'ADMIN' }, { metadata: null }, { role: true }])(
    'is a plain user for %p',
    async (claims) => {
      await expect(verified(claims)).resolves.toEqual({ userId: 'user_abc', role: Role.User, service: false });
    },
  );
});

describe('requireUser', () => {
  it('passes a real id straight through', () => {
    expect(requireUser('user_abc')).toBe('user_abc');
  });

  it('raises UNAUTHENTICATED for nobody', () => {
    expect(() => requireUser(null)).toThrow('Not signed in');
  });
});

describe('requireAdmin', () => {
  it('hands an admin their own id back, so it can stand in for requireUser', () => {
    expect(requireAdmin({ userId: 'user_abc', role: Role.Admin, service: false })).toBe('user_abc');
  });

  /** Told, not shown an empty screen: the dashboard is a whole page, not one probeable row. */
  it('raises FORBIDDEN for a signed-in user who is not one', () => {
    expect(() => requireAdmin({ userId: 'user_abc', role: Role.User, service: false })).toThrow('Not an admin');
  });

  /** Nobody is not an admin, but "not signed in" is the more useful thing to say. */
  it('raises UNAUTHENTICATED for nobody', () => {
    expect(() => requireAdmin({ userId: null, role: Role.Admin, service: false })).toThrow('Not signed in');
  });
});

describe('requireService', () => {
  /** The webhook acts for a buyer whose session ended when they left for the checkout page. */
  it('hands back the user the service is acting for', () => {
    expect(requireService({ userId: 'user_abc', role: Role.User, service: true })).toBe('user_abc');
  });

  /** From a browser this would be a button that grants a paid tier for free. */
  it('raises FORBIDDEN for a session, admin or not', () => {
    expect(() => requireService({ userId: 'user_abc', role: Role.User, service: false })).toThrow('Service only');
    expect(() => requireService({ userId: 'user_abc', role: Role.Admin, service: false })).toThrow('Service only');
  });

  it('raises UNAUTHENTICATED when the service names nobody', () => {
    expect(() => requireService({ userId: null, role: Role.User, service: true })).toThrow('Not signed in');
  });
});
