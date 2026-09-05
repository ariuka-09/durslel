import { User } from '@/resolvers/fields/user';
import { SubscriptionTier } from '@/types/generated';
import { ctx, info } from '../test-helpers';

const DAY = 24 * 60 * 60 * 1000;

/** The column keeps what was paid for; this field is what is in force today. */
const subscriptionOf = (row: Record<string, unknown>) =>
  (User.subscription as (p: unknown, a: unknown, c: unknown, i: unknown) => SubscriptionTier)(row, {}, ctx, info);

describe('User.subscription', () => {
  it('reports the paid tier while the period is running', () => {
    expect(
      subscriptionOf({ subscription: SubscriptionTier.Pro, subscriptionUntil: new Date(Date.now() + DAY) }),
    ).toBe(SubscriptionTier.Pro);
  });

  it('reports FREE once the period has passed, without the column being cleared', () => {
    expect(
      subscriptionOf({ subscription: SubscriptionTier.Pro, subscriptionUntil: new Date(Date.now() - DAY) }),
    ).toBe(SubscriptionTier.Free);
  });

  it('reports FREE for someone who has never paid', () => {
    expect(subscriptionOf({ subscription: SubscriptionTier.Free, subscriptionUntil: null })).toBe(
      SubscriptionTier.Free,
    );
  });

  /** D1 hands timestamps back as epoch milliseconds when Drizzle has not mapped them yet. */
  it('accepts an epoch-millisecond timestamp as well as a Date', () => {
    expect(
      subscriptionOf({ subscription: SubscriptionTier.Studio, subscriptionUntil: Date.now() + DAY }),
    ).toBe(SubscriptionTier.Studio);
  });
});
