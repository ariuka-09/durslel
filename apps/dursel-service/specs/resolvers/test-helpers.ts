import { Db, drizzleProvider } from '@/common/drizzle-provider';
import { GraphQLResolveInfo } from 'graphql';

export const info = {} as GraphQLResolveInfo;

const env = {
  DB: {} as D1Database,
  CLERK_SECRET_KEY: 'sk_test_helper',
  RENDERER_URL: 'https://renderer.test/api/render',
};

/**
 * Runs the handed-off work inline instead of deferring it, so a spec can await what startRender
 * kicked off rather than racing it.
 */
export const waited: Promise<unknown>[] = [];
const waitUntil = (promise: Promise<unknown>) => {
  waited.push(promise);
};

/** A signed-in caller. Every resolver here scopes its work to this id. */
export const ctx: Context = { env, userId: 'user_owner', waitUntil };

/** Nobody signed in — what an unauthenticated request produces. */
export const anonCtx: Context = { env, userId: null, waitUntil };

export const render = {
  id: 'render1',
  jobId: '20260101010101-a-test-scene',
  title: 'a test scene',
  url: '/api/video/20260101010101-a-test-scene',
  creatorId: 'user_owner',
  prompt: 'a test scene',
  sceneClass: 'TestScene',
  attempts: 1,
  durationMs: 4200,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

export const written: Record<string, unknown>[] = [];

const fakeDb = (rows: unknown[]) => {
  const link: Record<string, unknown> = { then: (resolve: (_value: unknown) => void) => resolve(rows) };
  for (const name of ['from', 'orderBy', 'where', 'returning']) link[name] = () => link;
  for (const name of ['values', 'set']) {
    link[name] = (value: Record<string, unknown>) => {
      written.push(value);

      return link;
    };
  }

  /** An upsert's update half arrives as `{ target, set }`, and what it writes is the `set`. */
  link.onConflictDoUpdate = (clause: { set: Record<string, unknown> }) => {
    written.push(clause.set);

    return link;
  };
  link.onConflictDoNothing = () => link;

  return { select: () => link, insert: () => link, update: () => link, delete: () => link } as unknown as Db;
};

export const returning = (rows: unknown[]) => {
  written.length = 0;
  waited.length = 0;
  // Call history does not reset between tests on its own, so without this a spec asserting that
  // a resolver never reached the database would be reading the previous test's call.
  jest.mocked(drizzleProvider).mockClear();

  return jest.mocked(drizzleProvider).mockReturnValue(fakeDb(rows));
};
