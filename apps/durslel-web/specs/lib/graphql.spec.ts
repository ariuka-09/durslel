// Covers the trap in talking to GraphQL over HTTP: a failed operation comes back as 200 with an
// `errors` array, so checking res.ok is not enough. A token is passed explicitly throughout, so
// no Clerk session has to exist for any of this to run.
import { graphql, graphqlAsService, GraphQLRequestError } from '@/lib/graphql';

const TOKEN = 'test-token';

const respondWith = (body: unknown, init?: ResponseInit) => {
  globalThis.fetch = jest.fn(async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      ...init,
    }),
  ) as unknown as typeof fetch;
};

describe('graphql', () => {
  it('returns data on success', async () => {
    respondWith({ data: { getRenders: [{ id: 'a' }] } });

    const data = await graphql<{ getRenders: { id: string }[] }>('{ getRenders { id } }', undefined, TOKEN);

    expect(data.getRenders).toEqual([{ id: 'a' }]);
  });

  it('treats a 200 carrying errors as a failure', async () => {
    respondWith({ data: null, errors: [{ message: 'Not signed in' }] });

    await expect(graphql('{ getRenders { id } }', undefined, TOKEN)).rejects.toThrow(GraphQLRequestError);
  });

  it('surfaces every error message, not just the first', async () => {
    respondWith({ errors: [{ message: 'first' }, { message: 'second' }] });

    await expect(graphql('{ x }', undefined, TOKEN)).rejects.toThrow(/first; second/);
  });

  it('treats a 200 with neither data nor errors as a failure', async () => {
    respondWith({});

    await expect(graphql('{ x }', undefined, TOKEN)).rejects.toThrow(/no data/);
  });

  it('treats a non-200 as a failure', async () => {
    respondWith({}, { status: 502, statusText: 'Bad Gateway' });

    await expect(graphql('{ x }', undefined, TOKEN)).rejects.toThrow(/502/);
  });

  it('forwards the session token as a bearer', async () => {
    let seen: Headers | null = null;
    globalThis.fetch = jest.fn(async (_url: string, init: RequestInit) => {
      seen = new Headers(init.headers);
      return new Response(JSON.stringify({ data: {} }), { status: 200 });
    }) as unknown as typeof fetch;

    await graphql('{ x }', undefined, TOKEN);

    expect(seen!.get('Authorization')).toBe('Bearer test-token');
  });
});

// The service path exists because a render outlives the request that started it. These pin the
// two things that made it necessary: it needs no session, and it names the user explicitly.
describe('graphqlAsService', () => {
  it('sends the secret and the user, and no bearer', async () => {
    process.env.CLERK_SECRET_KEY = 'sk_test_service';
    let seen: Headers | null = null;
    globalThis.fetch = jest.fn(async (_url: string, init: RequestInit) => {
      seen = new Headers(init.headers);
      return new Response(JSON.stringify({ data: {} }), { status: 200 });
    }) as unknown as typeof fetch;

    await graphqlAsService('mutation { x }', undefined, 'user_abc');

    expect(seen!.get('X-Dursel-Service')).toBe('sk_test_service');
    expect(seen!.get('X-Dursel-User')).toBe('user_abc');
    expect(seen!.get('Authorization')).toBeNull();
  });

  it('fails without the secret rather than calling unauthenticated', async () => {
    delete process.env.CLERK_SECRET_KEY;
    const spy = jest.fn();
    globalThis.fetch = spy as unknown as typeof fetch;

    await expect(graphqlAsService('mutation { x }', undefined, 'user_abc')).rejects.toThrow(/CLERK_SECRET_KEY/);
    expect(spy).not.toHaveBeenCalled();
  });
});
