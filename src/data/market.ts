/**
 * Sample market data.
 *
 * ILLUSTRATIVE ONLY — these numbers are shaped like a real USD SOFR market
 * (inverted front end, humped vols) but are not live quotes. Every page lets
 * you move away from them with sliders, and you can edit them here.
 */
import type { Instrument } from '../models/curve';

/** SOFR deposits (simple rates) and annual-fixed OIS swaps (par rates). */
export const sofrInstruments: Instrument[] = [
  { kind: 'deposit', tenor: 1 / 12, rate: 0.039, label: '1M' },
  { kind: 'deposit', tenor: 0.25, rate: 0.0385, label: '3M' },
  { kind: 'deposit', tenor: 0.5, rate: 0.0375, label: '6M' },
  { kind: 'swap', tenor: 1, rate: 0.036, label: '1Y' },
  { kind: 'swap', tenor: 2, rate: 0.0345, label: '2Y' },
  { kind: 'swap', tenor: 3, rate: 0.034, label: '3Y' },
  { kind: 'swap', tenor: 5, rate: 0.0345, label: '5Y' },
  { kind: 'swap', tenor: 7, rate: 0.0355, label: '7Y' },
  { kind: 'swap', tenor: 10, rate: 0.037, label: '10Y' },
  { kind: 'swap', tenor: 15, rate: 0.0385, label: '15Y' },
  { kind: 'swap', tenor: 20, rate: 0.039, label: '20Y' },
  { kind: 'swap', tenor: 30, rate: 0.0385, label: '30Y' },
];

/** Flat normal cap vols (decimal: 0.0095 = 95bp) by cap maturity, quarterly caplets. */
export const capFlatNormalVols: { maturity: number; vol: number }[] = [
  { maturity: 1, vol: 0.0095 },
  { maturity: 2, vol: 0.0105 },
  { maturity: 3, vol: 0.0108 },
  { maturity: 5, vol: 0.0105 },
  { maturity: 7, vol: 0.01 },
  { maturity: 10, vol: 0.0092 },
];

/** ATM swaption normal vols (bp) — rows are expiries, columns are underlying swap tenors. */
export const swaptionExpiries = [1 / 12, 0.25, 0.5, 1, 2, 3, 5, 7, 10];
export const swaptionExpiryLabels = ['1M', '3M', '6M', '1Y', '2Y', '3Y', '5Y', '7Y', '10Y'];
export const swaptionTenors = [1, 2, 5, 10, 20, 30];
export const swaptionTenorLabels = ['1Y', '2Y', '5Y', '10Y', '20Y', '30Y'];
export const swaptionNormalVolsBp: number[][] = [
  [98, 104, 106, 102, 95, 90],
  [102, 107, 108, 103, 96, 91],
  [106, 110, 109, 104, 97, 92],
  [110, 112, 110, 104, 97, 92],
  [112, 112, 108, 102, 95, 90],
  [110, 110, 106, 100, 93, 88],
  [104, 104, 101, 96, 89, 84],
  [99, 99, 96, 92, 85, 80],
  [92, 92, 90, 86, 80, 75],
];

/** A 1Y×5Y swaption smile in (lognormal) Black vols, used to fit SABR. */
export const smileExpiry = 1;
export const smileTenor = 5;
export const smileQuotes: { strike: number; vol: number }[] = [
  { strike: 0.015, vol: 0.38 },
  { strike: 0.02, vol: 0.33 },
  { strike: 0.025, vol: 0.295 },
  { strike: 0.03, vol: 0.27 },
  { strike: 0.035, vol: 0.255 },
  { strike: 0.04, vol: 0.248 },
  { strike: 0.045, vol: 0.247 },
  { strike: 0.05, vol: 0.25 },
  { strike: 0.055, vol: 0.255 },
];

/** Caplet Black vols by expiry (humped), the calibration target for the LMM. */
export const lmmCapletBlackVols: { expiry: number; vol: number }[] = [
  { expiry: 1, vol: 0.3 },
  { expiry: 2, vol: 0.315 },
  { expiry: 3, vol: 0.31 },
  { expiry: 4, vol: 0.3 },
  { expiry: 5, vol: 0.29 },
  { expiry: 7, vol: 0.27 },
  { expiry: 9, vol: 0.255 },
];
