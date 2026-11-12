import { useMemo, useState } from 'react';
import { Chart, line, linspace } from '../components/Chart';
import { Playground, Slider, Stats, Toggle, bp, num, pct } from '../components/Controls';
import { Tex, TexBlock } from '../components/Formula';
import { CodeRef, Example, InPlainWords, LessonFooter, LessonHeader, Note, Quiz, Section, Symbols, Takeaways, Term, TryThis } from '../components/Lesson';
import { sofrInstruments } from '../data/market';
import { annuity, bootstrap, instrumentRate, parSwapRate, type Curve } from '../models/curve';

const grid = linspace(0.02, 30, 300);

function curveTraces(curve: Curve, suffix = '', dash?: string) {
  const style = dash ? { line: { dash } } : {};
  return [
    line(grid, grid.map((t) => curve.zero(t) * 100), `Zero rate${suffix}`, style),
    line(grid, grid.map((t) => curve.fwd(t, t + 0.25) * 100), `3M forward${suffix}`, style),
  ];
}

export default function Curves() {
  // ── Section 2: editable quotes ──
  const [quotes, setQuotes] = useState(sofrInstruments.map((i) => i.rate));
  const instruments = useMemo(() => sofrInstruments.map((inst, i) => ({ ...inst, rate: quotes[i] })), [quotes]);
  const curve = useMemo(() => bootstrap(instruments), [instruments]);

  // ── Section 1: view ──
  const [view, setView] = useState<'rates' | 'df'>('rates');
  const ratesChart = useMemo(
    () => [
      ...curveTraces(curve),
      line(grid, grid.map((t) => curve.instFwd(t) * 100), 'Instantaneous forward', { line: { width: 1, dash: 'dot' } }),
    ],
    [curve],
  );
  const dfChart = useMemo(() => [line(grid, grid.map((t) => curve.df(t)), 'Discount factor P(0,t)')], [curve]);

  // ── Section 3: shifts ──
  const [shiftType, setShiftType] = useState<'parallel' | 'steepener' | 'butterfly'>('parallel');
  const [size, setSize] = useState(0.005);
  const shifted = useMemo(
    () =>
      curve.shifted((t) => {
        const tt = Math.min(t, 30);
        if (shiftType === 'parallel') return size;
        if (shiftType === 'steepener') return (size * (tt - 10)) / 20; // pivots at 10Y
        return size * (Math.abs(tt - 7) / 7 - 0.5); // wings up, belly (7Y) down
      }),
    [curve, shiftType, size],
  );
  const shiftChart = useMemo(
    () => [...curveTraces(curve, ' (base)', 'dot'), ...curveTraces(shifted, ' (shifted)')],
    [curve, shifted],
  );
  const swapRate5 = parSwapRate(curve, 0, 5, 1);
  const swapRate10 = parSwapRate(curve, 0, 10, 1);
  // A 10Y payer swap struck at today's par rate: PV after the shift.
  const pv10 = (parSwapRate(shifted, 0, 10, 1) - swapRate10) * annuity(shifted, 0, 10, 1);

  return (
    <article>
      <LessonHeader id="curves" />

      <Section title="1. Discount factors, zero rates and forward rates">
        <InPlainWords>
          <p>
            Module 0 discounted with one interest rate for all dates. In reality, the interest rate depends on <em>how long</em>{' '}
            you borrow for: today you might get 3.9% for one month, 3.6% for one year and 3.7% for ten years. The{' '}
            <strong>yield curve</strong> is the list of these rates by maturity. Equivalently, it is the list of{' '}
            <em>prices of money at each future date</em>.
          </p>
          <p style={{ marginBottom: 0 }}>
            The basic object is the <Term name="Discount factor">discount factor</Term> <Tex>{'P(0,t)'}</Tex>: the value today
            of €1 paid at time t. It is also the price of a <Term name="Bond">zero-coupon bond</Term>. Every rate below is just
            a different way of expressing the same discount factors.
          </p>
        </InPlainWords>
        <h3>Three ways to describe the same curve</h3>
        <ul>
          <li>
            <strong>Discount factor</strong> <Tex>{'P(0,t)'}</Tex>: today's price of €1 at time t. On this curve, €1 in 2 years
            costs €{num(curve.df(2), 4)} today.
          </li>
          <li>
            <Term name="Zero rate">Zero rate</Term> <Tex>{'z(t)'}</Tex>: the single average interest rate from today to t that
            gives that price. Here <Tex>{`z(2) = ${pct(curve.zero(2), 3).replace('%', '\\%')}`}</Tex>.
          </li>
          <li>
            <Term name="Forward rate">Forward rate</Term> <Tex>{'F(t_1,t_2)'}</Tex>: the interest rate you can <em>lock in
            today</em> for a loan that starts at <Tex>{'t_1'}</Tex> and ends at <Tex>{'t_2'}</Tex>. Forward rates are what
            interest rate options are written on (modules 3–7), so this is the key concept of the module.
          </li>
        </ul>
        <TexBlock>{String.raw`z(t) = -\frac{\ln P(0,t)}{t}, \qquad F(t_1,t_2) = \frac{1}{t_2-t_1}\left(\frac{P(0,t_1)}{P(0,t_2)} - 1\right)`}</TexBlock>
        <Symbols
          items={[
            ['P(0,t)', 'Discount factor: value today (time 0) of €1 paid at time t'],
            ['z(t)', 'Zero rate to time t (continuously compounded, so that P = e^{−z·t})'],
            ['F(t_1,t_2)', 'Forward rate for the period from t₁ to t₂, simple interest (like a bank loan)'],
            ['t_2 - t_1', 'Length of the forward period in years'],
          ]}
        />
        <Example title="Worked example: where does a forward rate come from? (no arbitrage again)">
          <p>You want to invest €100 for 2 years. There are two ways:</p>
          <table>
            <tbody>
              <tr>
                <td><strong>A.</strong> Invest for 2 years directly</td>
                <td>€100 / P(0,2) = 100 / {num(curve.df(2), 4)} = <strong>€{num(100 / curve.df(2), 2)}</strong></td>
              </tr>
              <tr>
                <td><strong>B.</strong> Invest for 1 year, and agree <em>today</em> to reinvest for year 2 at rate F</td>
                <td>€100 / P(0,1) × (1 + F) = {num(100 / curve.df(1), 2)} × (1 + F)</td>
              </tr>
            </tbody>
          </table>
          <p style={{ marginBottom: 0 }}>
            Both are riskless, so they must give the same amount, otherwise you could borrow one way and lend the other for a
            free profit. Setting them equal gives{' '}
            <strong>F = P(0,1)/P(0,2) − 1 = {pct(curve.fwd(1, 2), 3)}</strong>, the 1-year rate one year from now that the market
            has "built in" today. That is exactly the formula above.
          </p>
        </Example>
        <Toggle value={view} onChange={setView} options={[{ value: 'rates', label: 'Rates' }, { value: 'df', label: 'Discount factors' }]} />
        {view === 'rates' ? <Chart data={ratesChart} x="Maturity (years)" y="Rate (%)" /> : <Chart data={dfChart} x="Maturity (years)" y="P(0,t)" />}
        <p>
          Note how the forwards (orange) swing more than the zero rates (blue). A zero rate is an <em>average</em> of the forward
          rates up to that date, and averages move less than their parts, just as a running average of exam grades moves less than the
          individual grades. When the curve slopes upward, the forward is above the zero rate.
        </p>
        <Note title="Why are the instantaneous forwards a staircase?">
          The curve only has data at a few maturities (the "pillars"). In between, this app assumes the forward rate is constant,
          which gives the staircase. Banks use smoother interpolation methods, but the choice is a real modelling decision.
        </Note>
      </Section>

      <Section title="2. Building the curve from market prices (bootstrapping)">
        <InPlainWords>
          <p>
            Nobody quotes discount factors directly. The market quotes <strong>deposits</strong> (simple loans up to a year) and{' '}
            <Term name="Interest rate swap">interest rate swaps</Term> for longer maturities.
          </p>
          <p style={{ marginBottom: 0 }}>
            A swap is an exchange of interest payments. On €10m for 5 years, one side pays a <strong>fixed</strong> rate (say
            3.45% = €345,000 a year), and the other pays the <strong>floating</strong> rate (SOFR, which changes every period). The
            quoted <Term name="Par swap rate">swap rate</Term> is the fixed rate that makes this exchange <em>fair today</em>, so
            that both legs have the same present value. Each swap rate is therefore an equation involving discount factors.{' '}
            <Term name="Bootstrapping">Bootstrapping</Term> solves these equations one at a time, shortest first, like a puzzle
            where every piece you place helps you find the next.
          </p>
        </InPlainWords>
        <TexBlock>{String.raw`S_{\text{par}}(T) = \frac{1 - P(0,T)}{\sum_{i=1}^{n} \tau_i\, P(0,t_i)} \quad\Longrightarrow\quad \text{solve for } P(0,T)`}</TexBlock>
        <Symbols
          items={[
            [String.raw`S_{\text{par}}(T)`, 'The quoted swap rate for maturity T'],
            ['1 - P(0,T)', 'Value of the floating leg: receiving €1 today and repaying it at T'],
            [String.raw`\tau_i`, 'Length of fixed-payment period i (here 1 year: annual payments)'],
            [String.raw`\sum \tau_i P(0,t_i)`, <>The <Term name="Annuity">annuity</Term>: value of receiving €1 per year on every fixed payment date</>],
          ]}
        />
        <Example title="Worked example: the first two steps">
          <p>
            <strong>Step 1, the 1Y swap at {pct(quotes[3], 2)}</strong>. It has one annual payment, so the formula reads{' '}
            <Tex>{'S = (1-P_1)/P_1'}</Tex>. Solving: P(0,1) = 1 / (1 + {num(quotes[3], 4)}) ={' '}
            <strong>{num(1 / (1 + quotes[3]), 6)}</strong>.
          </p>
          <p>
            <strong>Step 2, the 2Y swap at {pct(quotes[4], 2)}</strong>. Now <Tex>{'S = (1-P_2)/(P_1+P_2)'}</Tex>. We already
            know P₁ from step 1, so only P₂ is unknown: P(0,2) = (1 − S·P₁)/(1 + S) ={' '}
            <strong>{num((1 - quotes[4] / (1 + quotes[3])) / (1 + quotes[4]), 6)}</strong>.
          </p>
          <p style={{ marginBottom: 0 }}>
            The curve built by the app gives P(0,1) = {num(curve.df(1), 6)} and P(0,2) = {num(curve.df(2), 6)}, the same numbers.
            Every longer swap works the same way, with one new unknown per step.
          </p>
        </Example>
        <p>Edit any quote below and watch the curve rebuild. The last column shows that every quote is matched exactly.</p>
        <div className="grid-2">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Instrument</th>
                  <th>Quote (%)</th>
                  <th>Zero (%)</th>
                  <th>Reprice error</th>
                </tr>
              </thead>
              <tbody>
                {instruments.map((inst, i) => (
                  <tr key={inst.label}>
                    <td>
                      {inst.label} {inst.kind}
                    </td>
                    <td>
                      <input
                        type="number"
                        step={0.05}
                        value={(quotes[i] * 100).toFixed(2)}
                        onChange={(e) => {
                          const v = Number(e.target.value) / 100;
                          if (Number.isFinite(v)) setQuotes((q) => q.map((x, j) => (j === i ? v : x)));
                        }}
                        style={{ width: 70, textAlign: 'right' }}
                      />
                    </td>
                    <td>{(curve.zero(inst.tenor) * 100).toFixed(3)}</td>
                    <td>{(instrumentRate(curve, inst) - inst.rate).toExponential(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="link-button" type="button" onClick={() => setQuotes(sofrInstruments.map((i) => i.rate))}>
              Reset quotes
            </button>
          </div>
          <Chart data={curveTraces(curve)} x="Maturity (years)" y="Rate (%)" />
        </div>
        <TryThis
          items={[
            'Raise only the 7Y swap by 0.50%. The forwards between 5Y and 7Y jump by much more than 0.50%, then fall back after 7Y. A small change in an average needs a large change in the last part of it.',
            'Make the 2Y swap higher than the 1Y. The dip at the front of the curve (an "inverted" curve: markets expect the central bank to cut rates) disappears.',
          ]}
        />
        <Note title="Single-curve vs multi-curve">
          Here one SOFR curve both projects the floating payments and discounts all cash flows, which is accurate for SOFR swaps.
          In practice banks often use several curves (e.g. one per floating-rate index), but the logic is the same.
        </Note>
        <CodeRef file="src/models/curve.ts">See bootstrap(). Each step is one equation in one unknown.</CodeRef>
      </Section>

      <Section title="3. How the curve moves, and what it does to a swap">
        <InPlainWords>
          Curves don't just go up and down. Traders describe moves with three shapes: <strong>parallel</strong> (all rates
          move together: the level), <Term name="Steepener / flattener">steepener/flattener</Term> (long rates move relative
          to short rates: the slope) and <Term name="Butterfly">butterfly</Term> (the middle moves against the ends: the
          curvature). Statistical analysis of real curves finds that these three explain almost all of the movement.
        </InPlainWords>
        <Playground
          controls={
            <>
              <Toggle
                value={shiftType}
                onChange={setShiftType}
                options={[
                  { value: 'parallel', label: 'Parallel' },
                  { value: 'steepener', label: 'Steepener' },
                  { value: 'butterfly', label: 'Butterfly' },
                ]}
              />
              <Slider label="Size" value={size} min={-0.02} max={0.02} step={0.0005} onChange={setSize} format={(v) => bp(v)} />
            </>
          }
        >
          <Stats
            items={[
              { label: '5Y swap rate', value: pct(parSwapRate(shifted, 0, 5, 1), 3), hint: `before: ${pct(swapRate5, 3)}` },
              { label: '10Y swap rate', value: pct(parSwapRate(shifted, 0, 10, 1), 3), hint: `before: ${pct(swapRate10, 3)}` },
              { label: 'Gain on €10m 10Y payer swap', value: `€${num(pv10 * 1e7, 0)}`, hint: 'pays the old fixed rate' },
            ]}
          />
          <Chart data={shiftChart} x="Maturity (years)" y="Rate (%)" />
        </Playground>
        <Example title="Worked example: what a 1bp move is worth (DV01)">
          <p>
            You entered a €10m 10-year swap <strong>paying fixed</strong> at {pct(swapRate10, 3)}. Rates then rise 0.01% (one{' '}
            <Term name="Basis point (bp)">basis point</Term>). New swaps now pay 0.01% more, but you keep paying the old, lower
            rate, so you save 0.01% × €10m = €1,000 every year for 10 years.
          </p>
          <p style={{ marginBottom: 0 }}>
            The value today of "€1 a year for 10 years" is the <Term name="Annuity">annuity</Term>, here{' '}
            {num(annuity(curve, 0, 10, 1), 3)}. So the gain is ≈ €1,000 × {num(annuity(curve, 0, 10, 1), 3)} ={' '}
            <strong>€{num(1000 * annuity(curve, 0, 10, 1), 0)}</strong>. This number, the value of a 1bp move, is called the{' '}
            <Term name="DV01">DV01</Term>. Remember the annuity: it reappears as the key ingredient for swaption prices in module 4.
          </p>
        </Example>
      </Section>

      <Takeaways
        items={[
          'The yield curve gives the price of money at every future date. Discount factors, zero rates and forward rates are three views of the same thing.',
          'A forward rate is the rate you can lock in today for a future period. It follows from no-arbitrage: investing for 2 years must equal investing for 1 year and rolling at the forward.',
          'Swap rates are the fixed rates that make a swap fair. Bootstrapping turns market swap rates into discount factors, one maturity at a time.',
          'The annuity (value of €1 per year over the swap) converts rate changes into money: value change ≈ rate change × annuity × notional.',
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'The curve is upward sloping. Which is higher at 10 years?',
            options: ['The zero rate', 'The forward rate', 'They are equal', 'It depends on the discount factor'],
            answer: 1,
            why: 'The zero rate is an average of the forwards up to 10Y. If rates rise with maturity, the marginal (forward) rate at 10Y is above the average.',
          },
          {
            q: 'You bootstrap a curve and the 5Y swap quote rises by 10bp. Which part of the curve changes?',
            options: ['Every maturity', 'Only maturities beyond the previous pillar (3Y)', 'Only beyond 5Y', 'Only exactly the 5Y point'],
            answer: 1,
            why: 'The bootstrap solves pillars in order, so 1M–3Y are already fixed and do not move. The 3Y–5Y segment moves, and later pillars re-solve because their swaps have cash flows in that region. Forwards beyond 5Y move in the opposite direction to compensate.',
          },
          {
            q: 'A 10Y payer swap (pay fixed) has an annuity of 8.4. Rates rise 1bp in parallel. Roughly what is the P&L per 100 notional?',
            options: ['+0.084', '−0.084', '+0.0084', '+8.4'],
            answer: 0,
            why: 'P&L ≈ ΔS × A = 0.0001 × 8.4 × 100 = 0.084. Paying fixed means you gain when rates rise.',
          },
        ]}
      />
      <LessonFooter id="curves" />
    </article>
  );
}
