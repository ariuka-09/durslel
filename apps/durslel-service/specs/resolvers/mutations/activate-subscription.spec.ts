import { activateSubscription } from '@/resolvers/mutations/activate-subscription';
import { Role, SubscriptionTier } from '@/types/generated';
import { anonCtx, ctx, info, returning, serviceCtx, written } from '../test-helpers';

jest.mock('@/common/drizzle-provider');

const DAY = 24 * 60 * 60 * 1000;
const input = { tier: SubscriptionTier.Pro, paymentIntent: 'pi_1' };

const user = {
  id: 'user_owner',
  email: 'owner@example.com',
  firstName: 'Owner',
  lastName: 'Person',
  role: Role.User,
  subscription: SubscriptionTier.Free,
  subscriptionUntil: null as Date | null,
  subscriptionPayment: null as string | null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

const until = () => (written.find((w) => 'subscriptionUntil' in w)?.subscriptionUntil as Date).getTime();

describe('activateSubscription', () => {
  it('records the tier and 30 days for the user the service is acting for', async () => {
    returning([user]);

    await activateSubscription!({}, { input }, serviceCtx, info);

    expect(written).toContainEqual(
      expect.objectContaining({ subscription: SubscriptionTier.Pro, subscriptionPayment: 'pi_1' }),
    );
    expect(until()).toBeGreaterThan(Date.now() + 29 * DAY);
  });

  /** A browser reaching this would be a free upgrade button. */
  it('refuses a signed-in caller who is not the service', async () => {
    returning([user]);

    await expect(activateSubscription!({}, { input }, ctx, info)).rejects.toThrow('Service only');
    expect(written).toHaveLength(0);
  });

  it('refuses an anonymous caller', async () => {
    returning([user]);

    await expect(activateSubscription!({}, { input }, anonCtx, info)).rejects.toThrow('Service only');
  });

  /** Wire can deliver the same event twice, and the second one must not buy another month. */
  it('is a no-op when the same payment arrives again', async () => {
    const paid = { ...user, subscription: SubscriptionTier.Pro, subscriptionPayment: 'pi_1' };
    returning([paid]);

    await expect(activateSubscription!({}, { input }, serviceCtx, info)).resolves.toEqual(paid);
    expect(written).toHaveLength(0);
  });

  /** Paying again with time left adds to it rather than throwing the remainder away. */
  it('extends a period that is still running', async () => {
    const running = new Date(Date.now() + 10 * DAY);
    returning([{ ...user, subscriptionUntil: running, subscriptionPayment: 'pi_old' }]);

    await activateSubscription!({}, { input }, serviceCtx, info);

    expect(until()).toBeGreaterThan(running.getTime() + 29 * DAY);
  });

  /** An expired period is not credited backwards — the new month starts today. */
  it('starts from now when the last period has already lapsed', async () => {
    returning([{ ...user, subscriptionUntil: new Date(Date.now() - 100 * DAY), subscriptionPayment: 'pi_old' }]);

    await activateSubscription!({}, { input }, serviceCtx, info);

    expect(until()).toBeLessThan(Date.now() + 31 * DAY);
  });

  it('refuses FREE, which is a state rather than something bought', async () => {
    returning([user]);

    await expect(
      activateSubscription!({}, { input: { ...input, tier: SubscriptionTier.Free } }, serviceCtx, info),
    ).rejects.toThrow('FREE is not a paid tier');
  });

  it('refuses a user who has no row', async () => {
    returning([]);

    await expect(activateSubscription!({}, { input }, serviceCtx, info)).rejects.toThrow('User not found');
  });
});
