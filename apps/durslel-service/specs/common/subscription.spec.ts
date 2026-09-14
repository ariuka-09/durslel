import { currentTier, DAILY_LIMITS, dailyLimit } from '@/common/subscription';
import { SubscriptionTier } from '@/types/generated';

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000);

describe('currentTier', () => {
  it('reads FREE for an account that has never paid', () => {
    expect(currentTier({})).toBe(SubscriptionTier.Free);
  });

  it('reads the paid tier while the period is still running', () => {
    expect(currentTier({ subscription: SubscriptionTier.Pro, subscriptionUntil: inDays(1) })).toBe(
      SubscriptionTier.Pro,
    );
  });

  /**
   * The column is never cleared on expiry — that is what lets a lapsed subscriber keep their
   * history and get their tier back by paying again — so the period has to be applied on read.
   */
  it('reads FREE once the period has passed, without forgetting what was bought', () => {
    expect(currentTier({ subscription: SubscriptionTier.Studio, subscriptionUntil: inDays(-1) })).toBe(
      SubscriptionTier.Free,
    );
  });

  it('accepts the epoch milliseconds a serialised row carries', () => {
    expect(currentTier({ subscription: SubscriptionTier.Basic, subscriptionUntil: inDays(1).getTime() })).toBe(
      SubscriptionTier.Basic,
    );
  });

  /** A tier the enum no longer has must not read as an account with no ceiling at all. */
  it('reads FREE for a tier it does not recognise', () => {
    expect(currentTier({ subscription: 'PLATINUM', subscriptionUntil: inDays(1) })).toBe(SubscriptionTier.Free);
  });
});

describe('dailyLimit', () => {
  it('gives every tier a ceiling, and every paid one more than free', () => {
    const free = DAILY_LIMITS[SubscriptionTier.Free];

    for (const tier of Object.values(SubscriptionTier)) {
      expect(DAILY_LIMITS[tier]).toBeGreaterThan(0);
      if (tier !== SubscriptionTier.Free) expect(DAILY_LIMITS[tier]).toBeGreaterThan(free);
    }
  });

  it('follows the tier in force, not the tier stored', () => {
    expect(dailyLimit({ subscription: SubscriptionTier.Studio, subscriptionUntil: inDays(1) })).toBe(
      DAILY_LIMITS[SubscriptionTier.Studio],
    );
    expect(dailyLimit({ subscription: SubscriptionTier.Studio, subscriptionUntil: inDays(-1) })).toBe(
      DAILY_LIMITS[SubscriptionTier.Free],
    );
  });
});
