"use client";

import { SignInButton, useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useState } from "react";

import { SubscriptionTier, useMeQuery } from "@/generated";
import { FREE_DAILY_LIMIT } from "@/lib/jobs";
import { formatPrice, PLANS } from "@/lib/plans";

/**
 * The payment window: three plans, one button each, straight to Wire's hosted checkout.
 *
 * Nothing is granted here. The button buys a checkout session; the tier arrives only once Wire
 * confirms the payment to the webhook, which is why the page sends the buyer away rather than
 * pretending to upgrade them on the spot.
 */
export default function Pricing() {
  const { isLoaded, isSignedIn } = useAuth();
  const { data } = useMeQuery({ skip: !isSignedIn, fetchPolicy: "cache-and-network" });
  const current = data?.me?.subscription ?? SubscriptionTier.Free;
  const until = data?.me?.subscriptionUntil ?? null;

  // Which button was pressed, so only that one says "redirecting" while Wire is being asked.
  const [pending, setPending] = useState<SubscriptionTier | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function buy(tier: SubscriptionTier) {
    setPending(tier);
    setError(null);
    try {
      const res = await fetch("/api/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const body = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !body.url) throw new Error(body.error ?? `payment failed (${res.status})`);

      // Wire's hosted page shows the QR and the bank deeplinks; it comes back to /?paid=<tier>.
      window.location.href = body.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPending(null);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-5 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="font-display text-3xl tracking-tight">Plans</h1>
        <Link href="/" className="text-xs uppercase tracking-[0.2em] text-muted hover:text-ink">
          Back
        </Link>
      </div>

      <p className="max-w-lg text-sm text-muted">
        Each plan is 30 days, paid once — nothing renews on its own. A free account gets{" "}
        {FREE_DAILY_LIMIT} renders a day; the count resets at midnight GMT+8. Payment goes through
        Wire: scan the QR with your bank app, or open the app straight from the checkout page.
      </p>

      {isLoaded && !isSignedIn ? (
        <SignInButton mode="modal">
          <button className="self-start border border-yellow-e px-6 py-2.5 text-sm uppercase tracking-widest text-yellow-e">
            Sign in to subscribe
          </button>
        </SignInButton>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        {PLANS.map((plan) => {
          const active = current === plan.tier;

          return (
            <section
              key={plan.tier}
              className={`flex flex-col gap-4 border p-5 ${
                active ? "border-green-c" : "border-rule"
              }`}
            >
              <div className="flex flex-col gap-1">
                <h2 className="font-display text-xl tracking-tight">{plan.name}</h2>
                <p className="text-sm text-muted">{plan.blurb}</p>
              </div>

              <p className="font-display text-2xl">
                {formatPrice(plan.price)}
                <span className="text-xs text-muted"> / 30 days</span>
              </p>

              {/* The whole of what the money buys, so it is not left to the blurb to imply. */}
              <p className="text-sm">
                <span className="font-display text-lg">{plan.renders}</span>
                <span className="text-muted"> renders a day</span>
              </p>

              <button
                type="button"
                disabled={!isSignedIn || pending !== null}
                onClick={() => buy(plan.tier)}
                className={`mt-auto border px-4 py-2 text-xs uppercase tracking-[0.15em] disabled:opacity-40 ${
                  active ? "border-green-c text-green-c" : "border-blue-d text-blue-d"
                }`}
              >
                {pending === plan.tier
                  ? "Redirecting…"
                  : active
                    ? "Extend 30 days"
                    : `Pay ${formatPrice(plan.price)}`}
              </button>
            </section>
          );
        })}
      </div>

      {/* The one thing a subscriber needs from this page once they have paid. */}
      {until && current !== SubscriptionTier.Free ? (
        <p className="text-xs uppercase tracking-[0.2em] text-muted">
          {current} until {new Date(until).toLocaleDateString()}
        </p>
      ) : null}

      {error ? <p className="text-xs text-red-c">{error}</p> : null}
    </main>
  );
}
