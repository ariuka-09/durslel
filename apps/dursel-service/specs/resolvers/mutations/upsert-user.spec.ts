import { upsertUser } from '@/resolvers/mutations/upsert-user';
import { anonCtx, ctx, info, returning, written } from '../test-helpers';

jest.mock('@/common/drizzle-provider');
jest.mock('nanoid', () => ({ nanoid: () => 'test-id' }));

const input = { email: 'owner@example.com', firstName: 'Owner', lastName: 'Person' };
const user = { id: 'user_owner', ...input, createdAt: new Date(0), updatedAt: new Date(0) };

describe('upsertUser', () => {
  it('returns the stored profile', async () => {
    returning([user]);

    await expect(upsertUser!({}, { input }, ctx, info)).resolves.toEqual(user);
  });

  /** The id comes from the verified session, never the input, so this cannot write another user. */
  it('keys the row on the session, not on anything the caller sent', async () => {
    returning([user]);

    await upsertUser!({}, { input }, ctx, info);

    expect(written).toContainEqual(expect.objectContaining({ id: 'user_owner' }));
  });

  /** Safe to call on every sign-in: the second call refreshes rather than conflicting. */
  it('refreshes the cached profile on conflict', async () => {
    returning([user]);

    await upsertUser!({}, { input: { ...input, firstName: 'Renamed' } }, ctx, info);

    expect(written).toContainEqual(expect.objectContaining({ firstName: 'Renamed' }));
  });

  it('refuses an anonymous caller', async () => {
    returning([user]);

    await expect(upsertUser!({}, { input }, anonCtx, info)).rejects.toThrow('Not signed in');
  });
});
