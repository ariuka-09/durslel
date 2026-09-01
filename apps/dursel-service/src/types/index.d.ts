/**
 * Everything this service is bound to.
 *
 * Deliberately short. As a standalone Worker it holds the database, the credential it needs to
 * identify callers, and the address of the renderer it hands work to — the video bucket and the
 * model key belong to dursel-web, which is a separate deployable.
 */
interface Env {
  DB: D1Database;

  /**
   * Verifies session tokens, and doubles as the shared secret dursel-web presents when it acts on
   * a user's behalf from work that outlives their request. See common/auth.ts.
   */
  CLERK_SECRET_KEY: string;

  /**
   * dursel-web, bound as a service. Worker-to-Worker on the same zone cannot go over a hostname
   * (Cloudflare error 1042), so the renderer is reached through this instead of a URL.
   */
  RENDERER: Fetcher;
}

interface Context {
  env: Env;
  /** Null for an anonymous caller; resolvers that need a user call requireUser. */
  userId: string | null;
  /**
   * Keeps the Worker alive for work that outlasts the response. startRender returns a PENDING row
   * immediately and lets the render run on past it; without this the runtime would cancel that
   * request the moment the response was sent.
   */
  waitUntil: (promise: Promise<unknown>) => void;
}
