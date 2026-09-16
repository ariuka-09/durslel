// Before the whsec_ exists, the only thing this endpoint may say yes to is the registration ping:
// an unsigned payment event must still be refused, or anyone could post one and be granted a tier.
import { POST } from '@/app/api/webhooks/wire/route';
import { graphqlAsService } from '@/lib/graphql';

jest.mock('@/lib/graphql', () => ({ graphqlAsService: jest.fn() }));

const post = (body: unknown) =>
  POST(new Request('http://x/api/webhooks/wire', { method: 'POST', body: JSON.stringify(body) }));

beforeEach(() => {
  delete process.env.WIRE_WEBHOOK_SECRET;
  jest.mocked(graphqlAsService).mockClear();
});

it('answers the registration ping while no secret is set', async () => {
  expect((await post({ id: 'evt_1', type: 'endpoint.verification' })).status).toBe(200);
});

it('refuses an unsigned payment event while no secret is set', async () => {
  const res = await post({
    id: 'evt_2',
    type: 'payment_intent.succeeded',
    data: { id: 'pi_1', amount: 500, metadata: { userId: 'user_1', tier: 'BASIC' } },
  });

  expect(res.status).toBe(500);
  expect(graphqlAsService).not.toHaveBeenCalled();
});

it('requires a signature once the secret is set, ping included', async () => {
  process.env.WIRE_WEBHOOK_SECRET = 'whsec_test';

  expect((await post({ id: 'evt_3', type: 'endpoint.verification' })).status).toBe(400);
});
