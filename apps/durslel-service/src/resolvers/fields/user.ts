import { SubscriptionTier, UserResolvers } from '@/types/generated';

/**
 * User.subscription reports what is in force now, not what is stored.
 *
 * The column keeps the tier that was last paid for and is never cleared, so expiry has to be
 * applied on read — otherwise a subscription that ran out in March still says PRO in June.
 * Doing it here rather than in each query means no caller can forget to.
 */
export const User: UserResolvers = {
  subscription: (parent) => {
    const until = parent.subscriptionUntil as number | Date | null | undefined;
    if (!until) return SubscriptionTier.Free;

    const ends = until instanceof Date ? until.getTime() : Number(until);

    return ends > Date.now() ? parent.subscription : SubscriptionTier.Free;
  },
};
