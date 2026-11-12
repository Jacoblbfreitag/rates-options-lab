/**
 * Black–Scholes (1973): the price of a European option on a stock.
 *
 *   C = S·e^(−qT)·N(d1) − K·e^(−rT)·N(d2)
 *   P = K·e^(−rT)·N(−d2) − S·e^(−qT)·N(−d1)
 *   d1 = [ln(S/K) + (r − q + σ²/2)·T] / (σ√T),   d2 = d1 − σ√T
 *
 * S spot, K strike, T years to expiry, r risk-free rate, q dividend yield,
 * σ volatility (all rates continuously compounded, as decimals: 5% = 0.05).
 */
import { normCdf, normPdf } from './math/normal';

export type OptionType = 'call' | 'put';

export interface BSInputs {
  S: number;
  K: number;
  T: number;
  r: number;
  sigma: number;
  q?: number;
}

/** What the option pays at expiry if the stock ends at S. */
export function payoff(type: OptionType, S: number, K: number): number {
  return type === 'call' ? Math.max(S - K, 0) : Math.max(K - S, 0);
}

function d1d2({ S, K, T, r, sigma, q = 0 }: BSInputs) {
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  return { d1, d2: d1 - sigma * sqrtT, sqrtT };
}

export function bsPrice(type: OptionType, inp: BSInputs): number {
  const { S, K, T, r, sigma, q = 0 } = inp;
  if (T <= 0 || sigma <= 0) {
    // No time or no uncertainty left: worth the discounted intrinsic value of the forward.
    const t = Math.max(T, 0);
    return Math.exp(-r * t) * payoff(type, S * Math.exp((r - q) * t), K);
  }
  const { d1, d2 } = d1d2(inp);
  const dfR = Math.exp(-r * T);
  const dfQ = Math.exp(-q * T);
  return type === 'call'
    ? S * dfQ * normCdf(d1) - K * dfR * normCdf(d2)
    : K * dfR * normCdf(-d2) - S * dfQ * normCdf(-d1);
}

export interface Greeks {
  /** ∂V/∂S: how many shares hedge one option. */
  delta: number;
  /** ∂²V/∂S²: how fast delta changes. Long options = long gamma. */
  gamma: number;
  /** ∂V/∂σ per 1.00 of vol (divide by 100 for "per vol point"). */
  vega: number;
  /** ∂V/∂t per year (time passing; usually negative for long options). */
  theta: number;
  /** ∂V/∂r per 1.00 of rate (divide by 100 for "per 1%"). */
  rho: number;
}

export function bsGreeks(type: OptionType, inp: BSInputs): Greeks {
  const { S, K, T, r, q = 0 } = inp;
  const sigma = inp.sigma;
  const { d1, d2, sqrtT } = d1d2(inp);
  const dfR = Math.exp(-r * T);
  const dfQ = Math.exp(-q * T);
  const pdf = normPdf(d1);
  const gamma = (dfQ * pdf) / (S * sigma * sqrtT);
  const vega = S * dfQ * pdf * sqrtT;
  const decay = (-S * dfQ * pdf * sigma) / (2 * sqrtT);
  if (type === 'call') {
    return {
      delta: dfQ * normCdf(d1),
      gamma,
      vega,
      theta: decay - r * K * dfR * normCdf(d2) + q * S * dfQ * normCdf(d1),
      rho: K * T * dfR * normCdf(d2),
    };
  }
  return {
    delta: -dfQ * normCdf(-d1),
    gamma,
    vega,
    theta: decay + r * K * dfR * normCdf(-d2) - q * S * dfQ * normCdf(-d1),
    rho: -K * T * dfR * normCdf(-d2),
  };
}
