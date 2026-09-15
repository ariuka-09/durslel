import { graphqlAsService } from "@/lib/graphql";
import { planFor } from "@/lib/plans";
import { verifyWebhook, WireError } from "@/lib/wire";

const ACTIVATE_SUBSCRIPTION = `
  mutation ActivateSubscription($input: ActivateSubscriptionInput!) {
    activateSubscription(input: $input) { id subscription subscriptionUntil }
  }
`;

/**
 * Wire's webhook receiver: POST /api/webhooks/wire
 *
 * This is the only trustworthy answer to "was it paid?". The checkout redirect proves the buyer's
 * browser came back, which anyone can do by typing the URL; a delivery signed with the endpoint
 * secret is what actually says money arrived.
 *
 * Register the URL with Wire (POST /v1/webhook_endpoints) and keep the whsec_… it returns once —
 * it is never shown again. Wire then sends a signed `endpoint.verification` ping, which this
 * answers 2xx like any other delivery, and only then does it start sending live events.
 *
 * ponytail: no IP allowlist here. Wire delivers from 65.109.117.186 only, but the app sits behind
 * a Worker, so the client address belongs to the edge — put the allowlist in Cloudflare's WAF,
 * where it can drop the request before it costs anything. The signature is the real check.
 */
export async function POST(request: Request) {
  // Raw bytes, before anything parses them — the signature covers the exact body that arrived.
  const raw = await request.text();

  const secret = process.env.WIRE_WEBHOOK_SECRET;
  if (!secret) {
    // Registration pings the URL and wants a 2xx before it hands back the whsec_ — so the secret
    // cannot exist yet when the ping arrives. Answer that one type unverified: acknowledging a
    // ping grants nothing, and anyone able to trigger one already holds the API key.
    if (parseType(raw) === "endpoint.verification") {
      console.log("wire endpoint.verification answered before WIRE_WEBHOOK_SECRET was set");
      return new Response(null, { status: 200 });
    }
    // 500, not 400: the delivery is fine, this end is not. Wire retries, which is what should
    // happen while a secret is missing.
    console.error("wire webhook received but WIRE_WEBHOOK_SECRET is not set");
    return new Response("webhook secret not configured", { status: 500 });
  }

  let event;
  try {
    event = verifyWebhook(raw, request.headers.get("WirePayment-Signature"), secret);
  } catch (e) {
    // Never say which check failed: a caller guessing at signatures learns nothing from "bad".
    console.error(`wire webhook rejected: ${e instanceof WireError ? e.message : String(e)}`);
    return new Response("bad signature", { status: 400 });
  }

  switch (event.type) {
    case "endpoint.verification":
      // The registration ping. Answering it is what flips the endpoint from pending to verified.
      break;

    case "payment_intent.succeeded": {
      const intent = event.data as {
        id?: string;
        amount?: number;
        metadata?: { userId?: string; tier?: string };
      };
      const userId = intent.metadata?.userId;
      const plan = planFor(intent.metadata?.tier);

      // A payment with no usable metadata is still a payment, and answering non-2xx would only
      // make Wire redeliver something nothing here can act on. Loud, because it means somebody
      // paid and did not get what they paid for.
      if (!intent.id || !userId || !plan) {
        console.error(
          `wire paid but unattributable: intent=${intent.id} user=${userId} tier=${intent.metadata?.tier} (event ${event.id})`,
        );
        break;
      }

      // Charging the right amount is Wire's job; charging for the right thing is this one. A
      // metadata tier whose price does not match what was actually paid means the two sides
      // disagree, and granting the tier anyway would be the exploitable direction to fail.
      if (intent.amount !== plan.price) {
        console.error(
          `wire amount mismatch: paid ${intent.amount} for ${plan.tier} at ${plan.price} (event ${event.id})`,
        );
        break;
      }

      // Acts as the service on the buyer's behalf: their session ended when they left for the
      // checkout page. The mutation is keyed on the intent id, so a redelivered event extends
      // nothing a second time.
      await graphqlAsService(
        ACTIVATE_SUBSCRIPTION,
        { input: { tier: plan.tier, paymentIntent: intent.id } },
        userId,
      );
      console.log(`wire activated ${plan.tier} for ${userId} (intent ${intent.id})`);
      break;
    }

    default:
      // Unknown types are still 2xx. Refusing them would make Wire retry an event nothing here
      // was ever going to act on.
      console.log(`wire webhook ignored: ${event.type} (event ${event.id})`);
  }

  // Answer immediately. Anything slow belongs after the response, not before it.
  return new Response(null, { status: 200 });
}

function parseType(raw: string): unknown {
  try {
    return (JSON.parse(raw) as { type?: unknown }).type;
  } catch {
    return undefined;
  }
}
