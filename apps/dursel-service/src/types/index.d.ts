/**
 * Everything this service is bound to.
 *
 * Deliberately short. As a standalone Worker it holds the database and the credential it needs to
 * identify callers, and nothing else — the container, the video bucket and the model key belong to
 * dursel-web, which is a separate deployable and keeps its own bindings.
 */
interface Env {
  DB: D1Database;

  /**
   * Verifies session tokens, and doubles as the shared secret dursel-web presents when it acts on
   * a user's behalf from work that outlives their request. See common/auth.ts.
   */
  CLERK_SECRET_KEY: string;
}

interface Context {
  env: Env;
  /** Null for an anonymous caller; resolvers that need a user call requireUser. */
  userId: string | null;
}
