/**
 * Yield curves.
 *
 * Everything in rates starts with the discount factor P(0,t): the value today
 * of 1 paid at time t. From P we get
 *   zero rate        z(t)     = −ln P(t) / t                  (continuous compounding)
 *   forward rate     F(t1,t2) = [P(t1)/P(t2) − 1] / (t2 − t1)  (simple compounding, like SOFR/LIBOR)
 *   instantaneous    f(t)     = −d ln P(t) / dt
 *
 * We store a curve as zero rates at "pillar" times and interpolate linearly in
 * ln P (equivalently: the instantaneous forward is flat between pillars). It is
 * the simplest scheme that keeps forwards well-behaved.
 */
import { bisect } from './math/solve';

export class Curve {
  readonly times: number[];
  readonly zeros: number[];

  constructor(times: number[], zeros: number[]) {
    this.times = times;
    this.zeros = zeros;
  }

  /** ln P at pillar i. */
  private logDf(i: number) {
    return -this.zeros[i] * this.times[i];
  }

  df(t: number): number {
    if (t <= 0) return 1;
    const ts = this.times;
    const n = ts.length;
    if (t <= ts[0]) return Math.exp(-this.zeros[0] * t); // flat zero before the first pillar
    if (t >= ts[n - 1]) {
      // Extrapolate with the last segment's flat forward.
      const fLast = n > 1 ? (this.logDf(n - 2) - this.logDf(n - 1)) / (ts[n - 1] - ts[n - 2]) : this.zeros[0];
      return Math.exp(this.logDf(n - 1) - fLast * (t - ts[n - 1]));
    }
    let i = 1;
    while (ts[i] < t) i++;
    const w = (t - ts[i - 1]) / (ts[i] - ts[i - 1]);
    return Math.exp((1 - w) * this.logDf(i - 1) + w * this.logDf(i));
  }

  zero(t: number): number {
    if (t <= 1e-8) return this.zeros[0];
    return -Math.log(this.df(t)) / t;
  }

  /** Simple-compounded forward rate for the period [t1, t2]. */
  fwd(t1: number, t2: number): number {
    return (this.df(t1) / this.df(t2) - 1) / (t2 - t1);
  }

  /** Instantaneous forward rate f(0,t). */
  instFwd(t: number, h = 1e-4): number {
    const lo = Math.max(t - h, 0);
    return (Math.log(this.df(lo)) - Math.log(this.df(t + h))) / (t + h - lo);
  }

  /** A new curve with the zero rate at each pillar moved by shift(t) (decimal). */
  shifted(shift: (t: number) => number): Curve {
    return new Curve(this.times.slice(), this.zeros.map((z, i) => z + shift(this.times[i])));
  }
}

export function flatCurve(rate: number): Curve {
  return new Curve([1, 50], [rate, rate]);
}

/** Payment times start + 1/freq, start + 2/freq, ..., end. */
export function schedule(start: number, end: number, freq: number): number[] {
  const n = Math.round((end - start) * freq);
  return Array.from({ length: n }, (_, i) => start + (i + 1) / freq);
}

/** Annuity (PV of receiving 1 per year on the fixed leg) from start to end. */
export function annuity(curve: Curve, start: number, end: number, freq: number): number {
  return schedule(start, end, freq).reduce((sum, t) => sum + curve.df(t) / freq, 0);
}

/**
 * Par swap rate: the fixed rate that makes a swap worth zero.
 * Floating leg (single-curve) = P(start) − P(end); fixed leg = K · annuity.
 */
export function parSwapRate(curve: Curve, start: number, end: number, freq: number): number {
  return (curve.df(start) - curve.df(end)) / annuity(curve, start, end, freq);
}

export interface Instrument {
  kind: 'deposit' | 'swap';
  /** Maturity in years. */
  tenor: number;
  /** Quoted rate, decimal. Deposits are simple rates; swaps are par rates. */
  rate: number;
  label: string;
}

/**
 * Bootstrapping: build the curve one instrument at a time, shortest first.
 * For each new instrument we add a pillar at its maturity and solve for the
 * single zero rate that makes it price back to its market quote — earlier
 * pillars are already fixed, so each step is a 1-dimensional root search.
 */
export function bootstrap(instruments: Instrument[], swapFreq = 1): Curve {
  const sorted = instruments.slice().sort((a, b) => a.tenor - b.tenor);
  const times: number[] = [];
  const zeros: number[] = [];
  for (const inst of sorted) {
    if (inst.kind === 'deposit') {
      // 1 / (1 + r·T) = e^(−z·T)  →  closed form, no solver needed.
      times.push(inst.tenor);
      zeros.push(Math.log(1 + inst.rate * inst.tenor) / inst.tenor);
    } else {
      const error = (z: number) =>
        parSwapRate(new Curve([...times, inst.tenor], [...zeros, z]), 0, inst.tenor, swapFreq) - inst.rate;
      zeros.push(bisect(error, -0.2, 0.5, 1e-15));
      times.push(inst.tenor);
    }
  }
  return new Curve(times, zeros);
}

/** The rate an instrument would be quoted at on a given curve — used to check the bootstrap. */
export function instrumentRate(curve: Curve, inst: Instrument, swapFreq = 1): number {
  return inst.kind === 'deposit'
    ? (1 / curve.df(inst.tenor) - 1) / inst.tenor
    : parSwapRate(curve, 0, inst.tenor, swapFreq);
}
