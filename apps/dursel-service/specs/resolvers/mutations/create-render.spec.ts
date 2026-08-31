import { createRender } from '@/resolvers/mutations/create-render';
import { anonCtx, ctx, info, render, returning, written } from '../test-helpers';

jest.mock('@/common/drizzle-provider');
jest.mock('nanoid', () => ({ nanoid: () => 'test-id' }));

const input = {
  jobId: render.jobId,
  title: render.title,
  url: render.url,
  prompt: render.prompt,
  sceneClass: render.sceneClass,
  attempts: 1,
  durationMs: 4200,
};

describe('createRender', () => {
  it('records the render and returns it', async () => {
    returning([render]);

    await expect(createRender!({}, { input }, ctx, info)).resolves.toEqual(render);
  });

  /** The id comes from the verified session, never the input, so this cannot write another user. */
  it('attributes the render to the caller', async () => {
    returning([render]);

    await createRender!({}, { input }, ctx, info);

    expect(written).toContainEqual(expect.objectContaining({ creatorId: 'user_owner' }));
  });

  /** A render that never says how many tries it took still counts as one. */
  it('defaults attempts to 1 when omitted', async () => {
    returning([render]);

    await createRender!({}, { input: { ...input, attempts: undefined } }, ctx, info);

    expect(written).toContainEqual(expect.objectContaining({ attempts: 1 }));
  });

  it('refuses an anonymous caller', async () => {
    returning([render]);

    await expect(createRender!({}, { input }, anonCtx, info)).rejects.toThrow('Not signed in');
  });
});
