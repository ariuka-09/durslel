import { completeRender } from '@/resolvers/mutations/complete-render';
import { RenderStatus } from '@/types/generated';
import { anonCtx, ctx, info, render, returning, written } from '../test-helpers';

jest.mock('@/common/drizzle-provider');
jest.mock('nanoid', () => ({ nanoid: () => 'test-id' }));

const input = { status: RenderStatus.Ok, url: '/api/video/x', sceneClass: 'Scene', attempts: 1, durationMs: 4200 };

describe('completeRender', () => {
  it('returns the settled render', async () => {
    returning([render]);

    await expect(completeRender!({}, { jobId: render.jobId, input }, ctx, info)).resolves.toEqual(render);
  });

  it('writes the outcome and stamps updatedAt', async () => {
    returning([render]);

    await completeRender!({}, { jobId: render.jobId, input }, ctx, info);

    expect(written).toContainEqual(
      expect.objectContaining({ status: RenderStatus.Ok, url: '/api/video/x', updatedAt: expect.any(Date) }),
    );
  });

  it('records a failure with its reason', async () => {
    returning([render]);

    await completeRender!(
      {},
      { jobId: render.jobId, input: { status: RenderStatus.Failed, error: 'manim exploded' } },
      ctx,
      info,
    );

    expect(written).toContainEqual(
      expect.objectContaining({ status: RenderStatus.Failed, error: 'manim exploded' }),
    );
  });

  /**
   * Scoped to the creator like every other single-render write, so a renderer naming the wrong
   * user cannot overwrite somebody else's row.
   */
  it('raises not found when nothing matched', async () => {
    returning([]);

    await expect(completeRender!({}, { jobId: 'someone-elses', input }, ctx, info)).rejects.toThrow(
      'Render not found',
    );
  });

  it('refuses an unauthenticated caller', async () => {
    returning([render]);

    await expect(completeRender!({}, { jobId: render.jobId, input }, anonCtx, info)).rejects.toThrow(
      'Not signed in',
    );
  });
});
