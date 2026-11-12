/**
 * Numerical solvers.
 *
 * Finance is full of "find the input that reproduces a market price" problems:
 * implied volatility, curve bootstrapping, model calibration. These two tools
 * cover all of them in this app.
 */

/**
 * Bisection: find x in [lo, hi] with f(x) = 0, given f(lo) and f(hi) have
 * opposite signs. Slow but bullet-proof: each step halves the interval.
 */
export function bisect(f: (x: number) => number, lo: number, hi: number, tol = 1e-12, maxIter = 200): number {
  let fLo = f(lo);
  const fHi = f(hi);
  if (fLo === 0) return lo;
  if (fHi === 0) return hi;
  if (fLo * fHi > 0) return NaN; // no root bracketed
  for (let i = 0; i < maxIter; i++) {
    const mid = 0.5 * (lo + hi);
    const fMid = f(mid);
    if (fMid === 0 || hi - lo < tol) return mid;
    if (fLo * fMid < 0) {
      hi = mid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return 0.5 * (lo + hi);
}

/**
 * Nelder–Mead simplex minimiser: minimise f(x) for a vector x without needing
 * derivatives. Used for calibrating SABR and the LMM volatility function.
 */
export function nelderMead(
  f: (x: number[]) => number,
  x0: number[],
  { step = 0.1, maxIter = 2000, tol = 1e-12 }: { step?: number; maxIter?: number; tol?: number } = {},
): { x: number[]; fx: number; iterations: number } {
  const n = x0.length;
  // Start with a simplex of n+1 points around x0.
  let simplex: number[][] = [x0.slice()];
  for (let i = 0; i < n; i++) {
    const p = x0.slice();
    p[i] += p[i] !== 0 ? step * Math.abs(p[i]) + step : step;
    simplex.push(p);
  }
  let values = simplex.map(f);

  let iter = 0;
  for (; iter < maxIter; iter++) {
    // Sort points from best (lowest f) to worst.
    const order = values.map((_, i) => i).sort((a, b) => values[a] - values[b]);
    simplex = order.map((i) => simplex[i]);
    values = order.map((i) => values[i]);
    if (Math.abs(values[n] - values[0]) < tol) break;

    // Centroid of all points except the worst.
    const centroid = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) centroid[j] += simplex[i][j] / n;
    const move = (t: number) => centroid.map((c, j) => c + t * (simplex[n][j] - c));

    const reflected = move(-1);
    const fr = f(reflected);
    if (fr < values[0]) {
      const expanded = move(-2);
      const fe = f(expanded);
      if (fe < fr) { simplex[n] = expanded; values[n] = fe; } else { simplex[n] = reflected; values[n] = fr; }
    } else if (fr < values[n - 1]) {
      simplex[n] = reflected; values[n] = fr;
    } else {
      const contracted = fr < values[n] ? move(-0.5) : move(0.5);
      const fc = f(contracted);
      if (fc < Math.min(fr, values[n])) {
        simplex[n] = contracted; values[n] = fc;
      } else {
        // Shrink everything towards the best point.
        for (let i = 1; i <= n; i++) {
          simplex[i] = simplex[i].map((x, j) => simplex[0][j] + 0.5 * (x - simplex[0][j]));
          values[i] = f(simplex[i]);
        }
      }
    }
  }
  const best = values.indexOf(Math.min(...values));
  return { x: simplex[best], fx: values[best], iterations: iter };
}
