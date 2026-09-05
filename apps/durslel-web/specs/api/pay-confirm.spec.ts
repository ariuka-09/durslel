// The return path grants a paid tier, so what it refuses matters more than what it allows: a
// browser naming someone else's PaymentIntent must not be able to confirm it onto its own account.
import { POST } from '@/app/api/pay/confirm/route';
import { graphqlAsService } from '@/lib/graphql';
import { getPaymentIntent } from '@/lib/wire';
import { SubscriptionTier } from '@/generated';

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn(async () => ({ userId: 'user_owner' })) }));
jest.mock('@/lib/graphql', () => ({ graphqlAsService: jest.fn(async () => ({ activateSubscription: { subscription: 'BASIC' } })) }));
jest.mock('@/lib/wire', () => ({ ...jest.requireActual('@/lib/wire'), getPaymentIntent: jest.fn() }));

const intent = {
  id: 'pi_1',
  status: 'succeeded',
  amount: 500,
  metadata: { userId: 'user_owner', tier: SubscriptionTier.Basic },
};

const post = (body: unknown) =>
  POST(new Request('http://x/api/pay/confirm', { method: 'POST', body: JSON.stringify(body) }));

beforeEach(() => {
  jest.mocked(graphqlAsService).mockClear();
  // Call history survives between tests, so a spec asserting Wire was never asked would otherwise
  // be reading the previous test's call.
  jest.mocked(getPaymentIntent).mockClear().mockResolvedValue(intent);
});

it('activates the tier when Wire says the payment succeeded', async () => {
  const res = await post({ paymentIntentId: 'pi_1' });

  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ activated: true });
  expect(graphqlAsService).toHaveBeenCalledWith(
    expect.stringContaining('activateSubscription'),
    { input: { tier: SubscriptionTier.Basic, paymentIntent: 'pi_1' } },
    'user_owner',
  );
});

it('refuses a payment that belongs to another account', async () => {
  jest.mocked(getPaymentIntent).mockResolvedValue({ ...intent, metadata: { ...intent.metadata, userId: 'user_someone_else' } });

  expect((await post({ paymentIntentId: 'pi_1' })).status).toBe(403);
  expect(graphqlAsService).not.toHaveBeenCalled();
});

/** Metadata says PRO, the buyer paid for BASIC: the two disagree, so neither is granted. */
it('refuses when the amount does not match the tier it claims', async () => {
  jest.mocked(getPaymentIntent).mockResolvedValue({ ...intent, metadata: { ...intent.metadata, tier: SubscriptionTier.Pro } });

  expect((await post({ paymentIntentId: 'pi_1' })).status).toBe(403);
  expect(graphqlAsService).not.toHaveBeenCalled();
});

it('grants nothing while the payment is still in flight', async () => {
  jest.mocked(getPaymentIntent).mockResolvedValue({ ...intent, status: 'processing' });

  const res = await post({ paymentIntentId: 'pi_1' });

  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ activated: false, status: 'processing' });
  expect(graphqlAsService).not.toHaveBeenCalled();
});

it('rejects an id that is not a PaymentIntent id, without asking Wire', async () => {
  expect((await post({ paymentIntentId: '../../admin' })).status).toBe(400);
  expect(getPaymentIntent).not.toHaveBeenCalled();
});
