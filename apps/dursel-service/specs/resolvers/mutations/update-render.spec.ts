import { updateRender } from '@/resolvers/mutations/update-render';
import { anonCtx, ctx, info, render, returning, written } from '../test-helpers';

jest.mock('@/common/drizzle-provider');
jest.mock('nanoid', () => ({ nanoid: () => 'test-id' }));

describe('updateRender', () => {
  it('returns the updated render', async () => {
    returning([{ ...render, title: 'renamed' }]);

    await expect(updateRender!({}, { id: 'render1', input: { title: 'renamed' } }, ctx, info)).resolves.toEqual({
      ...render,
      title: 'renamed',
    });
  });

  /** Renaming is the only edit; everything else is a fact about what was rendered. */
  it('writes the new title and stamps updatedAt', async () => {
    returning([render]);

    await updateRender!({}, { id: 'render1', input: { title: 'renamed' } }, ctx, info);

    expect(written).toContainEqual(expect.objectContaining({ title: 'renamed', updatedAt: expect.any(Date) }));
  });

  /**
   * The creator predicate is part of the WHERE, so another account's render matches nothing and
   * is never written — it reads as not found rather than forbidden.
   */
  it('raises not found when nothing matched', async () => {
    returning([]);

    await expect(updateRender!({}, { id: 'someone-elses', input: { title: 'x' } }, ctx, info)).rejects.toThrow(
      'Render not found',
    );
  });

  it('refuses an anonymous caller', async () => {
    returning([render]);

    await expect(updateRender!({}, { id: 'render1', input: { title: 'x' } }, anonCtx, info)).rejects.toThrow(
      'Not signed in',
    );
  });
});
