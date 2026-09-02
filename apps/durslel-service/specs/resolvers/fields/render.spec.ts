import { Render } from '@/resolvers/fields/render';
import { ctx, info, render, returning } from '../test-helpers';

jest.mock('@/common/drizzle-provider');
jest.mock('nanoid', () => ({ nanoid: () => 'test-id' }));

const user = {
  id: 'user_owner',
  email: 'owner@example.com',
  firstName: 'Owner',
  lastName: 'Person',
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

const creator = Render.creator as (
  _parent: typeof render,
  _args: Record<string, never>,
  _ctx: Context,
  _info: typeof info,
) => Promise<unknown>;

describe('Render.creator', () => {
  /** Resolved only when asked for, which is why the relation is in the schema at all. */
  it('resolves the author from creatorId', async () => {
    returning([user]);

    await expect(creator(render, {}, ctx, info)).resolves.toEqual(user);
  });

  /** A render whose author row is missing is still a render — the field is nullable. */
  it('resolves to null when the author row is gone', async () => {
    returning([]);

    await expect(creator(render, {}, ctx, info)).resolves.toBeNull();
  });
});
