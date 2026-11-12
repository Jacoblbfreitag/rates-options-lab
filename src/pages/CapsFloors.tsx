import { useMemo, useState } from 'react';
import type { Data } from 'plotly.js';
import { Chart, line, linspace } from '../components/Chart';
import { Playground, Slider, Stats, Toggle, bp, num, pct } from '../components/Controls';
import { TexBlock } from '../components/Formula';
import { CodeRef, Example, InPlainWords, LessonFooter, LessonHeader, Note, Quiz, Section, Symbols, Takeaways, Term, TryThis } from '../components/Lesson';
import { baseCurve } from '../data/curves';
import { capFlatNormalVols } from '../data/market';
import { bachelier, black76, forwardOption, impliedNormalVol, type VolModel } from '../models/black76';
import { atmCapStrike, capPrice, capSwapValue, stripCapletVols, type CapType } from '../models/capfloor';

export default function CapsFloors() {
  // ── Section 1: strip of caplets ──
  const [capType, setCapType] = useState<CapType>('cap');
  const [maturity, setMaturity] = useState(5);
  const [strike, setStrike] = useState(0.035);
  const [model, setModel] = useState<VolModel>('normal');
  const [normalVol, setNormalVol] = useState(0.01);
  const [blackVol, setBlackVol] = useState(0.28);
  const vol = model === 'normal' ? normalVol : blackVol;

  const cap = useMemo(() => capPrice(baseCurve, maturity, strike, vol, model, capType), [maturity, strike, vol, model, capType]);
  const other = useMemo(
    () => capPrice(baseCurve, maturity, strike, vol, model, capType === 'cap' ? 'floor' : 'cap'),
    [maturity, strike, vol, model, capType],
  );
  const swap = capSwapValue(baseCurve, maturity, strike);
  const atm = atmCapStrike(baseCurve, maturity);

  // A single caplet for the worked example: €10m, fixing in 2Y, paid at 2.25Y.
  const ex = useMemo(() => {
    const N = 10_000_000;
    const F0 = baseCurve.fwd(2, 2.25);
    const df = baseCurve.df(2.25);
    const price = forwardOption(model, capType === 'cap' ? 'call' : 'put', F0, strike, 2, vol, N * 0.25 * df);
    return { N, F0, df, price };
  }, [model, capType, strike, vol]);

  const stripChart: Data[] = [
    {
      x: cap.caplets.map((c) => c.reset),
      y: cap.caplets.map((c) => c.price * 1e4),
      type: 'bar',
      name: 'Caplet price (bp of notional)',
      marker: { color: '#1f6fb4' },
    } as Data,
    line(cap.caplets.map((c) => c.reset), cap.caplets.map((c) => c.forward * 100), '3M forward rate (%)', { yaxis: 'y2', line: { color: '#e08a1e' } }),
    line([0, maturity], [strike * 100, strike * 100], 'Strike (%)', { yaxis: 'y2', line: { dash: 'dash', color: '#c2453c' } }),
  ];

  // ── Section 2: Black vs Bachelier ──
  const [F, setF] = useState(0.03);
  const [T2, setT2] = useState(2);
  const [sigmaN2, setSigmaN2] = useState(0.01);
  const sigmaB2 = sigmaN2 / Math.max(F, 1e-6); // ATM-equivalent Black vol (first-order)
  const strikes = useMemo(() => linspace(-0.01, 0.08, 181), []);
  const modelChart = useMemo(() => {
    const nPrices = strikes.map((k) => bachelier('call', F, k, T2, sigmaN2) * 1e4);
    const bPrices = strikes.map((k) => black76('call', F, k, T2, sigmaB2) * 1e4);
    return [line(strikes.map((k) => k * 100), nPrices, 'Bachelier (normal)'), line(strikes.map((k) => k * 100), bPrices, 'Black-76 (lognormal)')];
  }, [F, T2, sigmaN2, sigmaB2, strikes]);
  const impliedChart = useMemo(() => {
    const ks = strikes.filter((k) => k > 0.002);
    return [
      line(ks.map((k) => k * 100), ks.map(() => sigmaN2 * 1e4), 'Bachelier: flat by construction'),
      line(
        ks.map((k) => k * 100),
        ks.map((k) => {
          const p = black76(k < F ? 'put' : 'call', F, k, T2, sigmaB2);
          return impliedNormalVol(k < F ? 'put' : 'call', p, F, k, T2) * 1e4;
        }),
        'Black-76 expressed as normal vol',
      ),
    ];
  }, [F, T2, sigmaN2, sigmaB2, strikes]);

  // ── Section 4: stripping ──
  const [stripK, setStripK] = useState(0.035);
  const stripped = useMemo(() => stripCapletVols(baseCurve, capFlatNormalVols, stripK, 'normal'), [stripK]);
  const strippingChart: Data[] = [
    {
      x: capFlatNormalVols.map((q) => q.maturity),
      y: capFlatNormalVols.map((q) => q.vol * 1e4),
      name: 'Flat cap vol (by cap maturity)',
      type: 'scatter',
      mode: 'lines+markers',
      line: { color: '#5f6b7a', dash: 'dot' },
    } as Data,
    line(stripped.map((s) => s.reset), stripped.map((s) => s.vol * 1e4), 'Stripped caplet (spot) vol (by reset)', {
      line: { shape: 'hv', color: '#1f6fb4', width: 3 },
    }),
  ];

  return (
    <article>
      <LessonHeader id="caps" />

      <Section title="1. A cap is a strip of caplets">
        <InPlainWords>
          <p>
            Remember the company from module 0 with a €10m floating-rate loan. Every three months its interest rate is reset
            to the market rate (SOFR) for the next quarter. A <Term name="Cap">cap</Term> at 3.5% is a promise: whenever a
            quarterly rate is set above 3.5%, the cap pays the company the difference for that quarter. The company never
            effectively pays more than 3.5%.
          </p>
          <p style={{ marginBottom: 0 }}>
            Each quarter is a separate little insurance contract, called a <Term name="Caplet">caplet</Term>. A 5-year cap
            on quarterly payments is a bundle of 19 caplets (the first quarter's rate is already known today, so there is
            nothing to insure). To price the cap, price each caplet and add them up.
          </p>
        </InPlainWords>
        <p>
          What does a caplet look like as an option? Its payoff depends on the interest rate that will be set for one future
          quarter. Today we don't know that rate, but we do know the <Term name="Forward rate">forward rate</Term> for that quarter
          (module 2). So a caplet is simply a <strong>call option on a forward rate</strong>, and we can price it with a
          Black–Scholes-type formula applied to the forward rate:
        </p>
        <TexBlock>{String.raw`\text{payoff}_i = N\,\tau\,\max(F_i(t_i) - K, 0) \quad\Longrightarrow\quad \text{Caplet}_i = N\,\tau\,P(0,t_{i+1})\;\text{Black}(F_i(0), K, t_i, \sigma_i)`}</TexBlock>
        <Symbols
          items={[
            ['N', 'Notional: the loan amount the interest is calculated on (e.g. €10m)'],
            [String.raw`\tau`, 'Length of the period in years: 0.25 for a quarter'],
            [String.raw`t_i,\ t_{i+1}`, 'When the rate is set (the caplet’s expiry) and when the interest is paid (one quarter later)'],
            [String.raw`F_i(t_i)`, 'The rate that will actually be set at t_i (unknown today)'],
            [String.raw`F_i(0)`, 'Today’s forward rate for that quarter: our best market estimate of it'],
            [String.raw`P(0,t_{i+1})`, 'Discount factor: the payment happens at t_{i+1}, so we discount from there'],
            [String.raw`\sigma_i`, 'Volatility of that forward rate'],
            [String.raw`\text{Black}(\cdot)`, 'The option formula on a forward: Black-76 or Bachelier (section 2)'],
          ]}
        />
        <Example title={`Worked example: one ${capType === 'cap' ? 'caplet' : 'floorlet'} on €10m (uses the controls below)`}>
          <p>
            Take the quarter from year 2 to year 2.25. Today's forward rate for it is <strong>{pct(ex.F0, 3)}</strong> and the strike is{' '}
            <strong>{pct(strike, 2)}</strong>. If in two years the rate is actually set at{' '}
            {pct(capType === 'cap' ? strike + 0.01 : strike - 0.01, 2)} (1% {capType === 'cap' ? 'above' : 'below'} the strike), the{' '}
            {capType === 'cap' ? 'caplet' : 'floorlet'} pays €10m × 0.25 × 1% = <strong>€25,000</strong>.
          </p>
          <p style={{ marginBottom: 0 }}>
            Its fair price today = €10m × 0.25 × discount factor {num(ex.df, 4)} × the option value per unit of rate ={' '}
            <strong>€{num(ex.price, 0)}</strong>. The bar chart below shows this calculation repeated for every quarter of the cap.
          </p>
        </Example>
        <p>
          A <Term name="Floor">floor</Term> is the mirror image: a bundle of puts on forward rates. It protects a lender (or an investor
          in floating-rate bonds) against rates falling below the strike.
        </p>
        <Playground
          controls={
            <>
              <Toggle value={capType} onChange={setCapType} options={[{ value: 'cap', label: 'Cap' }, { value: 'floor', label: 'Floor' }]} />
              <Toggle label="Model" value={model} onChange={setModel} options={[{ value: 'normal', label: 'Bachelier' }, { value: 'black', label: 'Black-76' }]} />
              <Slider label="Maturity" value={maturity} min={1} max={10} step={1} onChange={setMaturity} format={(v) => `${v}Y`} />
              <Slider label="Strike" value={strike} min={0.005} max={0.07} step={0.0005} onChange={setStrike} format={(v) => pct(v, 2)} />
              {model === 'normal' ? (
                <Slider label="Normal vol σN" value={normalVol} min={0.002} max={0.025} step={0.0005} onChange={setNormalVol} format={(v) => bp(v)} />
              ) : (
                <Slider label="Black vol σ" value={blackVol} min={0.05} max={0.8} step={0.01} onChange={setBlackVol} format={(v) => pct(v, 0)} />
              )}
              <button type="button" className="link-button" onClick={() => setStrike(Math.round(atm * 2000) / 2000)}>
                Set strike to ATM ({pct(atm, 2)})
              </button>
            </>
          }
        >
          <Stats
            items={[
              { label: `${capType === 'cap' ? 'Cap' : 'Floor'} price`, value: `${num(cap.total * 1e4, 1)}bp`, hint: 'of notional, upfront' },
              { label: 'Caplets', value: String(cap.caplets.length), hint: 'quarterly, first fixing excluded' },
              { label: 'ATM strike', value: pct(atm, 3), hint: 'forward swap rate of the caplet strip' },
            ]}
          />
          <Chart
            data={stripChart}
            x="Caplet reset (years)"
            y="Caplet price (bp)"
            layout={{ yaxis2: { overlaying: 'y', side: 'right', title: { text: 'Rate (%)', standoff: 12 }, showgrid: false, automargin: true }, bargap: 0.15 }}
          />
        </Playground>
        <TryThis
          items={[
            'Why are the early caplets cheap even though the front forwards are high? Less time to expiry means less optionality: price grows roughly with σ√t. Now lower the strike to 2% and watch intrinsic value take over.',
            'Switch to a floor. The value now sits in the periods where the forwards are below the strike.',
            'Click "Set strike to ATM" and compare cap and floor prices. They are equal — see section 3.',
          ]}
        />
      </Section>

      <Section title="2. Black-76 or Bachelier?">
        <InPlainWords>
          <p>To price an option on a rate we must say how the rate moves randomly. There are two standard assumptions:</p>
          <ul>
            <li>
              <Term name="Black-76">Black-76</Term> (lognormal): rates move in <strong>percentages</strong> of their level, like share
              prices in Black–Scholes. A 20% vol means a 4% rate typically moves ±0.8% in a year, but a 1% rate only ±0.2%.
              A rate can then never fall below zero.
            </li>
            <li>
              <Term name="Bachelier model">Bachelier</Term> (normal): rates move by a fixed number of{' '}
              <Term name="Basis point (bp)">basis points</Term>, whatever their level. A vol of 100bp means a typical move of
              ±1% a year, whether the rate is 4% or 0.5%. The rate <em>can</em> go negative.
            </li>
          </ul>
          <p style={{ marginBottom: 0 }}>
            From 2014 to 2022 euro and yen rates were <em>negative</em>, which the lognormal model cannot handle at all. The market therefore
            switched to quoting rate vols as <Term name="Normal volatility">normal vols</Term> in bp, and that is today's standard.
          </p>
        </InPlainWords>
        <TexBlock>{String.raw`\text{Bachelier: } (F-K)N(d) + \sigma_N\sqrt{T}\,n(d), \quad d=\frac{F-K}{\sigma_N\sqrt T}; \qquad \sigma_N \approx \sigma_B \cdot F \text{ at the money}`}</TexBlock>
        <Symbols
          items={[
            [String.raw`\sigma_N`, 'Normal vol: typical yearly move of the rate in absolute terms (100bp = 1% = 0.01)'],
            [String.raw`\sigma_B`, 'Black (lognormal) vol: typical yearly move as a percentage of the rate level'],
            ['n(d)', 'The height of the bell curve at d (N is the area, n is the height)'],
            ['d', 'How many standard deviations the forward is above the strike'],
          ]}
        />
        <p>
          The left chart prices a call on a rate with both models, using vols that agree at the money. The right chart converts
          the Black prices into normal vols, so it shows what the lognormal model "believes" in bp terms.
        </p>
        <Playground
          controls={
            <>
              <Slider label="Forward F" value={F} min={-0.01} max={0.06} step={0.0005} onChange={setF} format={(v) => pct(v, 2)} />
              <Slider label="Expiry T" value={T2} min={0.25} max={10} step={0.25} onChange={setT2} format={(v) => `${v}y`} />
              <Slider label="Normal vol σN" value={sigmaN2} min={0.002} max={0.02} step={0.0005} onChange={setSigmaN2} format={(v) => bp(v)} />
              <div className="muted" style={{ fontSize: 13 }}>
                ATM-equivalent Black vol: <strong>{F > 0 ? pct(sigmaB2, 1) : 'undefined (F ≤ 0)'}</strong>
              </div>
            </>
          }
        >
          <div className="grid-2">
            <Chart data={modelChart} x="Strike (%)" y="Call price (bp)" />
            <Chart data={impliedChart} x="Strike (%)" y="Normal vol (bp)" />
          </div>
        </Playground>
        <Note title="What the right-hand chart shows">
          If you price with Black-76 and translate the prices back into normal vols, you get a <strong>skew</strong>: the
          lognormal model gives low strikes less vol and high strikes more, in bp terms. Each model therefore carries its own
          built-in smile, and neither is "flat" in the other's units. The real market smile (module 5) sits somewhere between the two.
        </Note>
        <TryThis
          items={[
            'Drag F below zero. The Black curve vanishes: ln(F/K) is undefined. Bachelier keeps working.',
            'Set F = 0.5%. The ATM-equivalent Black vol is 200%. This is why lognormal quotes became meaningless in 2015–2021.',
          ]}
        />
        <CodeRef file="src/models/black76.ts" />
      </Section>

      <Section title="3. Cap–floor parity">
        <InPlainWords>
          This is put–call parity from module 1, in interest-rate form. Buy a cap and sell a floor at the same strike, say 3.5%.
          If the rate is set at 5%, the cap pays you 1.5%. If it is set at 2%, you pay the floor buyer 1.5%. Either way you
          receive "rate − 3.5%" every quarter. That is exactly a swap where you pay a fixed 3.5% and receive the floating rate.
        </InPlainWords>
        <TexBlock>{String.raw`\text{Cap}(K) - \text{Floor}(K) = \text{Payer swap}(K) = \sum_i \tau\, P(0,t_{i+1})\,(F_i - K)`}</TexBlock>
        <Stats
          items={[
            { label: 'Cap − Floor', value: `${num((capType === 'cap' ? cap.total - other.total : other.total - cap.total) * 1e4, 6)}bp` },
            { label: 'Payer swap', value: `${num(swap * 1e4, 6)}bp` },
          ]}
        />
        <p>
          A consequence: when the strike equals the swap rate for the same dates, the swap is worth zero, so cap = floor. That
          strike is called the <Term name="At the money (ATM)">at-the-money</Term> (ATM) strike. Markets quote ATM caps as{' '}
          <Term name="Straddle">straddles</Term> (cap + floor). A straddle gains whichever way rates move, so it is a pure bet
          on <em>how much</em> rates will move, not on their direction.
        </p>
      </Section>

      <Section title="4. Stripping caplet vols">
        <InPlainWords>
          <p>
            Brokers quote each cap with one number, its <Term name="Flat vol">flat vol</Term>: the single volatility that, used
            for every caplet in the cap, gives the cap's market price. But the caplets in a 5-year cap don't really all have the
            same volatility. The flat vol is a kind of <em>average</em>.
          </p>
          <p style={{ marginBottom: 0 }}>
            To price anything other than these exact caps, we need each caplet's own vol, its{' '}
            <Term name="Spot vol">spot vol</Term>. We recover them exactly as we bootstrapped the curve in module 2. The 1Y cap
            gives the vol of the caplets in year 1. The 2Y cap price minus those (now known) caplets gives the vol of the year-2
            caplets. And so on.
          </p>
        </InPlainWords>
        <Example title="Worked example: averages and their parts">
          Two exams: your average after exam 1 is 6.0, and after exam 2 it is 7.0. What did you get on exam 2? To lift the average
          from 6 to 7, exam 2 must have been <strong>8</strong>, more extreme than either average. Caplet stripping is the same
          calculation with option prices, and that is why the spot vols (blue staircase) swing more than the flat vols (grey).
        </Example>
        <Playground
          controls={
            <>
              <Slider label="Strike used for stripping" value={stripK} min={0.02} max={0.05} step={0.0025} onChange={setStripK} format={(v) => pct(v, 2)} />
              <table className="data">
                <thead>
                  <tr>
                    <th>Cap</th>
                    <th>Flat vol</th>
                  </tr>
                </thead>
                <tbody>
                  {capFlatNormalVols.map((q) => (
                    <tr key={q.maturity}>
                      <td>{q.maturity}Y</td>
                      <td>{bp(q.vol)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          }
        >
          <Chart data={strippingChart} x="Years" y="Normal vol (bp)" />
        </Playground>
        <Note title="Why spot vols overshoot">
          The 3Y flat vol (108bp) is the average over caplets that include the cheaper 1Y caplets (95bp). For the average to be
          108, the 2Y–3Y caplets must be even higher. Spot vols are always more extreme than flat vols, just as forward rates
          are more extreme than zero rates. This humped vol term structure is what the LMM's "abcd" function fits in module 7.
        </Note>
        <CodeRef file="src/models/capfloor.ts">See stripCapletVols().</CodeRef>
      </Section>

      <Takeaways
        items={[
          'A cap is insurance for a borrower against high rates. It is a bundle of caplets, one for each interest period. A floor is the same for a lender against low rates.',
          'Each caplet is a call option on a forward rate: price it with Black-76 or Bachelier on the forward, discount from the payment date, and multiply by notional × period length.',
          'Black-76 assumes rates move in percentages (no negative rates). Bachelier assumes they move in basis points (negative rates allowed). Today the market quotes normal (bp) vols.',
          'Cap − floor = swap. At the ATM strike the cap and floor cost the same.',
          'Flat vols are averages over a cap’s caplets. Stripping recovers each caplet’s own (spot) vol, one maturity at a time.',
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'A 5Y quarterly cap (first fixing excluded) contains how many caplets?',
            options: ['5', '19', '20', '21'],
            answer: 1,
            why: '20 quarterly periods, minus the first one whose rate is already fixed today.',
          },
          {
            q: 'Why is the caplet discounted from t_{i+1} and not from t_i?',
            options: ['Convention only', 'Because the payoff fixes at t_i but is paid at the end of the period, t_{i+1}', 'Because of convexity', 'To include the accrual'],
            answer: 1,
            why: 'The rate is set at the start of the period but the interest is paid at the end. Working in the t_{i+1}-forward measure makes F_i driftless, which is exactly why Black-76 applies.',
          },
          {
            q: 'Forward = 0.5%, strike = 0.5%, normal vol = 100bp. What is the ATM Black vol?',
            options: ['About 20%', 'About 100%', 'About 200%', 'Undefined'],
            answer: 2,
            why: 'σ_B ≈ σ_N / F = 1.00% / 0.5% = 200%. Low rates make lognormal vols huge and unstable.',
          },
          {
            q: 'Flat cap vols are: 1Y 95bp, 2Y 105bp. The stripped 1Y–2Y caplet vols are…',
            options: ['Below 95bp', 'Between 95 and 105bp', 'Above 105bp', 'Exactly 100bp'],
            answer: 2,
            why: 'The 2Y flat vol is a blend of the 0–1Y caplets (95) and the 1–2Y caplets, so the 1–2Y caplets must be above 105 to lift the average.',
          },
        ]}
      />
      <LessonFooter id="caps" />
    </article>
  );
}
