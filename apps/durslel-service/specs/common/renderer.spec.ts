import { startRendering } from '@/common/renderer';

const bind = (fetch: (url: string, init: RequestInit) => Promise<Response>) =>
  ({ DB: {}, CLERK_SECRET_KEY: 'sk_test_renderer', RENDERER: { fetch } } as unknown as Env);

const job = { jobId: '20260101010101-x', prompt: 'a prompt', userId: 'user_owner' };

describe('startRendering', () => {
  /**
   * The renderer executes model-written Python. Without the shared secret on the request it would
   * be an open endpoint on the public internet.
   */
  it('presents the service secret and the job', async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const env = bind(async (url, init) => {
      seen = { url, init };
      return new Response(null, { status: 202 });
    });

    await startRendering(env, job);

    expect(seen!.url).toContain('/api/render');
    expect(new Headers(seen!.init.headers).get('X-Dursel-Service')).toBe('sk_test_renderer');
    expect(JSON.parse(seen!.init.body as string)).toEqual(job);
  });

  /** A renderer that refuses the job has to surface, or the row would sit PENDING forever. */
  it('throws when the renderer rejects the job', async () => {
    const env = bind(async () => new Response('nope', { status: 503 }));

    await expect(startRendering(env, job)).rejects.toThrow(/503/);
  });
});
