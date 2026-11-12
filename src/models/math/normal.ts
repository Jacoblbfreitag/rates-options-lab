/**
 * The standard normal distribution: the workhorse of every option formula.
 *
 * N(x)  = probability that a standard normal variable is below x  (the CDF)
 * n(x)  = the bell-curve density                                  (the PDF)
 */

const INV_SQRT_2PI = 1 / Math.sqrt(2 * Math.PI);

/** Density n(x) = exp(-x²/2) / √(2π). */
export function normPdf(x: number): number {
  return INV_SQRT_2PI * Math.exp(-0.5 * x * x);
}

/**
 * Cumulative distribution N(x).
 * JavaScript has no built-in N(x), so we use Hart's (1968) rational
 * approximation as published by Graeme West, "Better approximations to
 * cumulative normal functions" (2005). Accurate to ~1e-14, i.e. full precision.
 */
export function normCdf(x: number): number {
  const xAbs = Math.abs(x);
  let c: number;
  if (xAbs > 37) {
    c = 0;
  } else {
    const e = Math.exp(-0.5 * xAbs * xAbs);
    if (xAbs < 7.07106781186547) {
      let b = 3.52624965998911e-2 * xAbs + 0.700383064443688;
      b = b * xAbs + 6.37396220353165;
      b = b * xAbs + 33.912866078383;
      b = b * xAbs + 112.079291497871;
      b = b * xAbs + 221.213596169931;
      b = b * xAbs + 220.206867912376;
      c = e * b;
      b = 8.83883476483184e-2 * xAbs + 1.75566716318264;
      b = b * xAbs + 16.064177579207;
      b = b * xAbs + 86.7807322029461;
      b = b * xAbs + 296.564248779674;
      b = b * xAbs + 637.333633378831;
      b = b * xAbs + 793.826512519948;
      b = b * xAbs + 440.413735824752;
      c = c / b;
    } else {
      let b = xAbs + 0.65;
      b = xAbs + 4 / b;
      b = xAbs + 3 / b;
      b = xAbs + 2 / b;
      b = xAbs + 1 / b;
      c = e / b / 2.506628274631;
    }
  }
  return x > 0 ? 1 - c : c;
}
