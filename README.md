# Rates Options Lab

An interactive course on **interest rate options**, built as a React web app: from Black–Scholes to the LIBOR Market Model, with every model implemented from scratch and every formula paired with charts you can manipulate.

**Live site:** https://jacoblbfreitag.github.io/rates-options-lab/

## Modules

| # | Module | What you build and explore |
|---|--------|----------------------------|
| 1 | Options foundations | Payoffs, Black–Scholes, Greeks (2D + 3D surfaces), put–call parity |
| 2 | Yield curves | Discount factors, zero/forward rates, live bootstrapping from SOFR quotes, curve shifts |
| 3 | Caps & floors | Caplet strips, Black-76 vs Bachelier, cap–floor parity, caplet vol stripping |
| 4 | Swaptions | Forward swap rate & annuity, payer/receiver parity, ATM straddle rule, vol grid |
| 5 | Volatility smile & SABR | Hagan's formula, parameter effects, implied density, calibration, backbone, vol cube |
| 6 | Short-rate models | Vasicek, Hull–White, trinomial tree visualiser, Bermudan swaptions |
| 7 | LIBOR Market Model | abcd vol & correlation, calibration, Monte Carlo in a Web Worker, Rebonato's formula |

Each module follows the same pattern: intuition → formula → interactive chart → "Try this" exercises → quiz.

## Running it locally

Requires [Node.js](https://nodejs.org/) 18+.

```bash
npm install      # once
npm run dev      # start the app at http://localhost:5173/rates-options-lab/
npm test         # run the numerical tests
npm run build    # production build into dist/
```

## Project layout

```
src/
  models/      All the finance maths: pure TypeScript, no UI code, heavily commented.
    math/        normal CDF, root-finding, Nelder–Mead, Cholesky, seeded RNG
    blackScholes.ts  black76.ts  curve.ts  capfloor.ts  swaption.ts
    sabr.ts  vasicek.ts  hullwhite.ts  lmm.ts
  data/        Sample market data (illustrative, not live quotes)
  components/  Chart, sliders, formulas (KaTeX), quiz and lesson building blocks
  pages/       One file per module
  workers/     LMM Monte Carlo runs off the main thread
tests/         Checks against textbook values, parity relations and closed-form limits
```

Start with the `src/models/` files if you want to follow the maths in code. They are short and are meant to be read alongside the lessons.

## How the models are tested

`npm test` verifies, among other things:

- Black–Scholes reproduces Hull's worked example; put–call parity holds to 1e-12
- the bootstrapped curve reprices every input instrument to < 1e-8
- cap − floor = swap; payer − receiver = A·(S − K); stripped caplet vols reprice every cap
- SABR calibration recovers known parameters
- the Hull–White tree reprices zero-coupon bonds and matches the closed-form bond option and Jamshidian swaption prices to within 1%
- LMM Monte Carlo caplets match Black-76 within the Monte Carlo error, and the MC swaption matches Rebonato's approximation

## Tech

React 18 · TypeScript · Vite · Plotly.js · KaTeX · Vitest · deployed to GitHub Pages via GitHub Actions.

## References

- J. Hull, *Options, Futures, and Other Derivatives*
- D. Brigo & F. Mercurio, *Interest Rate Models — Theory and Practice*
- P. Hagan et al., "Managing Smile Risk", *Wilmott* (2002)
- R. Rebonato, *Modern Pricing of Interest-Rate Derivatives*

The sample market data is illustrative only and is not investment advice.
