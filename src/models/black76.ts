/**
 * Options on FORWARDS — the language of interest rate options.
 *
 * A caplet or swaption is an option on a forward rate F (a forward SOFR/LIBOR
 * rate or a forward swap rate). Two standard models:
 *
 * Black-76 (lognormal): F follows dF = σ·F·dW. Vol σ is quoted in % (e.g. 25%).
 *   Call = DF·[F·N(d1) − K·N(d2)],  d1 = [ln(F/K) + σ²T/2]/(σ√T), d2 = d1 − σ√T
 *   → breaks down for F ≤ 0 or K ≤ 0 (you cannot take the log of a negative rate).
 *
 * Bachelier (normal): F follows dF = σN·dW. Vol σN is quoted in basis points
 * per year (e.g. 100bp = 0.01). Works for negative rates; today's market standard.
 *   Call = DF·[(F − K)·N(d) + σN√T·n(d)],  d = (F − K)/(σN√T)
 *
 * DF is whatever converts the payoff into today's money: a discount factor
 * times accrual for a caplet, the swap annuity for a swaption.
 */
import { normCdf, normPdf } from './math/normal';
import { bisect } from './math/solve';
import type { OptionType } from './blackScholes';

export type VolModel = 'black' | 'normal';

export function black76(type: OptionType, F: number, K: number, T: number, sigma: number, df = 1): number {
  if (F <= 0 || K <= 0) return NaN; // lognormal model undefined
  if (T <= 0 || sigma <= 0) return df * (type === 'call' ? Math.max(F - K, 0) : Math.max(K - F, 0));
  const sd = sigma * Math.sqrt(T);
  const d1 = (Math.log(F / K) + 0.5 * sd * sd) / sd;
  const d2 = d1 - sd;
  return type === 'call'
    ? df * (F * normCdf(d1) - K * normCdf(d2))
    : df * (K * normCdf(-d2) - F * normCdf(-d1));
}

export function bachelier(type: OptionType, F: number, K: number, T: number, sigmaN: number, df = 1): number {
  if (T <= 0 || sigmaN <= 0) return df * (type === 'call' ? Math.max(F - K, 0) : Math.max(K - F, 0));
  const sd = sigmaN * Math.sqrt(T);
  const d = (F - K) / sd;
  return type === 'call'
    ? df * ((F - K) * normCdf(d) + sd * normPdf(d))
    : df * ((K - F) * normCdf(-d) + sd * normPdf(d));
}

/** Convenience: price with either model. */
export function forwardOption(model: VolModel, type: OptionType, F: number, K: number, T: number, vol: number, df = 1) {
  return model === 'black' ? black76(type, F, K, T, vol, df) : bachelier(type, F, K, T, vol, df);
}

/** Implied Black vol: the σ that makes Black-76 match a given price. */
export function impliedBlackVol(type: OptionType, price: number, F: number, K: number, T: number, df = 1): number {
  return bisect((s) => black76(type, F, K, T, s, df) - price, 1e-6, 5, 1e-12);
}

/** Implied normal vol (decimal, so 0.01 = 100bp). */
export function impliedNormalVol(type: OptionType, price: number, F: number, K: number, T: number, df = 1): number {
  return bisect((s) => bachelier(type, F, K, T, s, df) - price, 1e-9, 0.2, 1e-14);
}
