/**
 * What can be bought, and for how much.
 *
 * The catalogue lives on the server side of the app and the browser only ever names a tier, so a
 * request cannot set its own price — the amount is looked up here from the tier.
 *
 * Amounts are whole tugriks. The docs call the field "minor units" and give 50000 as 500.00 ₮,
 * but a live checkout session created with 990000 rendered as 990,000 ₮ on pay.wire.mn — a
 * hundred times the intended price. What the hosted page charges wins over what the docs say.
 *
 * One payment buys 30 days (see activateSubscription in durslel-service). Nothing renews itself.
 */
import { SubscriptionTier } from "@/generated";

export interface Plan {
  tier: SubscriptionTier;
  name: string;
  /** Whole tugriks, as Wire's hosted checkout renders them. */
  price: number;
  blurb: string;
}

export const PLANS: Plan[] = [
  {
    tier: SubscriptionTier.Basic,
    name: "Basic",
    price: 500,
    blurb: "For the occasional scene.",
  },
  {
    tier: SubscriptionTier.Pro,
    name: "Pro",
    price: 5_000,
    blurb: "For regular work.",
  },
  {
    tier: SubscriptionTier.Studio,
    name: "Studio",
    price: 10_000,
    blurb: "For a team sharing an account.",
  },
];

/** Undefined for FREE and for anything that is not a tier at all — both mean "nothing to charge". */
export const planFor = (tier: unknown): Plan | undefined =>
  PLANS.find((plan) => plan.tier === tier);

/** 5000 → "5,000 ₮" — the same number the checkout page will ask for. */
export const formatPrice = (amount: number): string => `${amount.toLocaleString("en-US")} ₮`;

/** What the navbar pill says. FREE is a state, not a plan, so it has no entry in PLANS. */
export const tierLabel = (tier: SubscriptionTier | null | undefined): string =>
  planFor(tier)?.name ?? "Free";
