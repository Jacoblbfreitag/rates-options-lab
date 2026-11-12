import { useMemo, useState } from 'react';
import type { Data } from 'plotly.js';
import { Chart, line, linspace } from '../components/Chart';
import { Playground, Slider, Stats, Toggle, bp, num, pct } from '../components/Controls';
import { Tex, TexBlock } from '../components/Formula';
import { CodeRef, LessonFooter, LessonHeader, Note, Quiz, Section, TryThis } from '../components/Lesson';
import { baseCurve } from '../data/curves';
import { swaptionExpiries, swaptionExpiryLabels, swaptionNormalVolsBp, swaptionTenorLabels, swaptionTenors } from '../data/market';
import { forwardOption, type VolModel } from '../models/black76';
import { forwardSwap, swaptionPrice, type SwaptionType } from '../models/swaption';

export default function Swaptions() {
  const [expiry, setExpiry] = useState(1);
  const [tenor, setTenor] = useState(5);
  const [type, setType] = useState<SwaptionType>('payer');
  const [model, setModel] = useState<VolModel>('normal');
  const [normalVol, setNormalVol] = useState(0.011);
  const [blackVol, setBlackVol] = useState(0.3);
  const vol = model === 'normal' ? normalVol : blackVol;
  const { rate: S0, annuity: A } = forwardSwap(baseCurve, expiry, tenor);
  const [moneyness, setMoneyness] = useState(0);
  const K = S0 + moneyness;

  const payer = swaptionPrice(baseCurve, expiry, tenor, K, vol, model, 'payer');
  const receiver = swaptionPrice(baseCurve, expiry, tenor, K, vol, model, 'receiver');
  const price = type === 'payer' ? payer : receiver;
  const sigmaN = model === 'normal' ? normalVol : blackVol * S0;
  const straddleRule = 0.4 * A * sigmaN * Math.sqrt(expiry) * 2; // ≈ 0.8 · A · σN · √T
  const straddleExact = swaptionPrice(baseCurve, expiry, tenor, S0, vol, model, 'payer') * 2;

  // Value vs swap rate at expiry.
  const valueChart = useMemo(() => {
    const ss = linspace(K - 0.03, K + 0.03, 161);
    const optType = type === 'payer' ? 'call' : 'put';
    return [
      line(ss.map((s) => s * 100), ss.map((s) => A * Math.max(type === 'payer' ? s - K : K - s, 0) * 1e4), 'Payoff at expiry', {
        line: { dash: 'dash', color: '#5f6b7a' },
      }),
      line(ss.map((s) => s * 100), ss.map((s) => forwardOption(model, optType, s, K, expiry, vol, A) * 1e4), 'Value today'),
      { x: [S0 * 100], y: [price * 1e4], type: 'scatter', mode: 'markers', name: 'Today’s forward', marker: { size: 10, color: '#c2453c' } } as Data,
    ];
  }, [K, A, type, model, expiry, vol, S0, price]);

  // Forward swap rates for several tenors.
  const fwdChart = useMemo(() => {
    const es = linspace(0, 10, 81);
    return [1, 2, 5, 10, 30].map((n) => line(es, es.map((e) => forwardSwap(baseCurve, e, n).rate * 100), `${n}Y swap`));
  }, []);

  // ATM straddle premiums from the vol grid.
  const [gridView, setGridView] = useState<'vol' | 'premium' | 'surface'>('vol');
  const premiums = useMemo(
    () =>
      swaptionExpiries.map((e, i) =>
        swaptionTenors.map((n, j) => {
          const { rate } = forwardSwap(baseCurve, e, n);
          return 2 * swaptionPrice(baseCurve, e, n, rate, swaptionNormalVolsBp[i][j] / 1e4, 'normal', 'payer') * 1e4;
        }),
      ),
    [],
  );
  const heat = (z: number[][]): Data[] => [
    {
      type: 'heatmap',
      x: swaptionTenorLabels,
      y: swaptionExpiryLabels,
      z,
      colorscale: 'Blues',
      colorbar: { title: { text: 'bp' } },
      texttemplate: '%{z:.0f}',
      hovertemplate: 'Expiry %{y} × Tenor %{x}: %{z:.1f}<extra></extra>',
    } as Data,
  ];

  return (
    <article>
      <LessonHeader id="swaptions" />

      <Section title="1. The forward swap rate and the annuity">
        <p>
          A <strong>T<sub>e</sub> × n swaption</strong> (for example "1Y into 5Y") is the right, at expiry{' '}
          <Tex>{'T_e'}</Tex>, to enter an n-year swap at fixed rate <Tex>K</Tex>. What it depends on is the{' '}
          <strong>forward swap rate</strong>, the par rate of that forward-starting swap seen from today:
        </p>
        <TexBlock>{String.raw`S_0 = \frac{P(0,T_e) - P(0,T_e+n)}{A_0}, \qquad A_0 = \sum_{j=1}^{n} \tau_j\,P(0,t_j)`}</TexBlock>
        <div className="grid-2">
          <div>
            <Stats
              items={[
                { label: `${expiry}Y × ${tenor}Y forward swap rate`, value: pct(S0, 3) },
                { label: 'Annuity A₀', value: num(A, 4), hint: 'PV of 1 per year on the fixed leg' },
              ]}
            />
            <p className="muted">
              Use the expiry and tenor sliders in section 2. The forward swap rate is an average of the forward rates over the
              swap's life, weighted by the discount factors.
            </p>
          </div>
          <Chart data={fwdChart} x="Swap start / expiry (years)" y="Forward swap rate (%)" height={300} />
        </div>
      </Section>

      <Section title="2. Pricing: the annuity measure">
        <p>
          At expiry a payer swaption is worth <Tex>{String.raw`A(T_e)\,\max(S(T_e)-K,0)`}</Tex>: the swap-rate difference paid
          every year, worth the annuity. The trick is to use the annuity as the <strong>numeraire</strong>. Under that measure
          the swap rate <Tex>S</Tex> is a martingale, so the Black or Bachelier formula applies directly, with <Tex>{'A_0'}</Tex>{' '}
          in place of the discount factor:
        </p>
        <TexBlock>{String.raw`\text{Payer} = A_0\,\text{Black}(S_0, K, T_e, \sigma), \qquad \text{Receiver} = A_0\,\text{Black}_{\text{put}}(S_0, K, T_e, \sigma)`}</TexBlock>
        <Playground
          controls={
            <>
              <Toggle value={type} onChange={setType} options={[{ value: 'payer', label: 'Payer' }, { value: 'receiver', label: 'Receiver' }]} />
              <Toggle label="Model" value={model} onChange={setModel} options={[{ value: 'normal', label: 'Bachelier' }, { value: 'black', label: 'Black-76' }]} />
              <Slider label="Expiry" value={expiry} min={0.25} max={10} step={0.25} onChange={setExpiry} format={(v) => `${v}Y`} />
              <Slider label="Swap tenor" value={tenor} min={1} max={30} step={1} onChange={setTenor} format={(v) => `${v}Y`} />
              <Slider label="Strike vs ATM" value={moneyness} min={-0.02} max={0.02} step={0.0005} onChange={setMoneyness} format={(v) => `${v >= 0 ? '+' : ''}${bp(v)}`} />
              {model === 'normal' ? (
                <Slider label="Normal vol σN" value={normalVol} min={0.003} max={0.025} step={0.0005} onChange={setNormalVol} format={(v) => bp(v)} />
              ) : (
                <Slider label="Black vol σ" value={blackVol} min={0.05} max={0.8} step={0.01} onChange={setBlackVol} format={(v) => pct(v, 0)} />
              )}
            </>
          }
        >
          <Stats
            items={[
              { label: 'Strike', value: pct(K, 3) },
              { label: 'Payer', value: `${num(payer * 1e4, 1)}bp` },
              { label: 'Receiver', value: `${num(receiver * 1e4, 1)}bp` },
              { label: 'Payer − Receiver', value: `${num((payer - receiver) * 1e4, 2)}bp`, hint: `A₀·(S₀−K) = ${num(A * (S0 - K) * 1e4, 2)}bp` },
            ]}
          />
          <Chart data={valueChart} x="Swap rate (%)" y={`${type === 'payer' ? 'Payer' : 'Receiver'} value (bp of notional)`} />
        </Playground>
        <Note title="Rule of thumb: the ATM straddle">
          At the money, Bachelier gives <Tex>{String.raw`\text{Payer} = A_0\,\sigma_N\sqrt{T}/\sqrt{2\pi} \approx 0.4\,A_0\,\sigma_N\sqrt T`}</Tex>,
          so a straddle costs about <Tex>{String.raw`0.8\,A_0\,\sigma_N\sqrt{T}`}</Tex>. Traders use this to convert between
          premium and vol in their heads. Here it gives <strong>{num(straddleRule * 1e4, 1)}bp</strong> against the exact{' '}
          <strong>{num(straddleExact * 1e4, 1)}bp</strong>.
        </Note>
        <TryThis
          items={[
            'Set the strike to ATM (0bp). Payer and receiver are equal, as parity says.',
            'Hold expiry at 1Y and stretch the tenor from 1Y to 30Y. The premium grows almost in proportion to the annuity, because a longer swap is a bigger bet on the same rate.',
            'Switch to Black and set the vol to σN / S₀. The ATM prices match. Away from ATM they differ: that is the built-in skew from module 3.',
          ]}
        />
        <CodeRef file="src/models/swaption.ts">The whole pricer is about five lines once the curve exists.</CodeRef>
      </Section>

      <Section title="3. The ATM swaption vol grid">
        <p>
          The market quotes ATM normal vols on a grid of <strong>expiry × tenor</strong>. It is the most important input for
          rates exotics desks, since every term-structure model in modules 6–7 is calibrated to (parts of) it.
        </p>
        <Toggle
          value={gridView}
          onChange={setGridView}
          options={[
            { value: 'vol', label: 'Normal vols (bp)' },
            { value: 'premium', label: 'Straddle premium (bp)' },
            { value: 'surface', label: '3D surface' },
          ]}
        />
        {gridView === 'vol' && <Chart data={heat(swaptionNormalVolsBp)} x="Underlying swap tenor" y="Option expiry" height={380} />}
        {gridView === 'premium' && <Chart data={heat(premiums)} x="Underlying swap tenor" y="Option expiry" height={380} />}
        {gridView === 'surface' && (
          <Chart
            height={420}
            data={[
              {
                type: 'surface',
                x: swaptionTenors,
                y: swaptionExpiries,
                z: swaptionNormalVolsBp,
                colorscale: 'Viridis',
                showscale: false,
              } as Data,
            ]}
            layout={{
              margin: { l: 0, r: 0, t: 10, b: 0 },
              scene: { xaxis: { title: { text: 'Tenor (y)' } }, yaxis: { title: { text: 'Expiry (y)' } }, zaxis: { title: { text: 'Normal vol (bp)' } } },
            }}
          />
        )}
        <Note title="Reading the grid">
          <ul>
            <li><strong>Hump along expiries</strong>: vol peaks around 1–2Y expiries. Very short-dated rates are anchored by the central bank, and long-dated ones by mean reversion.</li>
            <li><strong>Lower vol for long tenors</strong>: a 30Y swap rate averages many forwards, and imperfect correlation between them cancels some of the variance.</li>
            <li><strong>Premium grows with both dimensions</strong>, through √T for expiry and through the annuity for tenor, even where the vol falls.</li>
          </ul>
        </Note>
      </Section>

      <Quiz
        questions={[
          {
            q: 'A pension fund fears rates will FALL (its liabilities grow). Which swaption hedges it?',
            options: ['Payer swaption', 'Receiver swaption', 'Cap', 'Either payer or receiver'],
            answer: 1,
            why: 'A receiver gives the right to receive a fixed rate set today, which becomes valuable if rates fall.',
          },
          {
            q: 'Why do we discount with the annuity A₀ instead of a single discount factor?',
            options: ['It is a convention', 'Because the payoff is paid on every fixed-leg date, and A is the value of that stream', 'To remove convexity', 'Because the swap starts in the future'],
            answer: 1,
            why: 'The payoff (S − K)⁺ is received every year of the swap. Their PV is (S − K)⁺ × A, so A is the natural numeraire.',
          },
          {
            q: '1Y × 10Y, annuity 8, σN = 100bp. The ATM straddle costs roughly…',
            options: ['32bp', '64bp', '80bp', '800bp'],
            answer: 1,
            why: '0.8 × 8 × 0.01 × √1 = 0.064 = 64bp of notional.',
          },
        ]}
      />
      <LessonFooter id="swaptions" />
    </article>
  );
}
