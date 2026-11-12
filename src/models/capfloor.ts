/**
 * Caps and floors.
 *
 * A cap is a strip of CAPLETS. Caplet i covers the period [t_i, t_i+τ]:
 * the rate F_i is fixed at t_i, and at t_i+τ it pays  N·τ·max(F_i − K, 0).
 * So each caplet is a call option on one forward rate, priced with Black-76
 * or Bachelier and discounted from the PAYMENT date:
 *
 *   Caplet_i = N · τ · P(0, t_i+τ) · Black(F_i, K, t_i, σ_i)
 *
 * A floor is the same strip of puts. The first period is usually excluded
 * because its rate is already fixed today.
 *
 * Cap − Floor = payer swap (same strike, same dates) — "cap-floor parity".
 */
import { forwardOption, type VolModel } from './black76';
import type { Curve } from './curve';
import { bisect } from './math/solve';

export type CapType = 'cap' | 'floor';

export interface CapletRow {
  reset: number;
  pay: number;
  forward: number;
  df: number;
  vol: number;
  price: number;
}

/** Caplet periods for a cap of the given maturity (first fixing excluded). */
export function capletPeriods(maturity: number, tau: number): { reset: number; pay: number }[] {
  const n = Math.round(maturity / tau);
  const out = [];
  for (let i = 1; i < n; i++) out.push({ reset: i * tau, pay: (i + 1) * tau });
  return out;
}

/**
 * Price a cap or floor. `vol` is either one flat vol for every caplet, or a
 * function giving each caplet's own ("spot") vol from its reset time.
 */
export function capPrice(
  curve: Curve,
  maturity: number,
  strike: number,
  vol: number | ((reset: number) => number),
  model: VolModel,
  type: CapType = 'cap',
  tau = 0.25,
  notional = 1,
): { total: number; caplets: CapletRow[] } {
  const caplets = capletPeriods(maturity, tau).map(({ reset, pay }) => {
    const forward = curve.fwd(reset, pay);
    const df = curve.df(pay);
    const v = typeof vol === 'number' ? vol : vol(reset);
    const price = forwardOption(model, type === 'cap' ? 'call' : 'put', forward, strike, reset, v, notional * tau * df);
    return { reset, pay, forward, df, vol: v, price };
  });
  return { total: caplets.reduce((s, c) => s + c.price, 0), caplets };
}

/** Value of the payer swap over the same caplet periods (pay K, receive floating). */
export function capSwapValue(curve: Curve, maturity: number, strike: number, tau = 0.25, notional = 1): number {
  return capletPeriods(maturity, tau).reduce(
    (s, { reset, pay }) => s + notional * tau * curve.df(pay) * (curve.fwd(reset, pay) - strike),
    0,
  );
}

/** ATM cap strike: the forward swap rate over the caplet periods. */
export function atmCapStrike(curve: Curve, maturity: number, tau = 0.25): number {
  const periods = capletPeriods(maturity, tau);
  const annuity = periods.reduce((s, p) => s + tau * curve.df(p.pay), 0);
  return (curve.df(periods[0].reset) - curve.df(periods[periods.length - 1].pay)) / annuity;
}

/**
 * Caplet vol stripping.
 *
 * The market quotes ONE flat vol per cap maturity, but the 5Y cap's flat vol
 * mixes the vols of all its caplets. Stripping recovers the individual
 * ("spot") caplet vols, assuming they are constant between cap maturities:
 *   1. The 1Y cap gives the vol of the caplets up to 1Y.
 *   2. The 2Y cap price minus the (now known) 1Y caplets = the 1Y–2Y caplets → solve their vol.
 *   3. ... and so on.
 */
export function stripCapletVols(
  curve: Curve,
  quotes: { maturity: number; vol: number }[],
  strike: number,
  model: VolModel = 'normal',
  tau = 0.25,
): { reset: number; vol: number }[] {
  const stripped: { reset: number; vol: number }[] = [];
  let prevMaturity = 0;
  for (const q of quotes) {
    const target = capPrice(curve, q.maturity, strike, q.vol, model, 'cap', tau).total;
    const known = (reset: number) => stripped.find((s) => Math.abs(s.reset - reset) < 1e-9)?.vol;
    const newResets = capletPeriods(q.maturity, tau)
      .map((p) => p.reset)
      .filter((r) => r + tau > prevMaturity + 1e-9);
    // Solve for the single vol σ of the new caplets.
    const priceWith = (sigma: number) =>
      capPrice(curve, q.maturity, strike, (r) => known(r) ?? sigma, model, 'cap', tau).total - target;
    const sigma = model === 'normal' ? bisect(priceWith, 1e-6, 0.1, 1e-14) : bisect(priceWith, 1e-4, 3, 1e-12);
    for (const r of newResets) stripped.push({ reset: r, vol: sigma });
    prevMaturity = q.maturity;
  }
  return stripped;
}
