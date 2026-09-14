import { currentTier, dailyLimit } from '@/common/subscription';
import { UserResolvers } from '@/types/generated';

/**
 * User.subscription reports what is in force now, not what is stored, and User.dailyLimit follows
 * from it.
 *
 * The column keeps the tier that was last paid for and is never cleared, so expiry has to be
 * applied on read — otherwise a subscription that ran out in March still says PRO in June.
 * Doing it here rather than in each query means no caller can forget to.
 *
 * dailyLimit is served from here rather than duplicated in the web app because the two used to
 * disagree by construction: the browser had its own copy of the constant, and a per-tier number
 * cannot be kept in step that way. startRender enforces the same function.
 */
export const User: UserResolvers = {
  subscription: (parent) => currentTier(parent),
  dailyLimit: (parent) => dailyLimit(parent),
};
