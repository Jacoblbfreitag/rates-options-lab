/**
 * The LIBOR Market Model (Brace–Gatarek–Musiela, Jamshidian, 1997).
 *
 * Short-rate models describe ONE number (r) and derive the whole curve. The
 * LMM instead models the market's own quantities directly: the simple forward
 * rates F_i for periods [T_i, T_i+1]. Each one is lognormal:
 *
 *   dF_i / F_i = μ_i(t) dt + σ_i(t) dW_i,      dW_i·dW_j = ρ_ij dt
 *
 * Under its own payment measure F_i has no drift → Black-76 for caplets is
 * EXACT in the LMM. That is why the model was built. The catch: to simulate
 * all forwards together we need one common measure, and then drifts appear.
 * Using the "spot LIBOR measure" (roll a deposit from reset to reset):
 *
 *   μ_i(t) = σ_i(t) · Σ_{j=q(t)}^{i}  τ·ρ_ij·σ_j(t)·F_j / (1 + τ·F_j)
 *
 * where q(t) is the first forward not yet fixed. No closed form → Monte Carlo.
 *
 * Volatility: σ_i(t) = φ(T_i − t) with Rebonato's "abcd" shape
 *   φ(x) = (a + b·x)·e^(−c·x) + d     (humped in time-to-reset x)
 * Correlation: ρ_ij = exp(−β·|T_i − T_j|).
 */
import { black76 } from './black76';
import type { Curve } from './curve';
import { cholesky } from './math/linalg';
import { makeGaussian } from './math/rng';
import { nelderMead } from './math/solve';

export interface Abcd {
  a: number;
  b: number;
  c: number;
  d: number;
}

export function abcdVol(p: Abcd, x: number): number {
  return (p.a + p.b * x) * Math.exp(-p.c * x) + p.d;
}

/** ∫₀^T σ_i(t)·σ_j(t) dt (Simpson's rule), the building block of all LMM vols. */
export function covIntegral(p: Abcd, Ti: number, Tj: number, T: number, n = 200): number {
  if (T <= 0) return 0;
  const h = T / n;
  let s = 0;
  for (let k = 0; k <= n; k++) {
    const t = k * h;
    const w = k === 0 || k === n ? 1 : k % 2 === 1 ? 4 : 2;
    s += w * abcdVol(p, Ti - t) * abcdVol(p, Tj - t);
  }
  return (s * h) / 3;
}

/** The Black vol of caplet i implied by the abcd function: √(∫₀^Ti σ_i² dt / Ti). */
export function capletVolFromAbcd(p: Abcd, Ti: number): number {
  return Math.sqrt(covIntegral(p, Ti, Ti, Ti) / Ti);
}

export function correlation(Ti: number, Tj: number, beta: number): number {
  return Math.exp(-beta * Math.abs(Ti - Tj));
}

export interface LmmSetup {
  tau: number;
  /** Reset times T_0 = 0, T_1 = τ, ..., T_{N−1}. Forward i covers [T_i, T_i + τ]. */
  T: number[];
  /** Initial forwards F_i(0) from today's curve. */
  F0: number[];
  abcd: Abcd;
  beta: number;
}

export function lmmSetup(curve: Curve, tau: number, horizon: number, abcd: Abcd, beta: number): LmmSetup {
  const N = Math.round(horizon / tau);
  const T = Array.from({ length: N }, (_, i) => i * tau);
  return { tau, T, F0: T.map((t) => curve.fwd(t, t + tau)), abcd, beta };
}

/** P(0, T_k) implied by the initial forwards (consistent with the curve). */
export function lmmDf(s: LmmSetup, k: number): number {
  let p = 1;
  for (let j = 0; j < k; j++) p /= 1 + s.tau * s.F0[j];
  return p;
}

/** Black-76 caplet price on forward i with the abcd-implied vol (what MC should reproduce). */
export function lmmCapletBlack(s: LmmSetup, i: number, K: number): number {
  return s.tau * lmmDf(s, i + 1) * black76('call', s.F0[i], K, s.T[i], capletVolFromAbcd(s.abcd, s.T[i]));
}

/** The swaption annuity and forward swap rate for expiry index e into a swap ending at T_N. */
export function lmmSwapRate(s: LmmSetup, e: number) {
  const N = s.T.length;
  let A = 0;
  for (let j = e; j < N; j++) A += s.tau * lmmDf(s, j + 1);
  return { A, S: (lmmDf(s, e) - lmmDf(s, N)) / A };
}

/**
 * Rebonato's swaption vol approximation: freeze the weights of the swap rate as
 * a basket of forwards, so its variance is a weighted sum of forward covariances:
 *   σ_swpt² · T_e · S² ≈ Σ_ij w_i·w_j·F_i·F_j·ρ_ij·∫₀^Te σ_i σ_j dt,  w_i = τ·P(0,T_i+1)/A
 */
export function rebonatoSwaptionVol(s: LmmSetup, e: number): number {
  const N = s.T.length;
  const { A, S } = lmmSwapRate(s, e);
  const Te = s.T[e];
  let v = 0;
  for (let i = e; i < N; i++) {
    for (let j = e; j < N; j++) {
      const wi = (s.tau * lmmDf(s, i + 1)) / A;
      const wj = (s.tau * lmmDf(s, j + 1)) / A;
      v += wi * wj * s.F0[i] * s.F0[j] * correlation(s.T[i], s.T[j], s.beta) * covIntegral(s.abcd, s.T[i], s.T[j], Te, 100);
    }
  }
  return Math.sqrt(v / (Te * S * S));
}

export interface LmmResult {
  /** Caplet i (i = 1..N−1): MC price, its standard error, and the Black-76 price. */
  caplets: { i: number; reset: number; strike: number; mc: number; se: number; black: number }[];
  swaption: { expiryIndex: number; strike: number; mc: number; se: number; rebonato: number; rebonatoVol: number };
  /** A few full paths for plotting: samplePaths[p][k][i] = F_i at time grid point k (frozen once fixed). */
  samplePaths: number[][][];
  times: number[];
}

/**
 * Monte Carlo simulation of the LMM under the spot measure with log-Euler steps.
 * Caplets are struck at their own ATM forward (or `strike` if given); the
 * swaption is a European payer at expiry T_e into the swap ending at T_N.
 */
export function simulateLmm(
  s: LmmSetup,
  opts: { nPaths: number; stepsPerPeriod: number; seed: number; expiryIndex: number; strike?: number; nSample?: number },
): LmmResult {
  const { tau, T, F0 } = s;
  const N = T.length;
  const { nPaths, stepsPerPeriod, seed, expiryIndex: e, nSample = 8 } = opts;
  const dt = tau / stepsPerPeriod;
  const sqrtDt = Math.sqrt(dt);
  const corr = T.map((ti) => T.map((tj) => correlation(ti, tj, s.beta)));
  const L = cholesky(corr);
  const z = makeGaussian(seed);
  const capK = F0.map((f) => opts.strike ?? f);
  const swK = opts.strike ?? lmmSwapRate(s, e).S;

  const capSum = new Array(N).fill(0);
  const capSq = new Array(N).fill(0);
  let swSum = 0;
  let swSq = 0;
  const samplePaths: number[][][] = [];
  const times: number[] = [0];
  for (let k = 1; k <= (N - 1) * stepsPerPeriod; k++) times.push(k * dt);

  const F = new Array(N);
  const indep = new Array(N);
  const dW = new Array(N);
  const sig = new Array(N);
  const drift = new Array(N);
  for (let path = 0; path < nPaths; path++) {
    for (let i = 0; i < N; i++) F[i] = F0[i];
    let numeraire = 1 + tau * F[0]; // B(T_1): F_0 is fixed today
    const record = path < nSample ? [F.slice()] : null;
    const pathCaplets = new Array(N).fill(0);
    let pathSwaption = 0;

    for (let q = 1; q < N; q++) {
      // Evolve the alive forwards q..N−1 from T_{q−1} to T_q.
      for (let step = 0; step < stepsPerPeriod; step++) {
        const tMid = T[q - 1] + (step + 0.5) * dt;
        for (let i = 0; i < N; i++) indep[i] = z();
        for (let i = q; i < N; i++) {
          let w = 0;
          for (let k = 0; k <= i; k++) w += L[i][k] * indep[k];
          dW[i] = w * sqrtDt;
          sig[i] = abcdVol(s.abcd, T[i] - tMid);
        }
        // Drift μ_i = σ_i Σ_{j=q}^{i} τ ρ_ij σ_j F_j/(1+τF_j), using forwards at the start of the step (Euler).
        for (let i = q; i < N; i++) {
          let sum = 0;
          for (let j = q; j <= i; j++) sum += (tau * corr[i][j] * sig[j] * F[j]) / (1 + tau * F[j]);
          drift[i] = sig[i] * sum;
        }
        // Log-Euler step keeps every forward positive.
        for (let i = q; i < N; i++) F[i] *= Math.exp((drift[i] - 0.5 * sig[i] * sig[i]) * dt + sig[i] * dW[i]);
        if (record) record.push(F.slice());
      }
      // F_q is now fixed at T_q. Caplet q pays τ(F_q − K)+ at T_{q+1}, discounted by the numeraire B(T_{q+1}).
      if (q === e) {
        // Swaption: value of the payer swap at T_e using the forwards on that date.
        let disc = 1;
        let swapVal = 0;
        for (let j = e; j < N; j++) {
          disc /= 1 + tau * F[j];
          swapVal += tau * (F[j] - swK) * disc;
        }
        pathSwaption = Math.max(swapVal, 0) / numeraire;
      }
      const nextNumeraire = numeraire * (1 + tau * F[q]);
      pathCaplets[q] = (tau * Math.max(F[q] - capK[q], 0)) / nextNumeraire;
      numeraire = nextNumeraire;
    }
    for (let i = 1; i < N; i++) {
      capSum[i] += pathCaplets[i];
      capSq[i] += pathCaplets[i] ** 2;
    }
    swSum += pathSwaption;
    swSq += pathSwaption ** 2;
    if (record) samplePaths.push(record);
  }

  const stats = (sum: number, sq: number) => {
    const mean = sum / nPaths;
    return { mean, se: Math.sqrt(Math.max(sq / nPaths - mean * mean, 0) / nPaths) };
  };
  const caplets = [];
  for (let i = 1; i < N; i++) {
    const st = stats(capSum[i], capSq[i]);
    caplets.push({ i, reset: T[i], strike: capK[i], mc: st.mean, se: st.se, black: lmmCapletBlack(s, i, capK[i]) });
  }
  const sw = stats(swSum, swSq);
  const { A, S } = lmmSwapRate(s, e);
  const rebonatoVol = rebonatoSwaptionVol(s, e);
  return {
    caplets,
    swaption: { expiryIndex: e, strike: swK, mc: sw.mean, se: sw.se, rebonato: black76('call', S, swK, T[e], rebonatoVol, A), rebonatoVol },
    samplePaths,
    times,
  };
}

/**
 * Calibrate abcd to market caplet Black vols by least squares.
 * c and d are kept positive by writing them as exponentials; a + d > 0 is
 * enforced with a penalty (the instantaneous vol at reset must be positive).
 */
export function calibrateAbcd(targets: { expiry: number; vol: number }[], init: Abcd): { params: Abcd; rmse: number } {
  const toParams = (x: number[]): Abcd => ({ a: x[0], b: x[1], c: Math.exp(x[2]), d: Math.exp(x[3]) });
  const objective = (x: number[]) => {
    const p = toParams(x);
    let sse = p.a + p.d <= 0 ? 1 : 0;
    for (const t of targets) sse += (capletVolFromAbcd(p, t.expiry) - t.vol) ** 2;
    return sse;
  };
  const res = nelderMead(objective, [init.a, init.b, Math.log(init.c), Math.log(init.d)], { step: 0.2, maxIter: 4000, tol: 1e-16 });
  return { params: toParams(res.x), rmse: Math.sqrt(res.fx / targets.length) };
}
