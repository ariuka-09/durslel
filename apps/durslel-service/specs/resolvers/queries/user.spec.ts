import { me, users } from '@/resolvers/queries/user';
import { Role } from '@/types/generated';
import { adminCtx, anonCtx, ctx, info, returning } from '../test-helpers';

jest.mock('@/common/drizzle-provider');
jest.mock('nanoid', () => ({ nanoid: () => 'test-id' }));

const user = {
  id: 'user_owner',
  email: 'owner@example.com',
  firstName: 'Owner',
  lastName: 'Person',
  role: Role.User,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

describe('me', () => {
  it('returns the caller', async () => {
    returning([user]);

    await expect(me!({}, {}, ctx, info)).resolves.toEqual(user);
  });

  /**
   * Null rather than an error: the app asks who is signed in before it knows whether anyone is,
   * and "nobody" is a normal answer to that.
   */
  it('returns nobody for an anonymous caller, without touching the database', async () => {
    const db = returning([user]);

    await expect(me!({}, {}, anonCtx, info)).resolves.toBeNull();
    expect(db).not.toHaveBeenCalled();
  });

  /** A verified session whose row has not been written yet is absent, not an error. */
  it('returns null when the session has no row yet', async () => {
    returning([]);

    await expect(me!({}, {}, ctx, info)).resolves.toBeNull();
  });
});

describe('users', () => {
  it('lists everyone for an admin', async () => {
    returning([user]);

    await expect(users!({}, {}, adminCtx, info)).resolves.toEqual([user]);
  });

  /**
   * The gate is the session token's role. A row saying ADMIN is a mirror of Clerk, and letting it
   * decide would make the mirror the thing that grants the right to read every row.
   */
  it('refuses a signed-in user who is not an admin, without touching the database', async () => {
    const db = returning([user]);

    await expect(users!({}, {}, ctx, info)).rejects.toThrow('Not an admin');
    expect(db).not.toHaveBeenCalled();
  });

  it('refuses an anonymous caller', async () => {
    returning([user]);

    await expect(users!({}, {}, anonCtx, info)).rejects.toThrow('Not signed in');
  });
});
