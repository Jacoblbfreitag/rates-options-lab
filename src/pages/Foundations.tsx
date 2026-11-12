import { useMemo, useState } from 'react';
import type { Data } from 'plotly.js';
import { Chart, line, linspace } from '../components/Chart';
import { Playground, Slider, Stats, Toggle, num, pct } from '../components/Controls';
import { Tex, TexBlock } from '../components/Formula';
import { CodeRef, LessonFooter, LessonHeader, Note, Quiz, Section, TryThis } from '../components/Lesson';
import { bsGreeks, bsPrice, payoff, type Greeks, type OptionType } from '../models/blackScholes';
import { normCdf } from '../models/math/normal';

type GreekName = keyof Greeks;
const greekLabels: Record<GreekName, string> = { delta: 'Delta', gamma: 'Gamma', vega: 'Vega', theta: 'Theta', rho: 'Rho' };

export default function Foundations() {
  const [type, setType] = useState<OptionType>('call');
  const [K, setK] = useState(100);
  const [S, setS] = useState(100);
  const [sigma, setSigma] = useState(0.2);
  const [T, setT] = useState(1);
  const [r, setR] = useState(0.04);
  const inp = { S, K, T, r, sigma };

  const price = bsPrice(type, inp);
  const g = bsGreeks(type, inp);
  const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);

  const payoffChart = useMemo(() => {
    const xs = linspace(K * 0.5, K * 1.5, 201);
    return [
      line(xs, xs.map((s) => payoff(type, s, K)), 'Payoff at expiry', { line: { dash: 'dash', color: '#5f6b7a' } }),
      line(xs, xs.map((s) => bsPrice(type, { ...inp, S: s })), `Value today (T = ${T.toFixed(2)}y)`),
      line(xs, xs.map((s) => bsPrice(type, { ...inp, S: s, T: Math.max(T / 4, 0.01) })), `Value with T/4 left`, {
        line: { dash: 'dot' },
      }),
      { x: [S], y: [price], name: 'Current spot', type: 'scatter', mode: 'markers', marker: { size: 10, color: '#c2453c' } } as Data,
    ];
  }, [type, K, S, sigma, T, r, price]);

  // ── Greeks ──
  const [greek, setGreek] = useState<GreekName>('gamma');
  const greekChart = useMemo(() => {
    const xs = linspace(K * 0.6, K * 1.4, 161);
    return [0.05, 0.25, 1, 2].map((t) =>
      line(xs, xs.map((s) => bsGreeks(type, { S: s, K, T: t, r, sigma })[greek]), `T = ${t}y`),
    );
  }, [greek, type, K, r, sigma]);
  const greekSurface = useMemo(() => {
    const spots = linspace(K * 0.6, K * 1.4, 41);
    const times = linspace(0.05, 2, 30);
    return [
      {
        type: 'surface',
        x: spots,
        y: times,
        z: times.map((t) => spots.map((s) => bsGreeks(type, { S: s, K, T: t, r, sigma })[greek])),
        colorscale: 'Viridis',
        showscale: false,
      } as Data,
    ];
  }, [greek, type, K, r, sigma]);

  const parityLhs = bsPrice('call', inp) - bsPrice('put', inp);
  const parityRhs = S - K * Math.exp(-r * T);

  return (
    <article>
      <LessonHeader id="foundations" />

      <Section title="1. Payoff vs value">
        <p>
          An option's <strong>payoff</strong> is what it pays at expiry: a call pays <Tex>{String.raw`\max(S_T-K,0)`}</Tex>, a put{' '}
          <Tex>{String.raw`\max(K-S_T,0)`}</Tex>. Before expiry the option is worth <em>more</em> than its intrinsic value
          because the future is uncertain: the downside is floored at zero, but the upside is not. That extra is the{' '}
          <strong>time value</strong>, and it is exactly what volatility buys you.
        </p>
        <Playground
          controls={
            <>
              <Toggle value={type} onChange={setType} options={[{ value: 'call', label: 'Call' }, { value: 'put', label: 'Put' }]} />
              <Slider label="Spot S" value={S} min={50} max={150} step={0.5} onChange={setS} />
              <Slider label="Strike K" value={K} min={60} max={140} step={1} onChange={setK} />
              <Slider label="Volatility σ" value={sigma} min={0.02} max={0.8} step={0.01} onChange={setSigma} format={(v) => pct(v, 0)} />
              <Slider label="Time to expiry T" value={T} min={0.02} max={5} step={0.01} onChange={setT} format={(v) => `${v.toFixed(2)}y`} />
              <Slider label="Rate r" value={r} min={-0.02} max={0.1} step={0.0025} onChange={setR} format={(v) => pct(v)} />
            </>
          }
        >
          <Stats
            items={[
              { label: `${type === 'call' ? 'Call' : 'Put'} price`, value: num(price, 3) },
              { label: 'Intrinsic value', value: num(payoff(type, S, K), 3) },
              { label: 'Time value', value: num(price - payoff(type, S, K), 3) },
              { label: <>N(d₂)</>, value: num(type === 'call' ? normCdf(d2) : normCdf(-d2), 3), hint: 'risk-neutral prob. of finishing ITM' },
            ]}
          />
          <Chart data={payoffChart} x="Spot at valuation" y="Option value" />
        </Playground>
        <TexBlock>{String.raw`C = S\,N(d_1) - K e^{-rT} N(d_2), \qquad d_{1,2} = \frac{\ln(S/K) + (r \pm \tfrac12\sigma^2)T}{\sigma\sqrt{T}}`}</TexBlock>
        <p>
          Read it as: <Tex>{String.raw`N(d_2)`}</Tex> is the risk-neutral probability the call finishes in the money, so{' '}
          <Tex>{String.raw`K e^{-rT}N(d_2)`}</Tex> is the PV of paying the strike. <Tex>{String.raw`S\,N(d_1)`}</Tex> is the PV of
          receiving the stock when it ends above K. With these inputs <Tex>{`d_1 = ${d1.toFixed(3)}`}</Tex> and{' '}
          <Tex>{`d_2 = ${d2.toFixed(3)}`}</Tex>.
        </p>
        <TryThis
          items={[
            'Set σ to 2%. The "value today" curve collapses onto the (discounted) payoff — no uncertainty, no time value.',
            'Move spot far out of the money. Time value disappears there too: the option is unlikely to matter.',
            'Time value is largest at the money. Why? (Hint: that is where the outcome is most uncertain.)',
            'Choose a put with r = 5% and push spot deep in the money: it is worth LESS than intrinsic. Why? (A European put cannot be exercised early, and receiving K later is worth only K·e^(−rT) today.)',
          ]}
        />
        <CodeRef file="src/models/blackScholes.ts">The pricing formula is about 10 lines — have a look.</CodeRef>
      </Section>

      <Section title="2. The Greeks">
        <p>
          A trader rarely cares about the price itself; they care about how it <em>changes</em>. The Greeks are the partial
          derivatives of the price, and each one is a risk you can hedge:
        </p>
        <ul>
          <li><strong>Delta</strong> <Tex>{String.raw`\partial V/\partial S`}</Tex> — the hedge ratio. Currently {num(g.delta, 3)}.</li>
          <li><strong>Gamma</strong> <Tex>{String.raw`\partial^2 V/\partial S^2`}</Tex> — how quickly delta changes; the convexity you own. Currently {num(g.gamma, 4)}.</li>
          <li><strong>Vega</strong> <Tex>{String.raw`\partial V/\partial \sigma`}</Tex> — exposure to implied vol. Per vol point: {num(g.vega / 100, 3)}.</li>
          <li><strong>Theta</strong> <Tex>{String.raw`\partial V/\partial t`}</Tex> — the daily rent for holding gamma. Per day: {num(g.theta / 365, 4)}.</li>
          <li><strong>Rho</strong> <Tex>{String.raw`\partial V/\partial r`}</Tex> — rate sensitivity. Per 1%: {num(g.rho / 100, 3)}.</li>
        </ul>
        <Toggle
          label="Greek to plot"
          value={greek}
          onChange={setGreek}
          options={(Object.keys(greekLabels) as GreekName[]).map((k) => ({ value: k, label: greekLabels[k] }))}
        />
        <div className="grid-2">
          <Chart data={greekChart} x="Spot" y={greekLabels[greek]} />
          <Chart
            data={greekSurface}
            height={360}
            layout={{
              margin: { l: 0, r: 0, t: 10, b: 0 },
              scene: { xaxis: { title: { text: 'Spot' } }, yaxis: { title: { text: 'Expiry (y)' } }, zaxis: { title: { text: greekLabels[greek] } } },
            }}
          />
        </div>
        <Note title="The gamma–theta trade-off">
          Under Black–Scholes a delta-hedged option earns <Tex>{String.raw`\tfrac12\Gamma S^2(\sigma_{\text{realised}}^2 - \sigma_{\text{implied}}^2)\,dt`}</Tex>.
          Long gamma pays theta every day and wins only if the market moves more than implied vol predicted. This is the
          core intuition behind every vol trade, including the cap and swaption trades later in the course.
        </Note>
        <TryThis
          items={[
            'Plot gamma and look at the T = 0.05y line: short-dated ATM options have huge gamma. That is "pin risk" near expiry.',
            'Plot vega: unlike gamma, it grows with maturity. Long-dated options are vol trades; short-dated ones are gamma trades.',
            'Rotate the 3D surface (drag it) for theta. Where does an option decay fastest?',
          ]}
        />
      </Section>

      <Section title="3. Put–call parity">
        <p>
          A long call plus a short put with the same strike pays <Tex>{String.raw`S_T - K`}</Tex> in every scenario — a forward.
          So, whatever the model:
        </p>
        <TexBlock>{String.raw`C - P = S - K e^{-rT}`}</TexBlock>
        <Stats
          items={[
            { label: 'C − P (model)', value: num(parityLhs, 6) },
            { label: 'S − K·e^(−rT)', value: num(parityRhs, 6) },
            { label: 'Difference', value: num(parityLhs - parityRhs, 10) },
          ]}
        />
        <p>
          You will meet this identity three more times: <strong>cap − floor = swap</strong> (module 3),{' '}
          <strong>payer − receiver = forward swap</strong> (module 4), and as a test that every pricer in this app passes.
        </p>
      </Section>

      <Quiz
        questions={[
          {
            q: 'Volatility rises from 20% to 30% with everything else unchanged. What happens to the call and put prices?',
            options: ['Call up, put down', 'Both up', 'Both down', 'Call up, put unchanged'],
            answer: 1,
            why: 'Both options have positive vega: more uncertainty raises the value of a floored payoff. Put–call parity confirms it — C − P does not depend on σ, so they must move together.',
          },
          {
            q: 'Where is gamma largest?',
            options: ['Deep in the money, long-dated', 'At the money, close to expiry', 'Out of the money, long-dated', 'Gamma is constant'],
            answer: 1,
            why: 'Near expiry an ATM option flips between ending worthless and ending in the money with tiny moves in spot, so delta changes violently.',
          },
          {
            q: 'What does N(d₂) represent in the Black–Scholes call formula?',
            options: ['The hedge ratio', 'The risk-neutral probability of finishing in the money', 'The real-world probability of profit', 'The option’s vega'],
            answer: 1,
            why: 'N(d₂) is Q(S_T > K) under the risk-neutral measure. The hedge ratio (delta) is N(d₁).',
          },
          {
            q: 'A delta-hedged long option position makes money if…',
            options: ['The stock goes up', 'Realised vol is higher than the implied vol you paid', 'Interest rates rise', 'Time passes'],
            answer: 1,
            why: 'Hedged, direction no longer matters. You earn gamma P&L from big moves and pay theta — net positive only if realised vol beats implied.',
          },
        ]}
      />
      <LessonFooter id="foundations" />
    </article>
  );
}
