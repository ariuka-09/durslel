import { SQL } from 'drizzle-orm';
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';

import { startRendering } from '@/common/renderer';
import { startRender } from '@/resolvers/mutations/start-render';
import { RenderStatus, SubscriptionTier } from '@/types/generated';
import { adminCtx, anonCtx, ctx, filters, info, render, returning, waited, written } from '../test-helpers';

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

  /**
   * A row that never reached an attempt spent no renderer time, so it rations nothing. Both kinds
   * exist: a job turned away by a full queue, and one whose container died before it could write
   * a terminal status. Charging the account for either takes a render away from someone the
   * system already failed.
   */
  it('leaves rows that never ran out of the daily count', async () => {
    returning([pending]);

    await startRender!({}, { prompt: 'a prompt' }, ctx, info);

    const dialect = new SQLiteSyncDialect();
    const clauses = filters.map((clause) => dialect.sqlToQuery(clause as SQL).sql);

    expect(clauses.some((sql) => sql.includes('"attempts"'))).toBe(true);
  });

  /**
   * What a subscription buys, and the whole reason it is worth buying: the cap follows the tier.
   * A paid account used to get the same three renders as a free one.
   */
  it('gives a subscriber the ceiling their tier paid for', async () => {
    const subscriber = {
      ...pending,
      subscription: SubscriptionTier.Pro,
      subscriptionUntil: new Date(Date.now() + 86_400_000),
    };
    // Three rows: over the FREE limit, nowhere near PRO's.
    returning([subscriber, subscriber, subscriber]);

    await expect(startRender!({}, { prompt: 'a prompt' }, ctx, info)).resolves.toBeDefined();
  });

  /** An expired subscription is not a subscription — the row keeps the tier, the account does not. */
  it('drops a lapsed subscriber back to the free ceiling', async () => {
    const lapsed = {
      ...pending,
      subscription: SubscriptionTier.Studio,
      subscriptionUntil: new Date(Date.now() - 1),
    };
    returning([lapsed, lapsed, lapsed]);

    await expect(startRender!({}, { prompt: 'a prompt' }, ctx, info)).rejects.toThrow('Daily limit reached');
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
