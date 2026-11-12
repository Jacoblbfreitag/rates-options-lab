import { useMemo, useState } from 'react';
import type { Data } from 'plotly.js';
import { Chart, line, linspace } from '../components/Chart';
import { Playground, Slider, Toggle, bp, num, pct } from '../components/Controls';
import { Tex, TexBlock } from '../components/Formula';
import { CodeRef, Example, InPlainWords, LessonFooter, LessonHeader, Note, Quiz, Section, Symbols, Takeaways, Term, TryThis } from '../components/Lesson';
import { baseCurve } from '../data/curves';
import {
  smileExpiry,
  smileQuotes,
  smileTenor,
  swaptionExpiries,
  swaptionExpiryLabels,
  swaptionNormalVolsBp,
  swaptionTenorLabels,
  swaptionTenors,
} from '../data/market';
import { black76, impliedNormalVol } from '../models/black76';
import { alphaFromAtmVol, calibrateSabr, sabrVol, type SabrParams } from '../models/sabr';
import { forwardSwap } from '../models/swaption';

const F = forwardSwap(baseCurve, smileExpiry, smileTenor).rate;
const T = smileExpiry;
const quoteTrace: Data = {
  x: smileQuotes.map((q) => q.strike * 100),
  y: smileQuotes.map((q) => q.vol * 100),
  type: 'scatter',
  mode: 'markers',
  name: 'Market quotes',
  marker: { size: 9, color: '#c2453c' },
};

/** Black vol → normal vol for the same price (exact, via implied vol). */
function toNormal(Fwd: number, K: number, t: number, volB: number) {
  const type = K < Fwd ? 'put' : 'call';
  return impliedNormalVol(type, black76(type, Fwd, K, t, volB), Fwd, K, t);
}

export default function Smile() {
  // ── Playground ──
  const [atmVol, setAtmVol] = useState(0.255);
  const [beta, setBeta] = useState(0.5);
  const [rho, setRho] = useState(-0.3);
  const [nu, setNu] = useState(0.4);
  const [shift, setShift] = useState(0);
  const alpha = useMemo(() => alphaFromAtmVol(F, T, atmVol, { beta, rho, nu, shift }), [atmVol, beta, rho, nu, shift]);
  const params: SabrParams = useMemo(() => ({ alpha, beta, rho, nu, shift }), [alpha, beta, rho, nu, shift]);
  // Shifted SABR is defined down to K = −shift, so the strike axis follows the shift.
  const strikes = useMemo(() => linspace(0.005 - shift, 0.07, 131), [shift]);

  const smileChart = useMemo(
    () => [line(strikes.map((k) => k * 100), strikes.map((k) => sabrVol(F, k, T, params) * 100), 'SABR'), quoteTrace],
    [params, strikes],
  );

  // Risk-neutral density from undiscounted call prices: q(K) = ∂²C/∂K²  (Breeden–Litzenberger)
  const densityChart = useMemo(() => {
    const h = 1e-4;
    const C = (k: number) => black76('call', F + shift, k + shift, T, sabrVol(F, k, T, params));
    const q = strikes.map((k) => (C(k + h) - 2 * C(k) + C(k - h)) / (h * h) / 100); // per 1% of rate
    return [line(strikes.map((k) => k * 100), q, 'Implied density', { fill: 'tozeroy' })];
  }, [params, shift, strikes]);

  // ── Calibration ──
  const [fitBeta, setFitBeta] = useState<'0' | '0.5' | '1'>('0.5');
  const fit = useMemo(() => calibrateSabr(F, T, smileQuotes, Number(fitBeta)), [fitBeta]);
  const fitChart = useMemo(
    () => [line(strikes.map((k) => k * 100), strikes.map((k) => sabrVol(F, k, T, fit.params) * 100), `SABR fit (β = ${fitBeta})`), quoteTrace],
    [fit, fitBeta, strikes],
  );

  // ── Backbone ──
  const backboneChart = useMemo(
    () =>
      [-0.01, 0, 0.01].map((dF) =>
        line(strikes.map((k) => k * 100), strikes.map((k) => sabrVol(F + dF, k, T, params) * 100), `Forward ${dF >= 0 ? '+' : ''}${dF * 1e4}bp`, {
          line: { dash: dF === 0 ? 'solid' : 'dot' },
        }),
      ),
    [params, strikes],
  );

  // ── Vol cube ──
  const [tenorIdx, setTenorIdx] = useState(2);
  const cube = useMemo(() => {
    const offsets = linspace(-0.02, 0.02, 21);
    const z = swaptionExpiries.map((e, i) => {
      const { rate: S } = forwardSwap(baseCurve, e, swaptionTenors[tenorIdx]);
      const atmB = swaptionNormalVolsBp[i][tenorIdx] / 1e4 / S; // ATM Black vol ≈ σN / S
      const a = alphaFromAtmVol(S, e, atmB, { beta, rho, nu, shift: 0.02 });
      return offsets.map((o) => toNormal(S + 0.02, S + o + 0.02, e, sabrVol(S, S + o, e, { alpha: a, beta, rho, nu, shift: 0.02 })) * 1e4);
    });
    return { offsets, z };
  }, [tenorIdx, beta, rho, nu]);

  return (
    <article>
      <LessonHeader id="smile" />

      <Section title="1. One vol is not enough">
        <InPlainWords>
          <p>
            Black's formula assumes the rate has <em>one</em> volatility. If that were true, then after converting market prices
            into implied vols (module 3), every strike would show the same number. Plotted against the strike, you would get a
            flat line.
          </p>
          <p style={{ marginBottom: 0 }}>
            The red dots below are (sample) market quotes for a {smileExpiry}Y × {smileTenor}Y swaption, whose forward swap rate is{' '}
            {pct(F, 2)}. They are <strong>not</strong> flat. Options with low strikes, which pay off if rates fall a lot, trade at
            much higher implied vols. The curve is called the <Term name="Volatility smile">volatility smile</Term> (or skew). It
            tells you the market thinks big moves are more likely than the simple model says, so it charges more for protection
            against them.
          </p>
        </InPlainWords>
        <Chart
          data={[
            quoteTrace,
            line([1.5, 5.5], [smileQuotes[4].vol * 100, smileQuotes[4].vol * 100], 'What Black-76 assumes: one vol for all strikes', {
              line: { dash: 'dash', color: '#5f6b7a' },
            }),
          ]}
          x="Strike (%)"
          y="Implied Black vol (%)"
          height={280}
        />
        <Example title="Implied vol as a price tag">
          Traders talk about options in vols rather than euros, because a vol is comparable across strikes and maturities, much like
          quoting a bond by its yield rather than its price. "The 2% receiver trades at 33 vol" means: plug 33% into Black's formula
          and you get its market price. The smile is simply the list of these price tags across strikes.
        </Example>
        <Note title="Why care?">
          A desk that sells a 2% receiver at the 3.5% ATM vol undersells it badly. Exotics (Bermudans, CMS products, range accruals)
          depend on the whole smile, so you need a model that interpolates and extrapolates it sensibly. That model is SABR.
        </Note>
      </Section>

      <Section title="2. SABR: stochastic volatility for forwards">
        <InPlainWords>
          <p>
            How do we build a model whose implied vols are not flat? The most popular answer in rates is{' '}
            <Term name="SABR model">SABR</Term>. Its idea: <strong>volatility itself moves randomly</strong>. Markets have calm and
            stormy periods, just as weather does. If vol can suddenly rise, extreme outcomes become more likely than in a
            constant-vol world, and options far from the money become more valuable. That lifts the wings of the smile.
          </p>
          <p style={{ marginBottom: 0 }}>
            SABR has one equation for the rate and one for its volatility. Hagan and co-authors (2002) found an approximate
            formula that turns the model's four parameters into an implied vol for every strike. In practice you use SABR to draw a
            smooth smile through the market quotes, then price with Black's formula at the vol SABR gives for each strike.
          </p>
        </InPlainWords>
        <TexBlock>{String.raw`dF = \alpha\,F^{\beta}\,dW_1, \qquad d\alpha = \nu\,\alpha\,dW_2, \qquad dW_1\,dW_2 = \rho\,dt`}</TexBlock>
        <Symbols
          items={[
            ['F', 'The forward (swap) rate'],
            [String.raw`\alpha`, <><strong>alpha</strong>: the current level of volatility, which mainly sets the height of the smile</>],
            [String.raw`\beta`, <><strong>beta</strong>: between 0 and 1. Chooses between "normal-like" (0) and "lognormal-like" (1) behaviour</>],
            [String.raw`\nu`, <><strong>nu</strong>: the <Term name="Vol of vol">vol of vol</Term>, i.e. how much volatility itself moves. It bends the wings up (curvature)</>],
            [String.raw`\rho`, <><strong>rho</strong>: correlation between rate moves and vol moves. A negative value tilts the smile (skew)</>],
            ['dW_1,\\ dW_2', 'The random shocks to the rate and to its vol'],
          ]}
        />
        <p>
          The controls below fix the at-the-money vol and work out α automatically (as traders do), so each slider shows only
          its effect on the <em>shape</em>. The right-hand chart shows the probability distribution of the future swap rate that the
          smile implies. A smile is really a statement about which outcomes the market finds likely.
        </p>
        <Playground
          controls={
            <>
              <Slider label="ATM Black vol" value={atmVol} min={0.1} max={0.5} step={0.005} onChange={setAtmVol} format={(v) => pct(v, 1)} />
              <Slider label="β (backbone)" value={beta} min={0} max={1} step={0.05} onChange={setBeta} format={(v) => v.toFixed(2)} />
              <Slider label="ρ (skew)" value={rho} min={-0.95} max={0.95} step={0.01} onChange={setRho} format={(v) => v.toFixed(2)} />
              <Slider label="ν (vol of vol)" value={nu} min={0.01} max={1.5} step={0.01} onChange={setNu} format={(v) => v.toFixed(2)} />
              <Slider label="Shift" value={shift} min={0} max={0.03} step={0.0025} onChange={setShift} format={(v) => bp(v)} />
              <div className="muted" style={{ fontSize: 13 }}>
                Implied α = <strong>{num(alpha, 4)}</strong>
              </div>
            </>
          }
        >
          <div className="grid-2">
            <Chart data={smileChart} x="Strike (%)" y="Black vol (%)" layout={{ yaxis: { range: [10, 60] } }} />
            <Chart data={densityChart} x="Swap rate at expiry (%)" y="Density (per 1%)" />
          </div>
        </Playground>
        <TryThis
          items={[
            'Set ν ≈ 0 and ρ = 0, then move β. With β = 1 the smile is flat (pure Black). With β = 0 you get the normal model’s skew.',
            'Raise ν: the wings lift (curvature), and the density grows fat tails.',
            'Make ρ negative: low strikes get more vol. Rates and rate vol tend to move together in bp terms, which creates this skew.',
            'Push ν high with very low strikes and watch the density: it can go negative near zero. That is Hagan’s approximation breaking down, a known flaw that motivated arbitrage-free SABR variants.',
            'With shift = 0 the curves stop at K = 0. Add a 2% shift and they extend to −2% (shifted SABR, the post-2015 standard).',
          ]}
        />
        <Note title="Where the density comes from">
          The right-hand chart uses Breeden–Litzenberger: the second derivative of call prices in strike is the risk-neutral
          density of the rate at expiry, <Tex>{String.raw`q(K) \propto \partial^2 C/\partial K^2`}</Tex>. Every smile is a statement
          about the probability distribution of future rates.
        </Note>
      </Section>

      <Section title="3. Calibrating to the market">
        <InPlainWords>
          Calibrating means choosing the parameters so that the model curve passes as close as possible to the market dots.
          It is the same <strong>least squares</strong> idea as fitting a regression line in econometrics: minimise the sum of
          squared differences between model vols and market vols. By convention, β is fixed first (desks commonly use 0, 0.5 or 1),
          and α, ρ and ν are fitted. β and ρ both tilt the smile, so the data can barely tell them apart, a bit like
          multicollinearity in a regression.
        </InPlainWords>
        <Playground
          controls={
            <>
              <Toggle
                label="Fix β at"
                value={fitBeta}
                onChange={setFitBeta}
                options={[
                  { value: '0', label: '0' },
                  { value: '0.5', label: '0.5' },
                  { value: '1', label: '1' },
                ]}
              />
              <table className="data">
                <tbody>
                  <tr><td>α</td><td>{num(fit.params.alpha, 4)}</td></tr>
                  <tr><td>ρ</td><td>{num(fit.params.rho, 3)}</td></tr>
                  <tr><td>ν</td><td>{num(fit.params.nu, 3)}</td></tr>
                  <tr><td>RMSE</td><td>{num(fit.rmse * 1e4, 1)} vol bp</td></tr>
                </tbody>
              </table>
              <button
                className="button"
                type="button"
                onClick={() => {
                  setBeta(fit.params.beta);
                  setRho(fit.params.rho);
                  setNu(fit.params.nu);
                  setShift(0);
                  setAtmVol(sabrVol(F, F, T, fit.params));
                }}
              >
                Load into playground
              </button>
            </>
          }
        >
          <Chart data={fitChart} x="Strike (%)" y="Black vol (%)" />
        </Playground>
        <TryThis
          items={[
            'Fit with β = 0, 0.5 and 1. All three match the quotes almost equally well, but ρ changes a lot to compensate. That is the β–ρ degeneracy.',
          ]}
        />
        <CodeRef file="src/models/sabr.ts">Hagan’s formula and the Nelder–Mead calibration.</CodeRef>
      </Section>

      <Section title="4. The backbone: what happens when rates move">
        <InPlainWords>
          Two SABR fits with different β can match <em>today's</em> quotes equally well. They disagree about{' '}
          <em>tomorrow</em>: if rates rise, does the whole smile move with them, and how does the ATM vol change? This relationship is
          called the <Term name="Backbone">backbone</Term>. It matters because a trader's hedge (the delta) depends on how vols
          react when rates move. The chart shows the smile for the current forward and for forwards 1% higher and lower.
        </InPlainWords>
        <TexBlock>{String.raw`\sigma_{ATM} \approx \alpha / F^{1-\beta}`}</TexBlock>
        <p>
          With β = 0, a rise in rates <em>lowers</em> the Black ATM vol (the bp vol stays roughly constant). With β = 1 the Black vol stays
          put.
        </p>
        <Chart data={backboneChart} x="Strike (%)" y="Black vol (%)" layout={{ yaxis: { range: [10, 60] } }} />
        <TryThis items={['Use the β slider in section 2 and watch how far apart the three smiles move here.']} />
      </Section>

      <Section title="5. The vol cube">
        <InPlainWords>
          Putting it all together: module 4 had one vol for each expiry and swap length. Each of those also has a whole smile across
          strikes. Expiry × swap length × strike makes three dimensions, which is why traders call it the{' '}
          <Term name="Vol cube">vol cube</Term>. Below, pick a swap length to see one "slice": for every expiry, the ATM vol comes
          from the module-4 grid and the smile shape from the SABR sliders in section 2. The height is in normal (bp) vol.
        </InPlainWords>
        <Toggle
          label="Underlying tenor"
          value={String(tenorIdx)}
          onChange={(v) => setTenorIdx(Number(v))}
          options={swaptionTenorLabels.map((l, i) => ({ value: String(i), label: l }))}
        />
        <Chart
          height={460}
          data={[
            {
              type: 'surface',
              x: cube.offsets.map((o) => o * 1e4),
              y: swaptionExpiries,
              z: cube.z,
              colorscale: 'Viridis',
              showscale: false,
            } as Data,
          ]}
          layout={{
            margin: { l: 0, r: 0, t: 10, b: 0 },
            scene: {
              xaxis: { title: { text: 'Strike − ATM (bp)' } },
              yaxis: { title: { text: 'Expiry (y)' } },
              zaxis: { title: { text: 'Normal vol (bp)' } },
            },
          }}
        />
        <p className="muted">
          Real desks calibrate a separate (ρ, ν) for every expiry × tenor point. Expiry labels: {swaptionExpiryLabels.join(', ')}.
        </p>
      </Section>

      <Takeaways
        items={[
          'Market implied vols differ by strike: the smile or skew. The simple Black model, with one vol, cannot explain it.',
          'Implied vol is a price tag: the vol that makes Black’s formula give the market price.',
          'SABR makes volatility random. Its parameters each control one feature: α the level, ρ the tilt (skew), ν the curvature, β the backbone.',
          'Calibration is least squares: choose parameters so the model smile passes through the market quotes.',
          'A smile is a statement about probabilities: it implies a distribution for the future rate.',
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'Which SABR parameter mainly controls the SKEW (slope) of the smile?',
            options: ['α', 'β', 'ρ', 'ν'],
            answer: 2,
            why: 'Correlation between the forward and its vol tilts the smile. β also creates skew, which is why β is usually fixed before fitting ρ.',
          },
          {
            q: 'Raising ν (vol of vol) mainly…',
            options: ['Shifts the whole smile up', 'Raises the wings (curvature)', 'Moves the ATM point', 'Makes rates negative'],
            answer: 1,
            why: 'Random vol fattens both tails, which lifts the implied vol of far-from-the-money strikes.',
          },
          {
            q: 'What is the point of shifted SABR?',
            options: ['Better fit to ATM', 'Allow negative rates down to −shift', 'Remove the β–ρ degeneracy', 'Speed'],
            answer: 1,
            why: 'Applying SABR to F + s and K + s keeps the lognormal-style dynamics while allowing rates to go as low as −s.',
          },
          {
            q: 'Two SABR fits with different β match today’s quotes equally well. Do they give the same hedges?',
            options: ['Yes — same prices, same hedges', 'No — the backbone (vol vs forward) differs, so deltas differ'],
            answer: 1,
            why: 'β sets how the smile moves when the forward moves. Same static fit, different dynamics, different delta.',
          },
        ]}
      />
      <LessonFooter id="smile" />
    </article>
  );
}
