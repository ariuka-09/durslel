// Covers what is easy to get wrong about the money path: amounts are integer minor units, the
// two POSTs must carry distinct but *stable* idempotency keys, a test key may only ever reach the
// sandbox operator, and a Wire error has to survive as a status rather than a thrown parse error.
import { createHmac } from 'node:crypto';

import { createCheckout, validAmount, verifyWebhook, WireError } from '@/lib/wire';

const INTENT = { id: 'pi_1', status: 'requires_payment_method', amount: 50000, currency: 'MNT', livemode: false, expires_at: null };
const SESSION = { id: 'cs_1', url: 'https://pay.wire.mn/c/tok', payment_intent: 'pi_1' };

type Call = [string, RequestInit];

const respondWith = (...responses: [unknown, number][]): jest.Mock => {
  const fetchMock = jest.fn(async () => {
    const [body, status] = responses.shift() ?? [{}, 200];
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
};

const calls = (fetchMock: jest.Mock): Call[] => fetchMock.mock.calls as unknown as Call[];

beforeEach(() => {
  process.env.WIRE_API_KEY = 'sk_test_abc';
  delete process.env.WIRE_OPERATORS;
  delete process.env.WIRE_ALLOW_LIVE;
});

describe('validAmount', () => {
  it('accepts a whole number of tugriks', () => {
    expect(validAmount(50000)).toBe(true);
  });

  it('rejects zero, negatives, fractions and non-numbers', () => {
    expect(validAmount(0)).toBe(false);
    expect(validAmount(-1)).toBe(false);
    expect(validAmount(500.5)).toBe(false);
    expect(validAmount('50000')).toBe(false);
    expect(validAmount(1_000_001)).toBe(false);
  });
});

describe('createCheckout', () => {
  it('creates the intent then the session and returns the hosted url', async () => {
    const fetchMock = respondWith([INTENT, 200], [SESSION, 200]);

    const out = await createCheckout({ amount: 50000, reference: 'order-1001' });

    expect(out).toMatchObject({ url: SESSION.url, paymentIntentId: 'pi_1', sessionId: 'cs_1' });
    const [intentCall, sessionCall] = calls(fetchMock);
    expect(intentCall[0]).toContain('/payment_intents');
    expect(sessionCall[0]).toContain('/checkout/sessions');
    // Wire rejects the form-encoded body the docs' curl example shows, with invalid_json.
    expect((sessionCall[1].headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(String(sessionCall[1].body))).toEqual({ payment_intent: 'pi_1' });
  });

  it('derives both idempotency keys from the reference, so a retry is not a second payment', async () => {
    const first = respondWith([INTENT, 200], [SESSION, 200]);
    await createCheckout({ amount: 50000, reference: 'order-1001' });
    const second = respondWith([INTENT, 200], [SESSION, 200]);
    await createCheckout({ amount: 50000, reference: 'order-1001' });

    const key = (c: Call) => (c[1].headers as Record<string, string>)['Idempotency-Key'];
    expect(calls(first).map(key)).toEqual(['pi-order-1001', 'cs-order-1001']);
    expect(calls(second).map(key)).toEqual(calls(first).map(key));
  });

  it('routes a test key to the sandbox operator only', async () => {
    const fetchMock = respondWith([INTENT, 200], [SESSION, 200]);

    await createCheckout({ amount: 50000, reference: 'order-1' });

    expect(JSON.parse(String(calls(fetchMock)[0][1].body))).toMatchObject({
      currency: 'MNT',
      allowed_operators: ['sandbox'],
    });
  });

  it('never sends a live key to the sandbox', async () => {
    process.env.WIRE_API_KEY = 'sk_live_abc';
    process.env.WIRE_ALLOW_LIVE = '1';
    process.env.WIRE_OPERATORS = 'qpay,socialpay';
    const fetchMock = respondWith([{ ...INTENT, livemode: true }, 200], [SESSION, 200]);

    await createCheckout({ amount: 50000, reference: 'order-1' });

    expect(JSON.parse(String(calls(fetchMock)[0][1].body)).allowed_operators).toEqual(['qpay', 'socialpay']);
  });

  it('refuses a live key unless live is explicitly allowed', async () => {
    process.env.WIRE_API_KEY = 'sk_live_abc';
    const fetchMock = respondWith([INTENT, 200]);

    await expect(createCheckout({ amount: 50000, reference: 'order-1' })).rejects.toThrow(/live key/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('omits allowed_operators rather than sending an empty list, so Wire picks the operator', async () => {
    process.env.WIRE_API_KEY = 'sk_live_abc';
    process.env.WIRE_ALLOW_LIVE = '1';
    const fetchMock = respondWith([INTENT, 200], [SESSION, 200]);

    await createCheckout({ amount: 50000, reference: 'order-1' });

    expect(JSON.parse(String(calls(fetchMock)[0][1].body))).not.toHaveProperty('allowed_operators');
  });

  it('surfaces a Wire error with its status and code, and does not open a session', async () => {
    const fetchMock = respondWith([{ error: { code: 'amount_too_small', message: 'Amount is too small' } }, 400]);

    await expect(createCheckout({ amount: 42, reference: 'order-1' })).rejects.toMatchObject({
      status: 400,
      code: 'amount_too_small',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('turns a non-JSON gateway error into a WireError rather than a parse crash', async () => {
    globalThis.fetch = jest.fn(async () => new Response('<html>502</html>', { status: 502 })) as unknown as typeof fetch;

    await expect(createCheckout({ amount: 50000, reference: 'order-1' })).rejects.toBeInstanceOf(WireError);
  });

  it('refuses to call Wire at all without an API key', async () => {
    delete process.env.WIRE_API_KEY;
    const fetchMock = respondWith([INTENT, 200]);

    await expect(createCheckout({ amount: 50000, reference: 'order-1' })).rejects.toThrow(/WIRE_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// The webhook is the only thing that proves payment, so its failure modes are the ones worth
// pinning: a body that was re-serialised before checking, a replayed delivery, a rotated secret.
describe('verifyWebhook', () => {
  const SECRET = 'whsec_test';
  const NOW = 1_717_000_000;
  const BODY = JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded', data: { id: 'pi_1' }, created: NOW, livemode: false });

  const sign = (body: string, t: number, secret = SECRET) =>
    `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;

  it('returns the event when the signature matches', () => {
    expect(verifyWebhook(BODY, sign(BODY, NOW), SECRET, NOW)).toMatchObject({ id: 'evt_1', type: 'payment_intent.succeeded' });
  });

  it('accepts a delivery inside the 300s tolerance and rejects one outside it', () => {
    expect(() => verifyWebhook(BODY, sign(BODY, NOW - 299), SECRET, NOW)).not.toThrow();
    expect(() => verifyWebhook(BODY, sign(BODY, NOW - 301), SECRET, NOW)).toThrow(/tolerance/);
  });

  it('rejects a body that changed after signing', () => {
    const header = sign(BODY, NOW);
    // Exactly what re-serialising the parsed body does: same data, different bytes.
    expect(() => verifyWebhook(`${BODY} `, header, SECRET, NOW)).toThrow(/mismatch/);
  });

  it('rejects a signature made with a different secret', () => {
    expect(() => verifyWebhook(BODY, sign(BODY, NOW, 'whsec_other'), SECRET, NOW)).toThrow(/mismatch/);
  });

  it('accepts any of several v1 signatures, so a secret can be rotated', () => {
    const stale = createHmac('sha256', 'whsec_old').update(`${NOW}.${BODY}`).digest('hex');
    const header = `${sign(BODY, NOW)},v1=${stale}`;
    expect(verifyWebhook(BODY, header, SECRET, NOW)).toMatchObject({ id: 'evt_1' });
  });

  it('rejects a missing or malformed header without throwing something unhelpful', () => {
    expect(() => verifyWebhook(BODY, null, SECRET, NOW)).toThrow(/missing/);
    expect(() => verifyWebhook(BODY, 'v1=abc', SECRET, NOW)).toThrow(/malformed/);
    expect(() => verifyWebhook(BODY, `t=${NOW}`, SECRET, NOW)).toThrow(/malformed/);
  });

  it('rejects a signature of the wrong length instead of crashing on the comparison', () => {
    expect(() => verifyWebhook(BODY, `t=${NOW},v1=ab`, SECRET, NOW)).toThrow(/mismatch/);
  });

  it('reports a signed body that is not JSON as such', () => {
    expect(() => verifyWebhook('not json', sign('not json', NOW), SECRET, NOW)).toThrow(/not JSON/);
  });
});
