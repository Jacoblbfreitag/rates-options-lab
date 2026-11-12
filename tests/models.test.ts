import { describe, expect, it } from 'vitest';
import { normCdf } from '../src/models/math/normal';
import { bsGreeks, bsPrice } from '../src/models/blackScholes';
import { bachelier, black76, impliedBlackVol, impliedNormalVol } from '../src/models/black76';
import { bootstrap, flatCurve, instrumentRate } from '../src/models/curve';
import { atmCapStrike, capPrice, capSwapValue, stripCapletVols } from '../src/models/capfloor';
import { forwardSwap, swaptionPrice } from '../src/models/swaption';
import { calibrateSabr, sabrVol } from '../src/models/sabr';
import { vasicekBond, vasicekBondOption } from '../src/models/vasicek';
import { hwSwaption, hwZcbOption, treeSwaption, treeZcb, treeZcbOption } from '../src/models/hullwhite';
import { calibrateAbcd, capletVolFromAbcd, lmmSetup, simulateLmm } from '../src/models/lmm';
import { capFlatNormalVols, lmmCapletBlackVols, smileQuotes, sofrInstruments } from '../src/data/market';

const curve = bootstrap(sofrInstruments);

describe('normal distribution', () => {
  it('matches known values', () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 14);
    expect(normCdf(1.96)).toBeCloseTo(0.9750021048517795, 12);
    expect(normCdf(-3)).toBeCloseTo(0.0013498980316301, 13);
  });
});

describe('Black–Scholes', () => {
  // Hull, Options Futures and Other Derivatives, Example 15.6 (S=42, K=40, r=10%, σ=20%, T=0.5).
  const inp = { S: 42, K: 40, r: 0.1, sigma: 0.2, T: 0.5 };
  it('reproduces Hull example', () => {
    expect(bsPrice('call', inp)).toBeCloseTo(4.76, 2);
    expect(bsPrice('put', inp)).toBeCloseTo(0.81, 2);
  });
  it('satisfies put-call parity', () => {
    const lhs = bsPrice('call', inp) - bsPrice('put', inp);
    expect(lhs).toBeCloseTo(inp.S - inp.K * Math.exp(-inp.r * inp.T), 12);
  });
  it('delta matches a finite difference', () => {
    const h = 1e-4;
    const fd = (bsPrice('call', { ...inp, S: inp.S + h }) - bsPrice('call', { ...inp, S: inp.S - h })) / (2 * h);
    expect(bsGreeks('call', inp).delta).toBeCloseTo(fd, 7);
  });
});

describe('Black-76 and Bachelier', () => {
  it('Black-76 equals Black–Scholes on a forward with r = q', () => {
    const F = 100, K = 95, T = 1, s = 0.25, r = 0.03;
    expect(black76('call', F, K, T, s, Math.exp(-r * T))).toBeCloseTo(bsPrice('call', { S: F, K, T, r, q: r, sigma: s }), 12);
  });
  it('Bachelier ATM = σ√T/√(2π)', () => {
    expect(bachelier('call', 0.03, 0.03, 2, 0.01)).toBeCloseTo((0.01 * Math.sqrt(2)) / Math.sqrt(2 * Math.PI), 14);
  });
  it('Bachelier prices negative rates', () => {
    expect(bachelier('call', -0.005, 0, 1, 0.006)).toBeGreaterThan(0);
  });
  it('implied vols invert the formulas', () => {
    const pB = black76('call', 0.035, 0.04, 2, 0.27);
    expect(impliedBlackVol('call', pB, 0.035, 0.04, 2)).toBeCloseTo(0.27, 9);
    const pN = bachelier('put', 0.035, 0.03, 3, 0.0098);
    expect(impliedNormalVol('put', pN, 0.035, 0.03, 3)).toBeCloseTo(0.0098, 11);
  });
});

describe('curve bootstrap', () => {
  it('reprices every input instrument', () => {
    for (const inst of sofrInstruments) expect(Math.abs(instrumentRate(curve, inst) - inst.rate)).toBeLessThan(1e-8);
  });
  it('has decreasing discount factors', () => {
    let prev = 1;
    for (let t = 0.1; t <= 30; t += 0.1) {
      const d = curve.df(t);
      expect(d).toBeLessThan(prev);
      prev = d;
    }
  });
});

describe('caps and floors', () => {
  it('cap − floor = payer swap', () => {
    for (const model of ['black', 'normal'] as const) {
      const vol = model === 'black' ? 0.28 : 0.01;
      const cap = capPrice(curve, 5, 0.035, vol, model, 'cap').total;
      const floor = capPrice(curve, 5, 0.035, vol, model, 'floor').total;
      expect(cap - floor).toBeCloseTo(capSwapValue(curve, 5, 0.035), 12);
    }
  });
  it('ATM cap and floor have equal value', () => {
    const K = atmCapStrike(curve, 5);
    expect(capPrice(curve, 5, K, 0.01, 'normal', 'cap').total).toBeCloseTo(capPrice(curve, 5, K, 0.01, 'normal', 'floor').total, 12);
  });
  it('stripped caplet vols reprice every cap', () => {
    const K = 0.035;
    const spot = stripCapletVols(curve, capFlatNormalVols, K);
    const volAt = (r: number) => spot.find((s) => Math.abs(s.reset - r) < 1e-9)!.vol;
    for (const q of capFlatNormalVols) {
      const flat = capPrice(curve, q.maturity, K, q.vol, 'normal').total;
      expect(capPrice(curve, q.maturity, K, volAt, 'normal').total).toBeCloseTo(flat, 11);
    }
  });
});

describe('swaptions', () => {
  it('payer − receiver = A·(S − K)', () => {
    const { rate, annuity } = forwardSwap(curve, 2, 5);
    const K = 0.04;
    const p = swaptionPrice(curve, 2, 5, K, 0.01, 'normal', 'payer');
    const r = swaptionPrice(curve, 2, 5, K, 0.01, 'normal', 'receiver');
    expect(p - r).toBeCloseTo(annuity * (rate - K), 13);
  });
});

describe('SABR', () => {
  it('β = 1, ν → 0 gives flat vol α', () => {
    const p = { alpha: 0.2, beta: 1, rho: 0, nu: 1e-8 };
    expect(sabrVol(0.03, 0.02, 1, p)).toBeCloseTo(0.2, 6);
    expect(sabrVol(0.03, 0.05, 1, p)).toBeCloseTo(0.2, 6);
  });
  it('is continuous at the money', () => {
    const p = { alpha: 0.035, beta: 0.5, rho: -0.3, nu: 0.4 };
    // A tiny strike move changes the vol only by (smile slope × ΔK) ≈ 1e-8 — no jump at K = F.
    expect(sabrVol(0.03, 0.03 * (1 + 1e-7), 2, p)).toBeCloseTo(sabrVol(0.03, 0.03, 2, p), 7);
  });
  it('calibration recovers known parameters', () => {
    const truth = { alpha: 0.04, beta: 0.5, rho: -0.25, nu: 0.45 };
    const quotes = [0.015, 0.02, 0.025, 0.03, 0.035, 0.04, 0.05, 0.06].map((k) => ({ strike: k, vol: sabrVol(0.032, k, 1, truth) }));
    const { params } = calibrateSabr(0.032, 1, quotes, 0.5);
    expect(params.alpha).toBeCloseTo(truth.alpha, 4);
    expect(params.rho).toBeCloseTo(truth.rho, 3);
    expect(params.nu).toBeCloseTo(truth.nu, 3);
  });
  it('fits the sample smile', () => {
    const F = forwardSwap(curve, 1, 5).rate;
    expect(calibrateSabr(F, 1, smileQuotes, 0.5).rmse).toBeLessThan(0.005);
  });
});

describe('Vasicek', () => {
  it('bond price equals Monte Carlo-free limit: σ → 0, r0 = b gives e^(−bT)', () => {
    expect(vasicekBond({ a: 0.3, b: 0.04, sigma: 1e-9, r0: 0.04 }, 5)).toBeCloseTo(Math.exp(-0.2), 10);
  });
  it('bond option put-call parity', () => {
    const p = { a: 0.1, b: 0.05, sigma: 0.015, r0: 0.03 };
    const K = 0.8;
    const c = vasicekBondOption('call', p, 2, 7, K);
    const put = vasicekBondOption('put', p, 2, 7, K);
    expect(c - put).toBeCloseTo(vasicekBond(p, 7) - K * vasicekBond(p, 2), 12);
  });
});

describe('Hull–White', () => {
  const hw = { a: 0.05, sigma: 0.01 };
  it('tree reprices zero-coupon bonds on the curve', () => {
    for (const T of [1, 5, 10]) expect(treeZcb(curve, hw, T, 24)).toBeCloseTo(curve.df(T), 10);
  });
  it('tree bond option converges to the analytic formula', () => {
    const K = curve.df(5) / curve.df(2);
    const analytic = hwZcbOption(curve, hw, 'call', 2, 5, K);
    const tree = treeZcbOption(curve, hw, 'call', 2, 5, K, 96);
    expect(Math.abs(tree - analytic) / analytic).toBeLessThan(0.01);
  });
  it('tree European swaption ≈ Jamshidian', () => {
    const K = forwardSwap(curve, 2, 5).rate;
    const analytic = hwSwaption(curve, hw, 2, 5, K, 'payer');
    const tree = treeSwaption(curve, hw, 2, 5, K, 'payer', 'european', 1, 48);
    expect(Math.abs(tree - analytic) / analytic).toBeLessThan(0.01);
  });
  it('Bermudan ≥ European', () => {
    const K = forwardSwap(curve, 2, 5).rate;
    const eu = treeSwaption(curve, hw, 2, 5, K, 'receiver', 'european', 1, 24);
    const be = treeSwaption(curve, hw, 2, 5, K, 'receiver', 'bermudan', 1, 24);
    expect(be).toBeGreaterThan(eu);
  });
});

describe('LIBOR Market Model', () => {
  const abcd = { a: 0.15, b: 0.6, c: 1.2, d: 0.2 };
  const setup = lmmSetup(curve, 1, 10, abcd, 0.1);
  const res = simulateLmm(setup, { nPaths: 20000, stepsPerPeriod: 4, seed: 7, expiryIndex: 3 });
  it('Monte Carlo caplets match Black-76', () => {
    for (const c of res.caplets) expect(Math.abs(c.mc - c.black)).toBeLessThan(4 * c.se + 2e-6);
  });
  it('Monte Carlo swaption is close to the Rebonato approximation', () => {
    expect(Math.abs(res.swaption.mc - res.swaption.rebonato) / res.swaption.rebonato).toBeLessThan(0.03);
  });
  it('abcd calibration fits the caplet vol term structure', () => {
    const { params, rmse } = calibrateAbcd(lmmCapletBlackVols, abcd);
    expect(rmse).toBeLessThan(0.003);
    expect(capletVolFromAbcd(params, 2)).toBeCloseTo(0.315, 2);
  });
});

describe('sanity', () => {
  it('flat curve forward equals the rate', () => {
    const c = flatCurve(0.03);
    expect(c.fwd(1, 2)).toBeCloseTo(Math.exp(0.03) - 1, 12);
  });
});
