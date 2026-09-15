"use client";

import { SignInButton, useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useState } from "react";

import { SubscriptionTier, useMeQuery } from "@/generated";
import { FREE_DAILY_LIMIT } from "@/lib/jobs";
import { formatPrice, PLANS } from "@/lib/plans";
import { LangToggle, useT } from "@/shared/i18n";
import { ThemeToggle } from "@/shared/theme";

/**
 * The payment window: three plans, one button each, straight to Wire's hosted checkout.
 *
 * Nothing is granted here. The button buys a checkout session; the tier arrives only once Wire
 * confirms the payment to the webhook, which is why the page sends the buyer away rather than
 * pretending to upgrade them on the spot.
 */
export default function Pricing() {
  const { isLoaded, isSignedIn } = useAuth();
  const t = useT();
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
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-extrabold tracking-tight">{t.plans}</h1>
        <div className="flex items-center gap-4">
          <LangToggle />
          <ThemeToggle />
          <Link href="/" className="text-sm font-medium text-muted hover:text-ink">
            {t.back}
          </Link>
        </div>
      </div>

      <p className="max-w-lg text-sm text-muted">{t.plansIntro(FREE_DAILY_LIMIT)}</p>

      {isLoaded && !isSignedIn ? (
        <SignInButton mode="modal">
          <button className="self-start rounded-full bg-accent px-6 py-2.5 text-sm font-medium text-on-accent shadow-soft hover:bg-accent-strong">
            {t.signInToSubscribe}
          </button>
        </SignInButton>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        {PLANS.map((plan) => {
          const active = current === plan.tier;

          return (
            <section
              key={plan.tier}
              className={`flex flex-col gap-4 rounded-card bg-panel p-6 shadow-soft ${
                active ? "ring-2 ring-accent" : ""
              }`}
            >
              <div className="flex flex-col gap-1">
                <h2 className="text-xl font-bold tracking-tight">{plan.name}</h2>
                <p className="text-sm text-muted">{t.blurb[plan.tier] ?? plan.blurb}</p>
              </div>

              <p className="text-2xl font-bold">
                {formatPrice(plan.price)}
                <span className="text-xs text-muted">{t.per30Days}</span>
              </p>

              {/* The whole of what the money buys, so it is not left to the blurb to imply. */}
              <p className="text-sm">
                <span className="text-lg font-bold">{plan.renders}</span>
                <span className="text-muted">{t.rendersADay}</span>
              </p>

              <button
                type="button"
                disabled={!isSignedIn || pending !== null}
                onClick={() => buy(plan.tier)}
                className={`mt-auto rounded-full px-4 py-2 text-sm font-medium disabled:opacity-40 ${
                  active
                    ? "bg-tint text-accent-ink hover:bg-rule"
                    : "bg-accent text-on-accent hover:bg-accent-strong"
                }`}
              >
                {pending === plan.tier
                  ? t.redirecting
                  : active
                    ? t.extend
                    : t.pay(formatPrice(plan.price))}
              </button>
            </section>
          );
        })}
      </div>

      {/* The one thing a subscriber needs from this page once they have paid. */}
      {until && current !== SubscriptionTier.Free ? (
        <p className="text-sm text-muted">
          {t.tierUntil(current, new Date(until).toLocaleDateString())}
        </p>
      ) : null}

      {error ? <p className="text-sm text-bad">{error}</p> : null}
    </main>
  );
}
