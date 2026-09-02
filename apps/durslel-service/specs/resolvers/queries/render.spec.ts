import { getRender, getRenderByJobId, getRenders } from '@/resolvers/queries/render';
import { adminCtx, anonCtx, ctx, info, render, returning } from '../test-helpers';

jest.mock('@/common/drizzle-provider');
/** nanoid is ESM-only, and the real drizzle-config reaches it. */
jest.mock('nanoid', () => ({ nanoid: () => 'test-id' }));

describe('getRenders', () => {
  it("returns the caller's renders", async () => {
    returning([render]);

    await expect(getRenders!({}, {}, ctx, info)).resolves.toEqual([render]);
  });

  /** A user who has rendered nothing gets an empty sidebar, not an error. */
  it('returns nothing when the caller has no renders', async () => {
    returning([]);

    await expect(getRenders!({}, {}, ctx, info)).resolves.toEqual([]);
  });

  it('refuses an anonymous caller rather than listing everyone', async () => {
    returning([render]);

    await expect(getRenders!({}, {}, anonCtx, info)).rejects.toThrow('Not signed in');
  });

  /** Reading another user's renders is the admin dashboard's whole job. */
  it("lets an admin name someone else's id", async () => {
    returning([render]);

    await expect(getRenders!({}, { creatorId: 'user_owner' }, adminCtx, info)).resolves.toEqual([render]);
  });

  it("refuses a plain user asking for someone else's, without touching the database", async () => {
    const db = returning([render]);

    await expect(getRenders!({}, { creatorId: 'user_someone_else' }, ctx, info)).rejects.toThrow('Not an admin');
    expect(db).not.toHaveBeenCalled();
  });

  /** Naming your own id is still only asking for your own, so it needs nothing extra. */
  it('lets a plain user name their own id explicitly', async () => {
    returning([render]);

    await expect(getRenders!({}, { creatorId: 'user_owner' }, ctx, info)).resolves.toEqual([render]);
  });
});

describe('getRender', () => {
  it('returns the render when it belongs to the caller', async () => {
    returning([render]);

    await expect(getRender!({}, { id: 'render1' }, ctx, info)).resolves.toEqual(render);
  });

  /**
   * The creator predicate is part of the query, so another account's id simply matches nothing.
   * Absent rather than forbidden: confirming someone else's render exists is itself a leak.
   */
  it('reads as absent when the id is not the caller’s', async () => {
    returning([]);

    await expect(getRender!({}, { id: 'someone-elses' }, ctx, info)).resolves.toBeNull();
  });
});

describe('getRenderByJobId', () => {
  it('looks a render up by its storage key', async () => {
    returning([render]);

    await expect(getRenderByJobId!({}, { jobId: render.jobId }, ctx, info)).resolves.toEqual(render);
  });

  it('reads as absent for an unknown job', async () => {
    returning([]);

    await expect(getRenderByJobId!({}, { jobId: 'nope' }, ctx, info)).resolves.toBeNull();
  });
});
