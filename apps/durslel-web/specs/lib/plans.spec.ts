// The price a payment is created for comes from here, not from the browser, so what this returns
// is the whole defence against someone buying STUDIO for 1 ₮.
import { formatPrice, planFor, PLANS } from '@/lib/plans';
import { SubscriptionTier } from '@/generated';

describe('planFor', () => {
  it('finds a plan by its tier', () => {
    expect(planFor(SubscriptionTier.Pro)).toMatchObject({ tier: SubscriptionTier.Pro, price: 5_000 });
  });

  it('has no plan for FREE, which is a state rather than something bought', () => {
    expect(planFor(SubscriptionTier.Free)).toBeUndefined();
  });

  it('returns undefined for anything that is not a tier, including what a request might send', () => {
    expect(planFor('pro')).toBeUndefined();
    expect(planFor(undefined)).toBeUndefined();
    expect(planFor({ tier: 'PRO' })).toBeUndefined();
  });

  /**
   * The bug this pins: prices were stored as minor units and displayed divided by 100, so a plan
   * shown as 9,900 ₮ asked pay.wire.mn for 990,000 ₮. The price sent and the price shown are now
   * the same number, and that is what this asserts.
   */
  it('sends the same number it displays', () => {
    for (const plan of PLANS) expect(formatPrice(plan.price)).toBe(`${plan.price.toLocaleString('en-US')} ₮`);
  });
});

describe('formatPrice', () => {
  it('renders an amount as tugriks', () => {
    expect(formatPrice(5_000)).toBe('5,000 ₮');
  });
});
