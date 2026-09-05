import { startRendering } from '@/common/renderer';
import { startRender } from '@/resolvers/mutations/start-render';
import { RenderStatus } from '@/types/generated';
import { adminCtx, anonCtx, ctx, info, render, returning, waited, written } from '../test-helpers';

jest.mock('@/common/drizzle-provider');
jest.mock('@/common/renderer');
jest.mock('nanoid', () => ({ nanoid: () => 'test-id' }));

const pending = { ...render, url: null, status: RenderStatus.Pending };

beforeEach(() => jest.mocked(startRendering).mockReset().mockResolvedValue(undefined));

describe('startRender', () => {
  it('returns the pending row without waiting for the render', async () => {
    returning([pending]);

    await expect(startRender!({}, { prompt: 'a prompt' }, ctx, info)).resolves.toEqual(pending);
  });

  /** A render is minutes long; the row is what the client polls in the meantime. */
  it('writes the row as PENDING, attributed to the caller', async () => {
    returning([pending]);

    await startRender!({}, { prompt: 'a prompt' }, ctx, info);

    expect(written).toContainEqual(
      expect.objectContaining({ status: RenderStatus.Pending, creatorId: 'user_owner' }),
    );
  });

  it('hands the job to the renderer', async () => {
    returning([pending]);

    await startRender!({}, { prompt: 'a prompt' }, ctx, info);
    await Promise.all(waited);

    expect(startRendering).toHaveBeenCalledWith(
      ctx.env,
      expect.objectContaining({ prompt: 'a prompt', userId: 'user_owner' }),
    );
  });

  /**
   * Without this the client would poll a job nobody is doing, forever. A renderer that cannot be
   * reached has to land the row in a terminal state.
   */
  it('marks the row FAILED when the renderer cannot be reached', async () => {
    returning([pending]);
    jest.mocked(startRendering).mockRejectedValue(new Error('renderer 503'));

    await startRender!({}, { prompt: 'a prompt' }, ctx, info);
    await Promise.all(waited);

    expect(written).toContainEqual(
      expect.objectContaining({ status: RenderStatus.Failed, error: 'renderer 503' }),
    );
  });

  it('records a non-Error rejection as its string form', async () => {
    returning([pending]);
    jest.mocked(startRendering).mockRejectedValue('boom');

    await startRender!({}, { prompt: 'a prompt' }, ctx, info);
    await Promise.all(waited);

    expect(written).toContainEqual(expect.objectContaining({ error: 'boom' }));
  });

  /** Renderer time is the scarce thing, so a fourth request in a day is refused outright. */
  it('refuses a fourth render in the same day', async () => {
    returning([pending, pending, pending]);

    await expect(startRender!({}, { prompt: 'a prompt' }, ctx, info)).rejects.toThrow('Daily limit reached');
    expect(written).toEqual([]);
    expect(startRendering).not.toHaveBeenCalled();
  });

  it('allows the third render of the day', async () => {
    returning([pending, pending]);

    await expect(startRender!({}, { prompt: 'a prompt' }, ctx, info)).resolves.toBeDefined();
  });

  /** The limit rations renderer time between users; the account that oversees them is exempt. */
  it('lets an admin past the limit', async () => {
    returning([pending, pending, pending, pending]);

    await expect(startRender!({}, { prompt: 'a prompt' }, adminCtx, info)).resolves.toBeDefined();
    expect(written).toContainEqual(expect.objectContaining({ creatorId: 'user_admin' }));
  });

  it('refuses an anonymous caller', async () => {
    returning([pending]);

    await expect(startRender!({}, { prompt: 'a prompt' }, anonCtx, info)).rejects.toThrow('Not signed in');
  });
});
