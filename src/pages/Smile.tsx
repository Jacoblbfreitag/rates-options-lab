import { useMemo, useState } from 'react';
import type { Data } from 'plotly.js';
import { Chart, line, linspace } from '../components/Chart';
import { Playground, Slider, Toggle, bp, num, pct } from '../components/Controls';
import { Tex, TexBlock } from '../components/Formula';
import { CodeRef, LessonFooter, LessonHeader, Note, Quiz, Section, TryThis } from '../components/Lesson';
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
        <p>
          If the market believed Black-76, every strike would trade at the same implied vol. It does not. Below are quotes for a{' '}
          {smileExpiry}Y × {smileTenor}Y swaption (forward swap rate {pct(F, 2)}). Low strikes, i.e. receivers that pay off when
          rates fall, trade at much higher Black vols. Part of this is just the lognormal-vs-normal effect from module 3. The rest is genuine:
          the market prices fatter tails than the model, plus a <strong>skew</strong> between low and high strikes.
        </p>
        <Note title="Why care?">
          A desk that sells a 2% receiver at the 3.5% ATM vol undersells it badly. Exotics (Bermudans, CMS products, range accruals)
          depend on the whole smile, so you need a model that interpolates and extrapolates it sensibly. That model is SABR.
        </Note>
      </Section>

      <Section title="2. SABR: stochastic volatility for forwards">
        <TexBlock>{String.raw`dF = \alpha\,F^{\beta}\,dW_1, \qquad d\alpha = \nu\,\alpha\,dW_2, \qquad dW_1\,dW_2 = \rho\,dt`}</TexBlock>
        <p>
          The forward's volatility <Tex>{String.raw`\alpha`}</Tex> is itself random. Hagan et al. (2002) derived an approximate
          Black vol <Tex>{String.raw`\sigma_B(K)`}</Tex> for each strike, so SABR is used as a smile <em>interpolator</em> that you still price with Black-76.
          The controls below fix the ATM vol and back out <Tex>{String.raw`\alpha`}</Tex>, as traders do, so you can see each
          parameter's pure shape effect:
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
        <p>
          In practice <Tex>{String.raw`\beta`}</Tex> is fixed by convention (desks commonly use 0, 0.5 or 1) and{' '}
          <Tex>{String.raw`\alpha, \rho, \nu`}</Tex> are fitted by least squares to the quoted strikes. One reason for fixing β:
          β and ρ both create skew, so the data can barely tell them apart.
        </p>
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
        <p>
          β matters for <strong>dynamics</strong> even though it barely changes today's fit. It controls how the ATM vol
          moves when the forward moves (the "backbone"): <Tex>{String.raw`\sigma_{ATM} \approx \alpha / F^{1-\beta}`}</Tex>. With
          β = 0 a rise in rates lowers the Black ATM vol (normal vol stays constant). With β = 1 the Black vol stays put. That
          changes the hedge: the delta of a swaption depends on β.
        </p>
        <Chart data={backboneChart} x="Strike (%)" y="Black vol (%)" layout={{ yaxis: { range: [10, 60] } }} />
        <TryThis items={['Use the β slider in section 2 and watch how far apart the three smiles move here.']} />
      </Section>

      <Section title="5. The vol cube">
        <p>
          Put it together: the ATM grid from module 4 (expiry × tenor) plus a smile at every point gives a three-dimensional{' '}
          <strong>vol cube</strong>. Below, each expiry's ATM normal vol comes from the grid, and the smile shape comes from the ρ,
          ν and β in section 2 (shifted SABR, shift 2%). The vertical axis is in normal vol, the market's convention.
        </p>
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
