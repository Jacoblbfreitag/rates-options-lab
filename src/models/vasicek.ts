/**
 * Vasicek (1977): the first short-rate model.
 *
 *   dr = a·(b − r)·dt + σ·dW
 *
 * The short rate r is pulled back towards a long-run level b at speed a
 * ("mean reversion"), with normally distributed shocks of size σ. Rates can
 * go negative — a feature now, a bug in 1977.
 *
 * Because r is Gaussian, bond prices have a closed form:
 *   P(0,T) = A(T)·e^(−B(T)·r0),   B(T) = (1 − e^(−aT))/a
 *   ln A(T) = (B − T)(a²b − σ²/2)/a² − σ²B²/(4a)
 *
 * Weakness: with only three constants it can't match today's yield curve.
 * Hull–White fixes exactly that.
 */
import { normCdf } from './math/normal';
import { makeGaussian } from './math/rng';

export interface VasicekParams {
  a: number;
  b: number;
  sigma: number;
  r0: number;
}

export function vasicekB(a: number, tau: number): number {
  return a < 1e-10 ? tau : (1 - Math.exp(-a * tau)) / a;
}

export function vasicekBond(p: VasicekParams, T: number): number {
  const { a, b, sigma, r0 } = p;
  const B = vasicekB(a, T);
  const lnA = ((B - T) * (a * a * b - 0.5 * sigma * sigma)) / (a * a) - (sigma * sigma * B * B) / (4 * a);
  return Math.exp(lnA - B * r0);
}

export function vasicekZero(p: VasicekParams, T: number): number {
  return -Math.log(vasicekBond(p, T)) / T;
}

/**
 * Volatility of ln P(T,S) seen from today — shared by Vasicek and Hull–White.
 * σp = (σ/a)·(1 − e^(−a(S−T)))·√[(1 − e^(−2aT))/(2a)]
 */
export function bondOptionVol(a: number, sigma: number, T: number, S: number): number {
  return sigma * vasicekB(a, S - T) * Math.sqrt((1 - Math.exp(-2 * a * T)) / (2 * a));
}

/**
 * European option (expiry T) on a zero-coupon bond maturing at S, strike K.
 * Black-like formula with bond-price discount factors P(0,T), P(0,S).
 */
export function zcbOption(type: 'call' | 'put', PT: number, PS: number, K: number, sigmaP: number): number {
  const h = Math.log(PS / (K * PT)) / sigmaP + sigmaP / 2;
  return type === 'call'
    ? PS * normCdf(h) - K * PT * normCdf(h - sigmaP)
    : K * PT * normCdf(-h + sigmaP) - PS * normCdf(-h);
}

export function vasicekBondOption(type: 'call' | 'put', p: VasicekParams, T: number, S: number, K: number): number {
  return zcbOption(type, vasicekBond(p, T), vasicekBond(p, S), K, bondOptionVol(p.a, p.sigma, T, S));
}

/** Simulated short-rate paths using the exact Gaussian transition. */
export function simulateVasicek(p: VasicekParams, T: number, steps: number, nPaths: number, seed = 1) {
  const { a, b, sigma, r0 } = p;
  const dt = T / steps;
  const decay = Math.exp(-a * dt);
  const sd = sigma * Math.sqrt((1 - Math.exp(-2 * a * dt)) / (2 * a));
  const z = makeGaussian(seed);
  const times = Array.from({ length: steps + 1 }, (_, i) => i * dt);
  const paths = Array.from({ length: nPaths }, () => {
    const path = [r0];
    for (let i = 0; i < steps; i++) path.push(path[i] * decay + b * (1 - decay) + sd * z());
    return path;
  });
  return { times, paths };
}
