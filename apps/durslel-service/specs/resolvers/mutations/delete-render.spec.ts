import { deleteRender } from '@/resolvers/mutations/delete-render';
import { anonCtx, ctx, info, render, returning } from '../test-helpers';

jest.mock('@/common/drizzle-provider');
jest.mock('nanoid', () => ({ nanoid: () => 'test-id' }));

describe('deleteRender', () => {
  it('reports success when a row was removed', async () => {
    returning([render]);

    await expect(deleteRender!({}, { id: 'render1' }, ctx, info)).resolves.toBe('SUCCESS');
  });

  /**
   * The creator predicate is part of the WHERE, so another account's render deletes nothing and
   * comes back as not found — the same answer as an id that never existed.
   */
  it('raises not found when nothing matched', async () => {
    returning([]);

    await expect(deleteRender!({}, { id: 'someone-elses' }, ctx, info)).rejects.toThrow('Render not found');
  });

  it('refuses an anonymous caller', async () => {
    returning([render]);

    await expect(deleteRender!({}, { id: 'render1' }, anonCtx, info)).rejects.toThrow('Not signed in');
  });
});
