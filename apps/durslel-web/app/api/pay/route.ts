import { auth } from "@clerk/nextjs/server";

import { planFor } from "@/lib/plans";
import { createCheckout, WireError } from "@/lib/wire";

/**
 * Start a subscription payment: returns the Wire hosted checkout URL to send the buyer to.
 *
 *   POST /api/pay  { "tier": "PRO" }
 *   => 200 { "url": "https://pay.wire.mn/c/...", "paymentIntentId": "pi_...", ... }
 *
 * The browser names a tier, never an amount — the price comes from lib/plans.ts on this side, so
 * a caller cannot buy PRO for 1 ₮ by editing the request.
 *
 * Nothing here grants anything. The tier is applied only when Wire confirms the payment, through
 * the signature-verified webhook in app/api/webhooks/wire — a buyer who closes the checkout page,
 * or who forges a redirect back to the app, ends up exactly where they started.
 */
/**
 * Where Wire sends the buyer back.
 *
 * Not derived from the request: this app runs inside a container behind a Worker, and the Host it
 * sees is the container's own 0.0.0.0:3000 — which Wire dutifully redirected buyers to. APP_ORIGIN
 * is set per environment in wrangler.jsonc; the request origin is only a fallback for local dev.
 *
 * Wire keeps the intent id out of the redirect, so it is carried here — the return page asks Wire
 * about that intent rather than believing the browser about it.
 */
function returnUrl(request: Request, tier: string, paymentIntentId: string): string | undefined {
  const origin = process.env.APP_ORIGIN ?? new URL(request.url).origin;
  // Wire requires a full HTTPS address and rejects anything else; a container-local URL is worse
  // than none, because it strands the buyer on a page that does not exist.
  if (!origin.startsWith("https://")) return undefined;

  return `${origin}/?paid=${tier}&pi=${encodeURIComponent(paymentIntentId)}`;
}

export async function POST(request: Request) {
  const { userId } = await auth();
  // Who is paying has to be known now: it rides on the payment as metadata and is the only way
  // the webhook can tell whose subscription to activate.
  if (!userId) return Response.json({ error: "not signed in" }, { status: 401 });

  let body: { tier?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "body must be JSON" }, { status: 400 });
  }

  // The browser sends a tier; the amount comes from the catalogue in whole tugriks.
  const plan = planFor(body.tier);
  if (!plan) {
    return Response.json({ error: "unknown tier" }, { status: 400 });
  }

  try {
    const checkout = await createCheckout({
      amount: plan.price,
      // Unique per attempt on purpose: two deliberate purchases are two payments, and each has
      // to reach Wire as its own intent rather than being deduplicated into the first one.
      reference: `sub-${userId}-${plan.tier}-${Date.now()}`,
      description: `Durslel ${plan.name} — 30 days`,
      successUrlFor: (paymentIntentId) => returnUrl(request, plan.tier, paymentIntentId),
      metadata: { userId, tier: plan.tier },
    });
    return Response.json({ tier: plan.tier, ...checkout });
  } catch (e) {
    if (e instanceof WireError) {
      console.error(`wire ${e.status} ${e.code ?? ""}: ${e.message}`);
      return Response.json(
        { error: e.message, code: e.code },
        { status: e.status >= 500 ? 502 : e.status },
      );
    }
    throw e;
  }
}
