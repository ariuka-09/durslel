/**
 * Talks to Wire (docs.wire.mn), the Mongolian payment gateway.
 *
 * One flow only, the one hosted checkout needs: create a PaymentIntent for the amount, open a
 * checkout session on it, hand back the pay.wire.mn URL to redirect the buyer to. No SDK — the
 * whole surface used here is two POSTs, and @buildry-wire/wire would be a dependency for that.
 *
 * The result is never proof of payment. Wire says so explicitly and it is worth repeating here:
 * a redirect back from checkout means the buyer's browser came back, nothing more. Payment is
 * confirmed server-side, from a signature-verified `payment_intent.succeeded` webhook or by
 * re-reading the PaymentIntent from the API.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const API = process.env.WIRE_API_URL ?? "https://api.wire.mn/v1";

/**
 * A live key must never be pointed at the sandbox operator and vice versa — Wire rejects both
 * with `operator_unknown`. The key prefix already says which mode we are in, so nothing has to be
 * configured twice and no deploy can disagree with itself.
 *
 * Empty means "no list": Wire then picks the operator itself. Sending `[]` explicitly is not the
 * same thing to the API, so the field is omitted rather than sent empty.
 */
const operatorsFor = (apiKey: string): string[] =>
  apiKey.startsWith("sk_test_")
    ? ["sandbox"]
    : (process.env.WIRE_OPERATORS ?? "").split(",").filter(Boolean);

/**
 * Amounts are whole tugriks. The docs describe the field as minor units, but a live session
 * created with 990000 was rendered as 990,000 ₮ by the hosted checkout — see lib/plans.ts.
 */
const MAX_AMOUNT = 1_000_000; // ₮ — a ceiling on a single payment, not a business rule.

export const validAmount = (amount: unknown): amount is number =>
  typeof amount === "number" && Number.isInteger(amount) && amount > 0 && amount <= MAX_AMOUNT;

export class WireError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

interface PaymentIntent {
  id: string;
  status: string;
  amount: number;
  currency: string;
  livemode: boolean;
  expires_at: number | null;
}

interface CheckoutSession {
  id: string;
  url: string;
  payment_intent: string;
}

/**
 * `Idempotency-Key` is required on every mutating POST: it is what makes a retry after a dropped
 * response return the original object instead of charging the buyer twice. It is passed in rather
 * than generated here so that a retry of the same order reuses the same key — a fresh uuid per
 * attempt would be no idempotency at all.
 *
 * Reusing one key with a *different* body is rejected with `idempotency_key_in_use` (409) rather
 * than quietly creating something new, so references have to be per-order, not per-endpoint.
 *
 * JSON on every path. The docs show checkout sessions as a form-encoded curl (`-d key=value`),
 * but the API rejects that body with `invalid_json` — verified against the live endpoint.
 */
async function post<T>(
  path: string,
  apiKey: string,
  idempotencyKey: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Idempotency-Key": idempotencyKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  // Read as text first: an error from a proxy in front of the API is not JSON, and letting
  // res.json() throw on it would replace Wire's status with a parse error.
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    throw new WireError(`Wire ${res.status}: ${text.slice(0, 200)}`, res.status);
  }

  if (!res.ok) {
    const error = (parsed as { error?: { code?: string; message?: string } } | null)?.error;
    throw new WireError(
      error?.message ?? `Wire ${res.status} ${res.statusText}`,
      res.status,
      error?.code,
    );
  }
  return parsed as T;
}

/**
 * `reference` is the order's own id. Both keys derive from it, so replaying the same order —
 * a double-clicked button, a retried request — lands on the same intent and the same session
 * instead of a second one the buyer could also pay.
 */
export async function createCheckout(params: {
  amount: number;
  reference: string;
  description?: string;
  /**
   * Built from the PaymentIntent's id, because the id only exists once the intent has been
   * created — and the return page needs it to ask Wire whether the payment actually succeeded.
   */
  successUrlFor?: (paymentIntentId: string) => string | undefined;
  cancelUrl?: string;
  /**
   * Carried on the PaymentIntent and handed back on the webhook. It is the only link between a
   * payment and what it was for: the buyer's session is gone by the time Wire confirms, so who
   * paid and for which tier has to travel with the payment itself.
   */
  metadata?: Record<string, string>;
}): Promise<{ url: string; sessionId: string; paymentIntentId: string; status: string; livemode: boolean }> {
  const apiKey = process.env.WIRE_API_KEY;
  if (!apiKey) throw new WireError("WIRE_API_KEY is not set", 500);
  if (!validAmount(params.amount)) throw new WireError("amount must be a whole number of tugriks", 400);

  // An sk_live_ key moves real money on a real card of a real person. Reaching one from a route
  // that exists to be curl'd takes a deliberate opt-in, so that dropping a live key into
  // .env.local cannot turn a test into a charge by itself.
  if (!apiKey.startsWith("sk_test_") && process.env.WIRE_ALLOW_LIVE !== "1") {
    throw new WireError("refusing to use a live key: set WIRE_ALLOW_LIVE=1 to allow it", 500);
  }

  const operators = operatorsFor(apiKey);
  const intent = await post<PaymentIntent>("/payment_intents", apiKey, `pi-${params.reference}`, {
    amount: params.amount,
    currency: "MNT",
    ...(params.description ? { description: params.description.slice(0, 500) } : {}),
    ...(operators.length ? { allowed_operators: operators } : {}),
    ...(params.metadata ? { metadata: params.metadata } : {}),
  });

  // An intent expires in ~10 minutes and a canceled one cannot take a session, so this call
  // follows immediately rather than waiting for the buyer to click anything.
  const session = await post<CheckoutSession>(
    "/checkout/sessions",
    apiKey,
    `cs-${params.reference}`,
    (() => {
      const successUrl = params.successUrlFor?.(intent.id);

      return {
        payment_intent: intent.id,
        ...(successUrl ? { success_url: successUrl } : {}),
        ...(params.cancelUrl ? { cancel_url: params.cancelUrl } : {}),
      };
    })(),
  );

  return {
    url: session.url,
    sessionId: session.id,
    paymentIntentId: intent.id,
    status: intent.status,
    livemode: intent.livemode,
  };
}

/**
 * Read a PaymentIntent back from Wire.
 *
 * The second way to learn a payment succeeded, and the one that does not depend on a webhook
 * being registered, verified and delivered. Used when the buyer returns from checkout: their
 * browser claims nothing, this asks Wire.
 */
export async function getPaymentIntent(id: string): Promise<{
  id: string;
  status: string;
  amount: number;
  metadata?: Record<string, string>;
}> {
  const apiKey = process.env.WIRE_API_KEY;
  if (!apiKey) throw new WireError("WIRE_API_KEY is not set", 500);

  const res = await fetch(`${API}/payment_intents/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    throw new WireError(`Wire ${res.status}: ${text.slice(0, 200)}`, res.status);
  }

  if (!res.ok) {
    const error = (parsed as { error?: { code?: string; message?: string } } | null)?.error;
    throw new WireError(error?.message ?? `Wire ${res.status}`, res.status, error?.code);
  }

  return parsed as { id: string; status: string; amount: number; metadata?: Record<string, string> };
}

/**
 * A verified webhook event. `data` is the affected resource — for payment_intent.succeeded, the
 * PaymentIntent itself.
 */
export interface WireEvent {
  id: string;
  type: string;
  data: Record<string, unknown>;
  created: number;
  livemode: boolean;
}

/** Wire's own default, and the reason a replayed delivery from last week is not accepted. */
const TOLERANCE_SEC = 300;

/**
 * Verify a webhook delivery and return the event inside it.
 *
 * The signature covers `"<t>.<rawbody>"`, so `rawBody` must be the exact bytes that arrived —
 * anything that has been through JSON.parse and back is a different string and will not match.
 *
 * Throws rather than returning null: every caller of this has exactly one correct response to a
 * bad signature, and that is to refuse the delivery.
 */
export function verifyWebhook(
  rawBody: string,
  header: string | null,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): WireEvent {
  if (!header) throw new WireError("missing WirePayment-Signature header", 400);

  // t=1717000000,v1=5257a8... — more than one v1 can be present while a secret is being rotated.
  const parts = header.split(",").map((p) => p.trim().split("=", 2));
  const t = parts.find(([k]) => k === "t")?.[1];
  const signatures = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || !/^\d+$/.test(t) || signatures.length === 0) {
    throw new WireError("malformed WirePayment-Signature header", 400);
  }

  // A signature is valid forever once seen, so age is the only thing standing between a captured
  // delivery and a replay of it.
  if (Math.abs(nowSec - Number(t)) > TOLERANCE_SEC) {
    throw new WireError("webhook timestamp outside tolerance", 400);
  }

  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest();
  const matched = signatures.some((signature) => {
    // Hex of the wrong length is not a candidate, and timingSafeEqual throws on a length
    // mismatch rather than returning false.
    const given = Buffer.from(signature, "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  if (!matched) throw new WireError("webhook signature mismatch", 400);

  try {
    return JSON.parse(rawBody) as WireEvent;
  } catch {
    throw new WireError("webhook body is signed but not JSON", 400);
  }
}
