import { useMemo, useState } from 'react';
import type { Data } from 'plotly.js';
import { Chart, line, linspace } from '../components/Chart';
import { Playground, Slider, Stats, Toggle, bp, num, pct } from '../components/Controls';
import { Tex, TexBlock } from '../components/Formula';
import { CodeRef, Example, InPlainWords, LessonFooter, LessonHeader, Note, Quiz, Section, Symbols, Takeaways, Term, TryThis } from '../components/Lesson';
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

      <Section title="1. What is a swaption?">
        <InPlainWords>
          <p>
            Think of a mortgage. You are buying a house next year and are worried that mortgage rates will rise before then. You
            would love the <em>right</em>, but not the obligation, to lock in today's rate for a 5-year fixed mortgage that starts
            next year. If rates go up, you use the right. If they go down, you ignore it and take the cheaper market rate.
          </p>
          <p style={{ marginBottom: 0 }}>
            A <Term name="Swaption">swaption</Term> is exactly that, for an <Term name="Interest rate swap">interest rate swap</Term>.
            A "1Y × 5Y" (say "1 year into 5 years") swaption can be exercised in 1 year and gives a 5-year swap at a fixed rate{' '}
            <Tex>K</Tex> agreed today. A <Term name="Payer swaption">payer swaption</Term> lets you <em>pay</em> fixed: it
            protects borrowers and gains when rates rise. A <Term name="Receiver swaption">receiver swaption</Term> lets you{' '}
            <em>receive</em> fixed: it protects investors and gains when rates fall.
          </p>
        </InPlainWords>
        <h3>The two ingredients: the forward swap rate and the annuity</h3>
        <p>
          A caplet is an option on one forward rate. A swaption is an option on the{' '}
          <Term name="Forward swap rate">forward swap rate</Term> <Tex>{'S_0'}</Tex>: the fixed rate that would make the future
          swap fair, as seen from today. You can think of it as the market's "fair price" for that future swap. The{' '}
          <Term name="Annuity">annuity</Term> <Tex>{'A_0'}</Tex> from module 2 converts a rate difference into money: it is the value
          today of receiving €1 every year of the swap.
        </p>
        <TexBlock>{String.raw`S_0 = \frac{P(0,T_e) - P(0,T_e+n)}{A_0}, \qquad A_0 = \sum_{j=1}^{n} \tau_j\,P(0,t_j)`}</TexBlock>
        <Symbols
          items={[
            ['T_e', 'Expiry of the option = start date of the swap'],
            ['n', 'Length (tenor) of the underlying swap in years'],
            ['S_0', 'Forward swap rate: the fair fixed rate for that future swap, seen today'],
            ['A_0', 'Annuity: value today of €1 paid on each of the swap’s yearly payment dates t_j'],
            ['P(0,t)', 'Discount factors from the yield curve (module 2)'],
          ]}
        />
        <div className="grid-2">
          <div>
            <Stats
              items={[
                { label: `${expiry}Y × ${tenor}Y forward swap rate`, value: pct(S0, 3) },
                { label: 'Annuity A₀', value: num(A, 4), hint: `€1 a year for ${tenor} years, starting in ${expiry}Y` },
              ]}
            />
            <p className="muted">
              Change the expiry and tenor with the sliders in section 2. The annuity is a bit below the number of years, because
              later payments are discounted more.
            </p>
          </div>
          <Chart data={fwdChart} x="Swap start / expiry (years)" y="Forward swap rate (%)" height={300} />
        </div>
      </Section>

      <Section title="2. Pricing a swaption">
        <InPlainWords>
          <p>
            Suppose you hold a payer swaption with strike 3.5%, and at expiry the 5-year swap rate is 4.5%. You exercise and pay
            3.5% instead of the market's 4.5%, saving 1% a year for 5 years. That saving is worth{' '}
            <strong>1% × annuity × notional</strong>. If the swap rate ends below 3.5%, you don't exercise and get nothing.
          </p>
          <p style={{ marginBottom: 0 }}>
            So the swaption pays <em>annuity × max(swap rate − K, 0)</em>. That is a call option on the swap rate, multiplied by the
            annuity. And just as with caplets, we price it with Black-76 or Bachelier on the forward swap rate, using the annuity in
            place of the discount factor.
          </p>
        </InPlainWords>
        <TexBlock>{String.raw`\text{Payer} = A_0\,\text{Black}(S_0, K, T_e, \sigma), \qquad \text{Receiver} = A_0\,\text{Black}_{\text{put}}(S_0, K, T_e, \sigma)`}</TexBlock>
        <Symbols
          items={[
            ['K', 'Strike: the fixed rate you get the right to pay (payer) or receive (receiver)'],
            [String.raw`\sigma`, 'Volatility of the swap rate (normal vol in bp, or Black vol in %)'],
            [String.raw`\text{Black}(\cdot)`, 'The forward-option formula from module 3 (Black-76 or Bachelier)'],
            ['A_0', 'Annuity: takes the place of the discount factor, because the payoff is received every year of the swap'],
          ]}
        />
        <Example title={`Worked example: a ${expiry}Y × ${tenor}Y ${type} swaption on €10m (uses the controls below)`}>
          <table>
            <tbody>
              <tr><td>Forward swap rate today</td><td>{pct(S0, 3)}</td></tr>
              <tr><td>Strike</td><td>{pct(K, 3)}</td></tr>
              <tr><td>If the swap rate ends 1% {type === 'payer' ? 'above' : 'below'} the strike, the option is worth</td><td>1% × annuity {num(A, 3)} × €10m ≈ €{num(0.01 * A * 1e7, 0)}</td></tr>
              <tr><td><strong>Fair price today</strong></td><td><strong>€{num(price * 1e7, 0)}</strong> ({num(price * 1e4, 1)}bp of notional)</td></tr>
            </tbody>
          </table>
        </Example>
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
        <InPlainWords>
          Brokers quote swaption prices as <Term name="Implied volatility">implied normal vols</Term>, in bp per year: the vol that
          makes the formula above reproduce the market price. There is one quote for each combination of option expiry (rows)
          and swap length (columns). Read a cell as "the market expects this swap rate to move about this many bp per year". The
          table is like a weather map of how uncertain the market is about rates over different horizons.
        </InPlainWords>
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

      <Takeaways
        items={[
          'A swaption is the right to enter a swap at a fixed rate agreed today. Payer = right to pay fixed (gains if rates rise); receiver = right to receive fixed (gains if rates fall).',
          'The underlying is the forward swap rate: the fair fixed rate for the future swap, seen today.',
          'Payoff = annuity × max(swap rate − K, 0) for a payer. Price = annuity × Black/Bachelier formula on the forward swap rate.',
          'Payer − receiver = annuity × (S₀ − K). At the money they cost the same, and a straddle costs about 0.8 × A × σN × √T.',
          'The market quotes swaptions as a grid of normal vols by expiry and swap length.',
        ]}
      />

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
