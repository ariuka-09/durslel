import { eq } from 'drizzle-orm';
import { GraphQLError } from 'graphql';

import { requireService } from '@/common/auth';
import { drizzleProvider } from '@/common/drizzle-provider';
import { userTable } from '@/drizzle-config';
import { MutationResolvers, SubscriptionTier } from '@/types/generated';

/** One payment buys this much time. Wire has no recurring billing here — each period is bought. */
const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Records a subscription that Wire has confirmed was paid for.
 *
 * Called by durslel-web's webhook handler, as the service: the buyer left for the checkout page
 * and their session went with them, so the only thing left proving this should happen is the
 * signature on Wire's delivery, verified before this is reached.
 *
 * Service-only for the obvious reason — from a browser this would be a free upgrade button.
 *
 * Exactly-once per payment, because Wire may deliver the same event twice and the second delivery
 * must not buy another month. The intent id is stored on the row and a repeat is answered with
 * the row as it already stands.
 *
 * Extends rather than replaces: paying again with time still on the clock adds to it instead of
 * throwing the remainder away.
 */
export const activateSubscription: MutationResolvers['activateSubscription'] = async (
  _,
  { input },
  ctx,
) => {
  const db = drizzleProvider(ctx.env);
  const id = requireService(ctx);

  if (input.tier === SubscriptionTier.Free) {
    throw new GraphQLError('FREE is not a paid tier', { extensions: { code: 'BAD_USER_INPUT' } });
  }

  const [current] = await db.select().from(userTable).where(eq(userTable.id, id));
  if (!current) throw new GraphQLError(`User not found: ${id}`, { extensions: { code: 'NOT_FOUND' } });

  // The same payment arriving twice is a delivery retry, not a renewal.
  if (current.subscriptionPayment === input.paymentIntent) return current;

  const now = Date.now();
  const remaining = current.subscriptionUntil?.getTime() ?? 0;
  const until = new Date(Math.max(now, remaining) + PERIOD_MS);

  const [row] = await db
    .update(userTable)
    .set({
      subscription: input.tier,
      subscriptionUntil: until,
      subscriptionPayment: input.paymentIntent,
      updatedAt: new Date(),
    })
    .where(eq(userTable.id, id))
    .returning();

  return row;
};
