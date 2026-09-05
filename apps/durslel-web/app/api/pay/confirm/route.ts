import { auth } from "@clerk/nextjs/server";

import { graphqlAsService } from "@/lib/graphql";
import { planFor } from "@/lib/plans";
import { getPaymentIntent, WireError } from "@/lib/wire";

const ACTIVATE_SUBSCRIPTION = `
  mutation ActivateSubscription($input: ActivateSubscriptionInput!) {
    activateSubscription(input: $input) { id subscription subscriptionUntil }
  }
`;

/**
 * Confirm a payment on the buyer's return from checkout: POST { paymentIntentId }.
 *
 * The webhook is the primary path and this is the second one. They exist for different failures:
 * a webhook that is unregistered, unverified, or slow leaves a paying customer on Free with no
 * way to fix it themselves, and a buyer who closes the tab before returning is only ever served
 * by the webhook. Both grant through the same mutation, which is keyed on the PaymentIntent id,
 * so whichever arrives second changes nothing.
 *
 * Nothing here trusts the browser beyond the id it names. The status, the amount and who the
 * payment was for are all read back from Wire, and the tier is granted only if Wire's own
 * metadata names the session's user — otherwise anyone could confirm somebody else's payment
 * onto their own account.
 */
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "not signed in" }, { status: 401 });

  let body: { paymentIntentId?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "body must be JSON" }, { status: 400 });
  }
  if (typeof body.paymentIntentId !== "string" || !/^pi_[A-Za-z0-9]+$/.test(body.paymentIntentId)) {
    return Response.json({ error: "paymentIntentId is required" }, { status: 400 });
  }

  try {
    const intent = await getPaymentIntent(body.paymentIntentId);

    // Still on its way. Not an error — the buyer can land here a moment before the operator has
    // told Wire anything, and the webhook will finish the job either way.
    if (intent.status !== "succeeded") {
      return Response.json({ status: intent.status, activated: false });
    }

    const plan = planFor(intent.metadata?.tier);
    if (intent.metadata?.userId !== userId || !plan || intent.amount !== plan.price) {
      console.error(
        `refusing to confirm ${intent.id}: user=${intent.metadata?.userId} session=${userId} tier=${intent.metadata?.tier} amount=${intent.amount}`,
      );
      return Response.json({ error: "payment does not match this account" }, { status: 403 });
    }

    const data = await graphqlAsService<{ activateSubscription: { subscription: string } }>(
      ACTIVATE_SUBSCRIPTION,
      { input: { tier: plan.tier, paymentIntent: intent.id } },
      userId,
    );

    return Response.json({ status: intent.status, activated: true, ...data.activateSubscription });
  } catch (e) {
    if (e instanceof WireError) {
      console.error(`wire ${e.status} ${e.code ?? ""}: ${e.message}`);
      return Response.json({ error: e.message, code: e.code }, { status: e.status >= 500 ? 502 : e.status });
    }
    throw e;
  }
}
