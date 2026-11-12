/**
 * SABR (Hagan, Kumar, Lesniewski & Woodward, 2002): the market's smile model.
 *
 * Black-76 assumes one vol for all strikes, but the market shows a SMILE/SKEW.
 * SABR lets the volatility itself be random:
 *
 *   dF = α · F^β · dW₁          (forward, with "backbone" exponent β)
 *   dα = ν · α · dW₂             (vol of vol ν)
 *   dW₁·dW₂ = ρ dt               (correlation ρ → skew)
 *
 * Roles of the parameters:
 *   α — overall vol LEVEL           β — backbone (usually fixed: 0, 0.5 or 1)
 *   ρ — SKEW (ρ < 0: low strikes have higher vol)   ν — CURVATURE ("smile")
 *
 * Hagan's famous approximation turns these into a Black implied vol for each
 * strike, so you still price with Black-76 — just with σ(K).
 *
 * "Shifted SABR" adds a constant shift s to F and K so rates can go negative
 * (down to −s).
 */
import { nelderMead, bisect } from './math/solve';

export interface SabrParams {
  alpha: number;
  beta: number;
  rho: number;
  nu: number;
  /** Shift for negative rates (decimal). 0 = classic SABR. */
  shift?: number;
}

/** Hagan's lognormal (Black) implied vol σ_B(K) for the given SABR parameters. */
export function sabrVol(F0: number, K0: number, T: number, p: SabrParams): number {
  const s = p.shift ?? 0;
  const F = F0 + s;
  const K = K0 + s;
  const { alpha, beta, rho, nu } = p;
  if (F <= 0 || K <= 0) return NaN;
  const omb = 1 - beta;
  const correction =
    1 +
    ((omb * omb * alpha * alpha) / (24 * Math.pow(F * K, omb)) +
      (rho * beta * nu * alpha) / (4 * Math.pow(F * K, omb / 2)) +
      ((2 - 3 * rho * rho) * nu * nu) / 24) *
      T;

  if (Math.abs(F - K) < 1e-12 * F) {
    // At the money the general formula is 0/0; use its limit.
    return (alpha / Math.pow(F, omb)) * correction;
  }
  const logFK = Math.log(F / K);
  const fkPow = Math.pow(F * K, omb / 2);
  const z = (nu / alpha) * fkPow * logFK;
  const xz = Math.log((Math.sqrt(1 - 2 * rho * z + z * z) + z - rho) / (1 - rho));
  const zOverX = Math.abs(z) < 1e-10 ? 1 : z / xz;
  const denom = fkPow * (1 + (omb * omb * logFK * logFK) / 24 + (Math.pow(omb, 4) * Math.pow(logFK, 4)) / 1920);
  return (alpha / denom) * zOverX * correction;
}

/** Find α that reproduces a given ATM Black vol, for fixed β, ρ, ν. */
export function alphaFromAtmVol(F: number, T: number, atmVol: number, p: Omit<SabrParams, 'alpha'>): number {
  return bisect((a) => sabrVol(F, F, T, { ...p, alpha: a }) - atmVol, 1e-6, 5, 1e-14);
}

/**
 * Calibrate α, ρ, ν to market vols (β and shift held fixed) by least squares.
 * Parameters are transformed so the optimiser can't wander into invalid values:
 * α = e^x₀ > 0, ρ = tanh(x₁) ∈ (−1, 1), ν = e^x₂ > 0.
 */
export function calibrateSabr(
  F: number,
  T: number,
  quotes: { strike: number; vol: number }[],
  beta: number,
  shift = 0,
): { params: SabrParams; rmse: number } {
  const atm = quotes.reduce((best, q) => (Math.abs(q.strike - F) < Math.abs(best.strike - F) ? q : best));
  const alpha0 = atm.vol * Math.pow(F + shift, 1 - beta);
  const toParams = (x: number[]): SabrParams => ({
    alpha: Math.exp(x[0]),
    beta,
    rho: Math.tanh(x[1]),
    nu: Math.exp(x[2]),
    shift,
  });
  const objective = (x: number[]) => {
    const p = toParams(x);
    let sse = 0;
    for (const q of quotes) {
      const v = sabrVol(F, q.strike, T, p);
      sse += Number.isFinite(v) ? (v - q.vol) ** 2 : 1;
    }
    return sse;
  };
  const res = nelderMead(objective, [Math.log(alpha0), -0.3, Math.log(0.4)], { step: 0.2, maxIter: 5000, tol: 1e-16 });
  return { params: toParams(res.x), rmse: Math.sqrt(res.fx / quotes.length) };
}
