import { SubscriptionTier } from '@/types/generated';

/**
 * Renders a day, by tier — the only thing a subscription actually buys.
 *
 * Until now this was a flat constant of 3 for everyone, so a paid account got a coloured pill in
 * the navbar and not one extra render. These numbers are the product, so they live in one place
 * that both the limit check and the number shown in the UI read from.
 *
 * They are not proportional to price, and should not be: a plan is bought for the ceiling being
 * out of the way, not for a unit rate. Renderer time is the real constraint, and at four
 * concurrent renders of roughly a minute each the container serves thousands a day — so the
 * ceiling here is about what one account may reasonably take, not about capacity.
 */
export const DAILY_LIMITS: Record<SubscriptionTier, number> = {
  [SubscriptionTier.Free]: 3,
  [SubscriptionTier.Basic]: 10,
  [SubscriptionTier.Pro]: 30,
  [SubscriptionTier.Studio]: 100,
};

/** The two columns any tier decision is made from. Both queries and resolvers hand these over. */
export interface Subscribed {
  subscription?: SubscriptionTier | string | null;
  subscriptionUntil?: number | Date | null;
}

/**
 * The tier in force right now, which is not the tier in the column.
 *
 * `subscription` keeps whatever was last paid for and is never cleared on expiry — that is what
 * lets a lapsed subscriber keep their history and get their old tier back by paying again. So the
 * period has to be applied on every read, or a subscription that ran out in March still says PRO
 * in June. One function, so no caller can forget.
 */
export const currentTier = (user: Subscribed): SubscriptionTier => {
  const until = user.subscriptionUntil;
  if (!until) return SubscriptionTier.Free;

  const ends = until instanceof Date ? until.getTime() : Number(until);
  if (ends <= Date.now()) return SubscriptionTier.Free;

  // A tier the enum no longer has — an older row, a hand-edited value — reads as FREE rather
  // than as an account with no limit at all.
  return (user.subscription as SubscriptionTier) in DAILY_LIMITS
    ? (user.subscription as SubscriptionTier)
    : SubscriptionTier.Free;
};

/** How many renders this account may start today. */
export const dailyLimit = (user: Subscribed): number => DAILY_LIMITS[currentTier(user)];
