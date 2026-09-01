import { startRendering } from '@/common/renderer';

const env = {
  DB: {} as D1Database,
  CLERK_SECRET_KEY: 'sk_test_renderer',
  RENDERER_URL: 'https://renderer.test/api/render',
} as Env;

const job = { jobId: '20260101010101-x', prompt: 'a prompt', userId: 'user_owner' };

describe('startRendering', () => {
  /**
   * The renderer executes model-written Python. Without the shared secret on the request it would
   * be an open endpoint on the public internet.
   */
  it('presents the service secret and the job', async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    globalThis.fetch = jest.fn(async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(null, { status: 202 });
    }) as unknown as typeof fetch;

    await startRendering(env, job);

    expect(seen!.url).toBe(env.RENDERER_URL);
    expect(new Headers(seen!.init.headers).get('X-Dursel-Service')).toBe('sk_test_renderer');
    expect(JSON.parse(seen!.init.body as string)).toEqual(job);
  });

  /** A renderer that refuses the job has to surface, or the row would sit PENDING forever. */
  it('throws when the renderer rejects the job', async () => {
    globalThis.fetch = jest.fn(async () => new Response('nope', { status: 503 })) as unknown as typeof fetch;

    await expect(startRendering(env, job)).rejects.toThrow(/503/);
  });
});
