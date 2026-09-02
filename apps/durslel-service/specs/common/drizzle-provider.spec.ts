import { drizzleProvider } from '@/common/drizzle-provider';

jest.mock('nanoid', () => ({ nanoid: () => 'test-id' }));

describe('drizzleProvider', () => {
  it('wraps the D1 binding in a drizzle client', () => {
    const env: Env = { DB: {} as D1Database, CLERK_SECRET_KEY: 'sk_test_provider', RENDERER: {} as Fetcher };

    expect(drizzleProvider(env)).toBeDefined();
  });
});
