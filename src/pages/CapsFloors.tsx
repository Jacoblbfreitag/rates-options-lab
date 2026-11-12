import { useMemo, useState } from 'react';
import type { Data } from 'plotly.js';
import { Chart, line, linspace } from '../components/Chart';
import { Playground, Slider, Stats, Toggle, bp, num, pct } from '../components/Controls';
import { Tex, TexBlock } from '../components/Formula';
import { CodeRef, LessonFooter, LessonHeader, Note, Quiz, Section, TryThis } from '../components/Lesson';
import { baseCurve } from '../data/curves';
import { capFlatNormalVols } from '../data/market';
import { bachelier, black76, impliedNormalVol, type VolModel } from '../models/black76';
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
        <p>
          A <strong>cap</strong> protects a floating-rate borrower: every period, if the rate fixes above the strike, the cap
          pays the difference. Each period is a separate option, a <strong>caplet</strong>. Caplet <Tex>i</Tex> fixes at{' '}
          <Tex>{'t_i'}</Tex> and pays at <Tex>{String.raw`t_{i+1}=t_i+\tau`}</Tex>:
        </p>
        <TexBlock>{String.raw`\text{payoff}_i = N\,\tau\,\max(F_i(t_i) - K, 0) \quad\Longrightarrow\quad \text{Caplet}_i = N\,\tau\,P(0,t_{i+1})\;\text{Black}(F_i(0), K, t_i, \sigma_i)`}</TexBlock>
        <p>
          So a caplet is simply a call on a forward rate, priced with the forward-option formulas, discounted from the payment
          date and scaled by the accrual <Tex>{String.raw`\tau`}</Tex>. A <strong>floor</strong> is the same strip of puts and
          protects an investor in floating-rate assets.
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
        <p>
          Until about 2015 caps were quoted in <strong>Black (lognormal) vols</strong>. Rates near zero broke this: a lognormal
          rate can never go negative, and the Black vol of a low-strike option explodes. The market switched to{' '}
          <strong>normal (Bachelier) vols</strong>, quoted in bp per year, which handle negative rates naturally.
        </p>
        <TexBlock>{String.raw`\text{Bachelier: } (F-K)N(d) + \sigma_N\sqrt{T}\,n(d), \quad d=\frac{F-K}{\sigma_N\sqrt T}; \qquad \sigma_N \approx \sigma_B \cdot F \text{ at the money}`}</TexBlock>
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
        <p>
          A long cap plus a short floor at the same strike pays <Tex>{String.raw`\tau(F_i - K)`}</Tex> every period: a payer swap.
          This holds for any model:
        </p>
        <TexBlock>{String.raw`\text{Cap}(K) - \text{Floor}(K) = \text{Payer swap}(K) = \sum_i \tau\, P(0,t_{i+1})\,(F_i - K)`}</TexBlock>
        <Stats
          items={[
            { label: 'Cap − Floor', value: `${num((capType === 'cap' ? cap.total - other.total : other.total - cap.total) * 1e4, 6)}bp` },
            { label: 'Payer swap', value: `${num(swap * 1e4, 6)}bp` },
          ]}
        />
        <p>
          It follows that the <strong>ATM strike</strong> (cap = floor) is the forward swap rate over the caplet dates. Markets
          quote ATM caps as straddles (cap + floor) because a straddle has almost no delta, which makes it a pure vol trade.
        </p>
      </Section>

      <Section title="4. Stripping caplet vols">
        <p>
          The market quotes one <strong>flat vol</strong> per cap maturity: the single vol which, applied to every caplet,
          gives the cap's price. Flat vols are averages, though. To price anything else you need the vol of each individual
          caplet, the <strong>spot vol</strong>. We bootstrap them just like the curve: the 1Y cap gives the first caplets' vol;
          the 2Y cap minus those known caplets gives the 1Y–2Y caplets; and so on.
        </p>
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
