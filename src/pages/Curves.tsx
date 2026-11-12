import { useMemo, useState } from 'react';
import { Chart, line, linspace } from '../components/Chart';
import { Playground, Slider, Stats, Toggle, bp, num, pct } from '../components/Controls';
import { Tex, TexBlock } from '../components/Formula';
import { CodeRef, LessonFooter, LessonHeader, Note, Quiz, Section, TryThis } from '../components/Lesson';
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

      <Section title="1. Discount factors, zeros and forwards">
        <p>
          Every rates product is a set of cash flows, and the curve tells you what each future cash flow is worth today.
          The fundamental object is the <strong>discount factor</strong> <Tex>{'P(0,t)'}</Tex>. Rates are just different ways
          of quoting it:
        </p>
        <TexBlock>{String.raw`z(t) = -\frac{\ln P(0,t)}{t}, \qquad F(t_1,t_2) = \frac{1}{t_2-t_1}\left(\frac{P(0,t_1)}{P(0,t_2)} - 1\right)`}</TexBlock>
        <p>
          The <strong>forward rate</strong> <Tex>{'F(t_1,t_2)'}</Tex> is the rate you can lock in today for borrowing between{' '}
          <Tex>{'t_1'}</Tex> and <Tex>{'t_2'}</Tex>. It is the <em>underlying of every caplet</em> in the next module. The zero
          rate is an average of forwards, so forwards move more than zeros: when the curve slopes up, forwards sit above zeros.
        </p>
        <Toggle value={view} onChange={setView} options={[{ value: 'rates', label: 'Rates' }, { value: 'df', label: 'Discount factors' }]} />
        {view === 'rates' ? <Chart data={ratesChart} x="Maturity (years)" y="Rate (%)" /> : <Chart data={dfChart} x="Maturity (years)" y="P(0,t)" />}
        <Note title="Why are the instantaneous forwards a staircase?">
          The curve interpolates linearly in <Tex>{String.raw`\ln P`}</Tex>, which means the instantaneous forward is constant
          between pillars. Smoother schemes (monotone convex, splines) exist. Interpolation is a real modelling choice, and it
          shows up directly in forward-starting products.
        </Note>
      </Section>

      <Section title="2. Bootstrapping the curve">
        <p>
          The market does not quote discount factors. It quotes <strong>instruments</strong>: short-term deposits and par swap
          rates. Bootstrapping inverts them one at a time, shortest first. Each swap adds one new pillar, and we solve for the
          one zero rate that makes the swap price back to par:
        </p>
        <TexBlock>{String.raw`S_{\text{par}}(T) = \frac{1 - P(0,T)}{\sum_{i=1}^{n} \tau_i\, P(0,t_i)} \quad\Longrightarrow\quad \text{solve for } P(0,T)`}</TexBlock>
        <p>Edit any quote and watch the curve rebuild. The last column shows that every quote is repriced exactly.</p>
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
            'Raise only the 7Y swap by 0.50%. Notice the forwards between 5Y and 7Y jump much more than 0.50%, then fall back after 7Y. Forwards amplify local changes in the quotes.',
            'Make the 2Y swap higher than the 1Y. The front-end inversion disappears.',
          ]}
        />
        <Note title="Single-curve vs multi-curve">
          Here the same SOFR curve both projects the floating rates and discounts the cash flows. That is accurate for OIS
          swaps. Before 2008 (and in LIBOR days) desks used separate projection and discounting curves; the formulas are the same, but with two curves.
        </Note>
        <CodeRef file="src/models/curve.ts">See bootstrap() — each step is a single bisection.</CodeRef>
      </Section>

      <Section title="3. Curve moves">
        <p>
          Rates traders think in terms of a few standard moves: <strong>parallel</strong> shifts (level),{' '}
          <strong>steepeners/flatteners</strong> (slope) and <strong>butterflies</strong> (curvature). Principal component
          analysis of real curves finds these same three shapes.
        </p>
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
              { label: '5Y par rate', value: pct(parSwapRate(shifted, 0, 5, 1), 3), hint: `base ${pct(swapRate5, 3)}` },
              { label: '10Y par rate', value: pct(parSwapRate(shifted, 0, 10, 1), 3), hint: `base ${pct(swapRate10, 3)}` },
              { label: 'PV of 10Y payer (per 100)', value: num(pv10 * 100, 3), hint: 'struck at base par rate' },
              { label: 'DV01 per 100 (approx.)', value: num(annuity(curve, 0, 10, 1) * 0.01, 4), hint: '= annuity × 1bp' },
            ]}
          />
          <Chart data={shiftChart} x="Maturity (years)" y="Rate (%)" />
        </Playground>
        <p>
          The PV of a swap after a move is roughly <Tex>{String.raw`\Delta S \times A`}</Tex>, the change in the par rate times
          the <strong>annuity</strong> <Tex>{String.raw`A = \sum \tau_i P(0,t_i)`}</Tex>. The annuity is the swap's DV01 per unit
          rate. Remember it: in module 4 it becomes the numeraire for swaptions.
        </p>
      </Section>

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
