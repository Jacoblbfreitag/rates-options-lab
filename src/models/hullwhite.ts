/**
 * Hull–White (1990): Vasicek that fits today's curve.
 *
 *   dr = [θ(t) − a·r]·dt + σ·dW
 *
 * The long-run level becomes a function of time θ(t), chosen so the model
 * reproduces today's discount curve P(0,T) EXACTLY. a (mean reversion) and σ
 * (vol) are then calibrated to option prices (caps/swaptions).
 *
 * Useful facts:
 *  - r(t) = x(t) + φ(t), where x is a mean-zero OU process and
 *    φ(t) = f(0,t) + σ²/(2a²)·(1 − e^(−at))²
 *  - bonds in closed form: P(t,T) = A(t,T)·e^(−B(t,T)·r(t))
 *  - European swaptions in closed form via Jamshidian's trick
 *  - Bermudan swaptions via a recombining TRINOMIAL TREE (the reason the model
 *    is so popular on desks)
 */
import type { Curve } from './curve';
import { bisect } from './math/solve';
import { makeGaussian } from './math/rng';
import { bondOptionVol, vasicekB, zcbOption } from './vasicek';

export interface HWParams {
  a: number;
  sigma: number;
}

/** Zero-coupon bond price P(t,T) given the short rate r at time t. */
export function hwBond(curve: Curve, p: HWParams, t: number, T: number, r: number): number {
  const B = vasicekB(p.a, T - t);
  const lnA =
    Math.log(curve.df(T) / curve.df(t)) +
    B * curve.instFwd(t) -
    ((p.sigma * p.sigma) / (4 * p.a)) * (1 - Math.exp(-2 * p.a * t)) * B * B;
  return Math.exp(lnA - B * r);
}

/** φ(t): the deterministic shift that makes the model fit the curve. E[r(t)] ≈ φ(t). */
export function hwPhi(curve: Curve, p: HWParams, t: number): number {
  const e = 1 - Math.exp(-p.a * t);
  return curve.instFwd(t) + ((p.sigma * p.sigma) / (2 * p.a * p.a)) * e * e;
}

/** Option (expiry T) on a zero-coupon bond maturing at S. */
export function hwZcbOption(curve: Curve, p: HWParams, type: 'call' | 'put', T: number, S: number, K: number): number {
  return zcbOption(type, curve.df(T), curve.df(S), K, bondOptionVol(p.a, p.sigma, T, S));
}

/**
 * European swaption by Jamshidian's decomposition.
 * A payer swaption = a put on a coupon bond (coupons K/freq, principal 1) struck at 1.
 * In a one-factor model every bond price falls as r rises, so we can find the
 * single r* where the coupon bond is worth exactly 1, and split the option into
 * a sum of zero-coupon bond options struck at P(T_e, T_j; r*).
 */
export function hwSwaption(
  curve: Curve,
  p: HWParams,
  expiry: number,
  tenor: number,
  strike: number,
  type: 'payer' | 'receiver',
  freq = 1,
): number {
  const n = Math.round(tenor * freq);
  const pays = Array.from({ length: n }, (_, j) => expiry + (j + 1) / freq);
  const coupons = pays.map((_, j) => strike / freq + (j === n - 1 ? 1 : 0));
  const bondAt = (r: number) => pays.reduce((s, T, j) => s + coupons[j] * hwBond(curve, p, expiry, T, r), 0);
  const rStar = bisect((r) => bondAt(r) - 1, -1, 1, 1e-14);
  const optType = type === 'payer' ? 'put' : 'call';
  return pays.reduce((s, T, j) => {
    const X = hwBond(curve, p, expiry, T, rStar);
    return s + coupons[j] * hwZcbOption(curve, p, optType, expiry, T, X);
  }, 0);
}

/** Calibrate σ (for fixed a) so the model's European swaption matches a target price. */
export function calibrateHwSigma(
  curve: Curve,
  a: number,
  expiry: number,
  tenor: number,
  strike: number,
  targetPrice: number,
  type: 'payer' | 'receiver' = 'payer',
  freq = 1,
): number {
  return bisect((s) => hwSwaption(curve, { a, sigma: s }, expiry, tenor, strike, type, freq) - targetPrice, 1e-5, 0.1, 1e-14);
}

/** Simulated short-rate paths r(t) = x(t) + φ(t). */
export function simulateHw(curve: Curve, p: HWParams, T: number, steps: number, nPaths: number, seed = 1) {
  const dt = T / steps;
  const decay = Math.exp(-p.a * dt);
  const sd = p.sigma * Math.sqrt((1 - Math.exp(-2 * p.a * dt)) / (2 * p.a));
  const z = makeGaussian(seed);
  const times = Array.from({ length: steps + 1 }, (_, i) => i * dt);
  const phi = times.map((t) => hwPhi(curve, p, t));
  const paths = Array.from({ length: nPaths }, () => {
    let x = 0;
    const path = [phi[0]];
    for (let i = 1; i <= steps; i++) {
      x = x * decay + sd * z();
      path.push(x + phi[i]);
    }
    return path;
  });
  return { times, paths, phi };
}

// ───────────────────────────── Trinomial tree ─────────────────────────────

export interface TrinomialTree {
  dt: number;
  dR: number;
  jMax: number;
  nSteps: number;
  /** α_m: the shift at step m chosen so the tree reprices P(0, (m+1)·dt). */
  alphas: number[];
  /** Branching probabilities [pUp, pMid, pDown] for each node index j (offset by jMax). */
  probs: [number, number, number][];
  /** Arrow–Debreu prices Q[m][j + width(m)]: value today of 1 paid at node (m, j). */
  Q: number[][];
}

/** Number of nodes above the centre at step m. */
export function treeWidth(tree: Pick<TrinomialTree, 'jMax'>, m: number) {
  return Math.min(m, tree.jMax);
}

/** The node(s) node j branches to: [up, mid, down] target indices. */
export function treeBranch(j: number, jMax: number): [number, number, number] {
  if (j === jMax) return [j, j - 1, j - 2];
  if (j === -jMax) return [j + 2, j + 1, j];
  return [j + 1, j, j - 1];
}

/**
 * Hull–White trinomial tree (Hull & White 1994, Hull "Options, Futures..." ch. 32).
 * Stage 1: build a symmetric tree for x (dx = −a·x dt + σ dW) with spacing
 *          ΔR = σ√(3Δt). At |j| = jMax the branching bends inward so the tree
 *          stays finite — that is mean reversion at work.
 * Stage 2: shift each time slice by α_m so the tree prices every zero-coupon
 *          bond on today's curve, using forward induction of Arrow–Debreu prices.
 * The node rate r(m,j) = α_m + j·ΔR is the Δt-period continuously compounded rate.
 */
export function buildTree(curve: Curve, p: HWParams, dt: number, nSteps: number): TrinomialTree {
  const M = -p.a * dt;
  const dR = p.sigma * Math.sqrt(3 * dt);
  const jMax = Math.max(1, Math.ceil(0.184 / (p.a * dt)));
  const probs: [number, number, number][] = [];
  for (let j = -jMax; j <= jMax; j++) {
    const jm = j * M;
    if (j === jMax) {
      probs.push([7 / 6 + (jm * jm + 3 * jm) / 2, -1 / 3 - jm * jm - 2 * jm, 1 / 6 + (jm * jm + jm) / 2]);
    } else if (j === -jMax) {
      probs.push([1 / 6 + (jm * jm - jm) / 2, -1 / 3 - jm * jm + 2 * jm, 7 / 6 + (jm * jm - 3 * jm) / 2]);
    } else {
      probs.push([1 / 6 + (jm * jm + jm) / 2, 2 / 3 - jm * jm, 1 / 6 + (jm * jm - jm) / 2]);
    }
  }

  const tree: TrinomialTree = { dt, dR, jMax, nSteps, alphas: [], probs, Q: [[1]] };
  for (let m = 0; m < nSteps; m++) {
    const w = treeWidth(tree, m);
    const q = tree.Q[m];
    // α_m: Σ_j Q(m,j)·e^(−(α_m + jΔR)Δt) = P(0, (m+1)Δt)
    let sum = 0;
    for (let j = -w; j <= w; j++) sum += q[j + w] * Math.exp(-j * dR * dt);
    const alpha = Math.log(sum / curve.df((m + 1) * dt)) / dt;
    tree.alphas.push(alpha);
    // Forward induction: push Q one step ahead.
    const w1 = treeWidth(tree, m + 1);
    const next = new Array(2 * w1 + 1).fill(0);
    for (let j = -w; j <= w; j++) {
      const disc = q[j + w] * Math.exp(-(alpha + j * dR) * dt);
      const targets = treeBranch(j, jMax);
      const pr = probs[j + jMax];
      for (let k = 0; k < 3; k++) next[targets[k] + w1] += pr[k] * disc;
    }
    tree.Q.push(next);
  }
  return tree;
}

/** Node short rate at step m, level j. */
export function treeRate(tree: TrinomialTree, m: number, j: number) {
  return tree.alphas[m] + j * tree.dR;
}

/** One step of backward induction: values at step m+1 → values at step m. */
function rollBack(tree: TrinomialTree, m: number, next: number[]): number[] {
  const w = treeWidth(tree, m);
  const w1 = treeWidth(tree, m + 1);
  const out = new Array(2 * w + 1);
  for (let j = -w; j <= w; j++) {
    const targets = treeBranch(j, tree.jMax);
    const pr = tree.probs[j + tree.jMax];
    let ev = 0;
    for (let k = 0; k < 3; k++) ev += pr[k] * next[targets[k] + w1];
    out[j + w] = Math.exp(-treeRate(tree, m, j) * tree.dt) * ev;
  }
  return out;
}

/**
 * European or Bermudan swaption on the tree.
 * Exercise dates: the swap start (expiry) and, for a Bermudan, every later
 * fixed-coupon date except the last. Exercising at T_i enters the remaining swap.
 *
 * At each node we track two values by backward induction:
 *   B = value of the remaining fixed coupons + principal (a coupon bond)
 *   U = value of the option
 * Single-curve: the floating leg is worth 1 at each reset, so the payer swap
 * is worth 1 − B, and the receiver swap B − 1.
 */
export function treeSwaption(
  curve: Curve,
  p: HWParams,
  expiry: number,
  tenor: number,
  strike: number,
  type: 'payer' | 'receiver',
  style: 'european' | 'bermudan',
  freq = 1,
  stepsPerYear = 24,
): number {
  const dt = 1 / stepsPerYear;
  const nSteps = Math.round((expiry + tenor) * stepsPerYear);
  const tree = buildTree(curve, p, dt, nSteps);
  const n = Math.round(tenor * freq);
  const coupon = strike / freq;
  const stepOf = (t: number) => Math.round(t * stepsPerYear);
  const couponSteps = new Set(Array.from({ length: n - 1 }, (_, j) => stepOf(expiry + (j + 1) / freq)));
  const exerciseSteps = new Set(
    style === 'european' ? [stepOf(expiry)] : Array.from({ length: n }, (_, i) => stepOf(expiry + i / freq)),
  );

  const wN = treeWidth(tree, nSteps);
  let B = new Array(2 * wN + 1).fill(1 + coupon);
  let U = new Array(2 * wN + 1).fill(0);
  for (let m = nSteps - 1; m >= 0; m--) {
    B = rollBack(tree, m, B);
    U = rollBack(tree, m, U);
    if (exerciseSteps.has(m)) {
      U = U.map((u, i) => Math.max(u, type === 'payer' ? 1 - B[i] : B[i] - 1));
    }
    if (couponSteps.has(m)) B = B.map((b) => b + coupon);
  }
  return U[0];
}

/** Zero-coupon bond price from the tree (should equal P(0,T) by construction). */
export function treeZcb(curve: Curve, p: HWParams, T: number, stepsPerYear = 24): number {
  const nSteps = Math.round(T * stepsPerYear);
  const tree = buildTree(curve, p, 1 / stepsPerYear, nSteps);
  let V = new Array(2 * treeWidth(tree, nSteps) + 1).fill(1);
  for (let m = nSteps - 1; m >= 0; m--) V = rollBack(tree, m, V);
  return V[0];
}

/** European option on a zero-coupon bond priced on the tree (to compare with the formula). */
export function treeZcbOption(
  curve: Curve,
  p: HWParams,
  type: 'call' | 'put',
  T: number,
  S: number,
  K: number,
  stepsPerYear = 24,
): number {
  const nS = Math.round(S * stepsPerYear);
  const nT = Math.round(T * stepsPerYear);
  const tree = buildTree(curve, p, 1 / stepsPerYear, nS);
  let bond = new Array(2 * treeWidth(tree, nS) + 1).fill(1);
  let opt: number[] = [];
  for (let m = nS - 1; m >= 0; m--) {
    bond = rollBack(tree, m, bond);
    if (m < nT) opt = rollBack(tree, m, opt);
    if (m === nT) opt = bond.map((b) => (type === 'call' ? Math.max(b - K, 0) : Math.max(K - b, 0)));
  }
  return opt[0];
}
