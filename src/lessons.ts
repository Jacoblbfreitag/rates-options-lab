/** The course outline. Add a lesson here and it appears in the sidebar and overview. */
export interface LessonInfo {
  id: string;
  number: number;
  path: string;
  title: string;
  summary: string;
  goals: string[];
}

export const lessons: LessonInfo[] = [
  {
    id: 'foundations',
    number: 1,
    path: '/foundations',
    title: 'Options foundations',
    summary: 'Payoffs, Black–Scholes and the Greeks — the vocabulary every later module reuses.',
    goals: [
      'Read a payoff diagram and relate it to the option price before expiry',
      'Explain what each input of Black–Scholes does to the price',
      'Interpret delta, gamma, vega and theta and see where each is largest',
      'Use put–call parity to check prices',
    ],
  },
  {
    id: 'curves',
    number: 2,
    path: '/curves',
    title: 'Yield curves',
    summary: 'Discount factors, zero and forward rates, and bootstrapping a curve from market quotes.',
    goals: [
      'Move between discount factors, zero rates and forward rates',
      'Bootstrap a curve from deposits and par swaps',
      'See how parallel shifts, steepeners and flatteners move the forwards',
    ],
  },
  {
    id: 'caps',
    number: 3,
    path: '/caps-floors',
    title: 'Caps & floors',
    summary: 'Caplets as options on forward rates, Black-76 vs Bachelier, and stripping caplet vols.',
    goals: [
      'Decompose a cap into caplets and price each one',
      'Explain why the market moved from lognormal (Black) to normal (Bachelier) vols',
      'Verify cap − floor = swap',
      'Strip flat cap vols into spot caplet vols',
    ],
  },
  {
    id: 'swaptions',
    number: 4,
    path: '/swaptions',
    title: 'Swaptions',
    summary: 'Options on swaps, the annuity measure, payer/receiver parity and the ATM vol grid.',
    goals: [
      'Compute a forward swap rate and its annuity',
      'Price payer and receiver swaptions and check parity',
      'Use the rule of thumb: ATM straddle ≈ 0.8 · A · σN · √T',
      'Read an ATM swaption vol grid',
    ],
  },
  {
    id: 'smile',
    number: 5,
    path: '/smile',
    title: 'Volatility smile & SABR',
    summary: 'Why one vol is not enough, and how SABR models the smile — plus the vol cube.',
    goals: [
      'Describe the effect of α, β, ρ and ν on the smile',
      'Calibrate SABR to market quotes',
      'Explain shifted SABR for negative rates',
      'Navigate expiry × tenor × strike: the vol cube',
    ],
  },
  {
    id: 'short-rate',
    number: 6,
    path: '/short-rate',
    title: 'Short-rate models',
    summary: 'Vasicek and Hull–White, trinomial trees, and pricing Bermudan swaptions.',
    goals: [
      'Explain mean reversion and its effect on long-dated vol',
      'See why Hull–White fits today’s curve and Vasicek does not',
      'Build and read a trinomial tree',
      'Price a Bermudan swaption and value the early-exercise right',
    ],
  },
  {
    id: 'lmm',
    number: 7,
    path: '/lmm',
    title: 'LIBOR Market Model',
    summary: 'Modelling all forward rates at once: drifts, correlation, Monte Carlo and calibration.',
    goals: [
      'Explain why caplets are exactly Black-76 in the LMM',
      'Understand the spot-measure drift and why it is needed',
      'Run a Monte Carlo and compare against Black and Rebonato’s formula',
      'Calibrate the abcd volatility function to caplet vols',
    ],
  },
];
