import { useMemo, useState } from 'react';
import type { Data } from 'plotly.js';
import { Chart, line, linspace } from '../components/Chart';
import { Playground, Slider, Stats, Toggle, num, pct } from '../components/Controls';
import { Tex, TexBlock } from '../components/Formula';
import { CodeRef, Example, InPlainWords, LessonFooter, LessonHeader, Note, Quiz, Section, Symbols, Takeaways, Term, TryThis } from '../components/Lesson';
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

      <Section title="1. Why is an option worth more than its payoff?">
        <InPlainWords>
          <p>
            Imagine a share worth €100 today. Tomorrow it will be worth either <strong>€120 or €80</strong>, each with 50%
            probability. A call with strike €100 then pays €20 or €0, so its expected payoff is{' '}
            <strong>0.5 × 20 + 0.5 × 0 = €10</strong>, even though exercising <em>today</em> would give you nothing (the share
            is worth exactly the strike).
          </p>
          <p>
            Now make the share <em>riskier</em>: €140 or €60. The call pays €40 or €0, and its expected value doubles to €20.
            The bad outcome costs the option holder nothing extra, because they simply don't exercise, while the good outcome gets better.
          </p>
          <p style={{ marginBottom: 0 }}>
            This is the most important idea in option pricing: <strong>more uncertainty makes options more valuable.</strong>{' '}
            Uncertainty is measured by <Term name="Volatility">volatility</Term> σ. The part of the price that comes from it,
            on top of what you would get by exercising now (the <Term name="Intrinsic value">intrinsic value</Term>), is called
            the <Term name="Time value">time value</Term>.
          </p>
        </InPlainWords>
        <p>
          The chart below shows this. The grey dashed line is the payoff at expiry (the "hockey stick" from module 0). The blue
          curve is what the option is worth <em>today</em>, as calculated by the Black–Scholes formula in section 2. The gap
          between them is the time value.
        </p>
        <Playground
          controls={
            <>
              <Toggle value={type} onChange={setType} options={[{ value: 'call', label: 'Call' }, { value: 'put', label: 'Put' }]} />
              <Slider label="Share price today S" value={S} min={50} max={150} step={0.5} onChange={setS} format={(v) => `€${v}`} />
              <Slider label="Strike K" value={K} min={60} max={140} step={1} onChange={setK} format={(v) => `€${v}`} />
              <Slider label="Volatility σ" value={sigma} min={0.02} max={0.8} step={0.01} onChange={setSigma} format={(v) => pct(v, 0)} />
              <Slider label="Time to expiry T" value={T} min={0.02} max={5} step={0.01} onChange={setT} format={(v) => `${v.toFixed(2)} years`} />
              <Slider label="Interest rate r" value={r} min={-0.02} max={0.1} step={0.0025} onChange={setR} format={(v) => pct(v)} />
            </>
          }
        >
          <Stats
            items={[
              { label: `${type === 'call' ? 'Call' : 'Put'} price today`, value: `€${num(price, 2)}` },
              { label: 'Intrinsic value', value: `€${num(payoff(type, S, K), 2)}`, hint: 'what exercising now would give' },
              { label: 'Time value', value: `€${num(price - payoff(type, S, K), 2)}`, hint: 'price − intrinsic' },
            ]}
          />
          <Chart data={payoffChart} x="Share price (€)" y="Option value (€)" />
        </Playground>
        <TryThis
          items={[
            'Set σ to 2%. With almost no uncertainty the blue curve collapses onto the payoff: no uncertainty, no time value.',
            'Now set σ to 60%. The curve lifts well above the payoff. That extra is what volatility is worth.',
            'Move the share price far below the strike (for a call). The option is then nearly worthless, since it would take a huge move to pay off.',
            'Time value is largest when the share price is near the strike ("at the money"). Why? That is where it is most uncertain whether the option will pay off.',
          ]}
        />
      </Section>

      <Section title="2. The Black–Scholes formula, step by step">
        <InPlainWords>
          <p>
            In 1973 Fischer Black, Myron Scholes and Robert Merton found a formula for the <em>fair</em> price of an option
            (Scholes and Merton received the 1997 Nobel prize in economics for it). The key idea is one you know from economics:{' '}
            <strong>no arbitrage</strong>. You can copy the option's payoff by continually trading the share and a bank account. So the
            option must cost exactly what that copying strategy costs, otherwise there would be a free lunch.
          </p>
          <p style={{ marginBottom: 0 }}>
            A useful side effect is that investors' risk attitudes drop out of the price. We can calculate it <em>as if</em> everyone were
            risk-neutral: take the expected payoff and discount it at the risk-free rate. This is called pricing under the{' '}
            <Term name="Risk-neutral measure">risk-neutral measure</Term>.
          </p>
        </InPlainWords>
        <h3>The five ingredients and what they do</h3>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Input</th>
                <th>If it goes up, a call…</th>
                <th>…a put</th>
                <th>Why</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Share price S</td><td>rises</td><td>falls</td><td style={{ whiteSpace: 'normal' }}>The call is closer to paying off; the put is further away</td></tr>
              <tr><td>Strike K</td><td>falls</td><td>rises</td><td style={{ whiteSpace: 'normal' }}>A higher price to buy at is worse for a call and better for a put</td></tr>
              <tr><td>Volatility σ</td><td>rises</td><td>rises</td><td style={{ whiteSpace: 'normal' }}>More uncertainty: bigger upside, while the downside stays capped (section 1)</td></tr>
              <tr><td>Time to expiry T</td><td>rises</td><td>usually rises</td><td style={{ whiteSpace: 'normal' }}>More time = more room for big moves</td></tr>
              <tr><td>Interest rate r</td><td>rises</td><td>falls</td><td style={{ whiteSpace: 'normal' }}>For a call, paying K later is cheaper in present-value terms; for a put, receiving K later is worth less</td></tr>
            </tbody>
          </table>
        </div>
        <h3>The formula</h3>
        <TexBlock>{String.raw`C = S\,N(d_1) - K e^{-rT} N(d_2), \qquad d_1 = \frac{\ln(S/K) + (r + \tfrac12\sigma^2)T}{\sigma\sqrt{T}}, \qquad d_2 = d_1 - \sigma\sqrt{T}`}</TexBlock>
        <Symbols
          items={[
            ['C', 'The price of the call option today'],
            ['S', 'The share price today'],
            ['K', 'The strike price'],
            ['T', 'Time to expiry, in years'],
            ['r', 'The risk-free interest rate (continuously compounded)'],
            [String.raw`\sigma`, 'Volatility: the yearly standard deviation of the share’s percentage returns'],
            [String.raw`e^{-rT}`, 'The discount factor: turns K paid at expiry into today’s money'],
            ['N(\\cdot)', 'Probability from the bell curve (module 0, section 5)'],
            [String.raw`N(d_2)`, 'The (risk-neutral) probability that the call ends in the money, i.e. that you will exercise and pay K'],
            [String.raw`N(d_1)`, 'Also a probability, but weighted by how high S ends up. It is the call’s delta (section 3)'],
          ]}
        />
        <p>
          <strong>Read it in words:</strong> the call is worth "what you expect to receive" minus "what you expect to pay". You
          receive the share if you exercise, which is worth <Tex>{String.raw`S\,N(d_1)`}</Tex> today. You pay the strike if you exercise,
          which happens with probability <Tex>{String.raw`N(d_2)`}</Tex>, so its value today is{' '}
          <Tex>{String.raw`K e^{-rT} N(d_2)`}</Tex>.
        </p>
        <Example title="Worked example — using the slider values above (as a call)">
          <table>
            <tbody>
              <tr><td>1. Volatility over the life of the option</td><td><Tex>{String.raw`\sigma\sqrt{T}`}</Tex></td><td>= {num(sigma, 2)} × √{num(T, 2)} = {num(sigma * Math.sqrt(T), 4)}</td></tr>
              <tr><td>2. How far in/out of the money, in st. deviations</td><td><Tex>{'d_1'}</Tex></td><td>= {num(d1, 4)}</td></tr>
              <tr><td></td><td><Tex>{'d_2 = d_1 - \\sigma\\sqrt T'}</Tex></td><td>= {num(d2, 4)}</td></tr>
              <tr><td>3. Look up the probabilities</td><td><Tex>{'N(d_1),\\ N(d_2)'}</Tex></td><td>= {num(normCdf(d1), 4)}, {num(normCdf(d2), 4)}</td></tr>
              <tr><td>4. Value of receiving the share</td><td><Tex>{String.raw`S\,N(d_1)`}</Tex></td><td>= {num(S, 2)} × {num(normCdf(d1), 4)} = €{num(S * normCdf(d1), 2)}</td></tr>
              <tr><td>5. Value of paying the strike</td><td><Tex>{String.raw`K e^{-rT} N(d_2)`}</Tex></td><td>= {num(K, 2)} × {num(Math.exp(-r * T), 4)} × {num(normCdf(d2), 4)} = €{num(K * Math.exp(-r * T) * normCdf(d2), 2)}</td></tr>
              <tr><td><strong>6. Call price</strong></td><td>4 − 5</td><td><strong>= €{num(S * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2), 2)}</strong></td></tr>
            </tbody>
          </table>
          <p style={{ marginBottom: 0 }}>
            Interpretation: there is a {pct(normCdf(d2), 0)} chance (risk-neutral) that you end up exercising. Move the sliders in section 1 and
            this table updates.
          </p>
        </Example>
        <Note title="The assumptions behind the formula">
          Black–Scholes assumes the share price moves randomly with constant volatility (percentage returns are normally
          distributed, so the price is "lognormal" and never negative), no transaction costs, and continuous trading. Real
          markets break these assumptions. Module 5 shows how practitioners deal with that. Still, every model in this course is a variation on
          this one.
        </Note>
        <CodeRef file="src/models/blackScholes.ts">The pricing formula is about 10 lines — have a look.</CodeRef>
      </Section>

      <Section title="3. The Greeks: how the price reacts">
        <InPlainWords>
          <p>
            In economics you use <em>marginal</em> effects: how much does output change if one input changes a little? The
            Greeks are exactly that for an option. Each one is a partial derivative of the price, named after a Greek letter.
          </p>
          <p style={{ marginBottom: 0 }}>
            Traders care about them because they measure <strong>risk</strong>. A bank that sells an option wants to know: if the share
            moves €1, or volatility rises 1%, or a day passes, how much do I gain or lose? And how do I offset it?
          </p>
        </InPlainWords>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Greek</th>
                <th>Measures the change in price when…</th>
                <th>Right now</th>
                <th>Meaning</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><Term name="Delta">Delta</Term> Δ</td>
                <td>the share price rises €1</td>
                <td>{num(g.delta, 3)}</td>
                <td style={{ whiteSpace: 'normal' }}>If the share rises €1, the option moves ≈ €{num(g.delta, 2)}</td>
              </tr>
              <tr>
                <td><Term name="Gamma">Gamma</Term> Γ</td>
                <td>the share price rises €1 (change in delta)</td>
                <td>{num(g.gamma, 4)}</td>
                <td style={{ whiteSpace: 'normal' }}>After a €1 rise, delta becomes ≈ {num(g.delta + g.gamma, 3)}</td>
              </tr>
              <tr>
                <td><Term name="Vega">Vega</Term></td>
                <td>volatility rises 1 percentage point</td>
                <td>{num(g.vega / 100, 3)}</td>
                <td style={{ whiteSpace: 'normal' }}>σ from {pct(sigma, 0)} to {pct(sigma + 0.01, 0)} adds ≈ €{num(g.vega / 100, 2)}</td>
              </tr>
              <tr>
                <td><Term name="Theta">Theta</Term> Θ</td>
                <td>one day passes</td>
                <td>{num(g.theta / 365, 4)}</td>
                <td style={{ whiteSpace: 'normal' }}>The option loses ≈ €{num(-g.theta / 365, 3)} of time value per day</td>
              </tr>
              <tr>
                <td><Term name="Rho">Rho</Term> ρ</td>
                <td>interest rates rise 1 percentage point</td>
                <td>{num(g.rho / 100, 3)}</td>
                <td style={{ whiteSpace: 'normal' }}>Rates +1% change the price by ≈ €{num(g.rho / 100, 2)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <Example title="Worked example: delta hedging">
          A bank sells 1,000 of these {type}s to a client. If the share rises €1, the bank loses about 1,000 × {num(g.delta, 3)} = €
          {num(1000 * Math.abs(g.delta), 0)}. To neutralise that it {g.delta >= 0 ? 'buys' : 'sells'}{' '}
          <strong>{num(1000 * Math.abs(g.delta), 0)} shares</strong>: a €1 rise now gains as much on the shares as it loses
          on the options. This is <Term name="Delta hedging">delta hedging</Term>, and it is the very trading strategy that
          Black–Scholes uses to derive the price.
        </Example>
        <p>Pick a Greek to see how it depends on the share price (left) and on the share price and time together (right, drag to rotate):</p>
        <Toggle
          label="Greek to plot"
          value={greek}
          onChange={setGreek}
          options={(Object.keys(greekLabels) as GreekName[]).map((k) => ({ value: k, label: greekLabels[k] }))}
        />
        <div className="grid-2">
          <Chart data={greekChart} x="Share price (€)" y={greekLabels[greek]} />
          <Chart
            data={greekSurface}
            height={360}
            layout={{
              margin: { l: 0, r: 0, t: 10, b: 0 },
              scene: { xaxis: { title: { text: 'Share price' } }, yaxis: { title: { text: 'Expiry (y)' } }, zaxis: { title: { text: greekLabels[greek] } } },
            }}
          />
        </div>
        <Note title="Gamma and theta: two sides of one coin">
          An option holder benefits from big moves (gamma) but pays for this every day through time decay (theta). Like
          insurance, you pay a little every day and collect when something big happens. A delta-hedged option holder
          profits only if the share actually moves more than the volatility they paid for. That is why traders say that
          buying an option is <em>buying volatility</em>.
        </Note>
        <TryThis
          items={[
            'Plot delta for a call. It goes from 0 (far below the strike: the option barely reacts) to 1 (far above: it moves one-for-one with the share).',
            'Plot gamma. Look at the 0.05-year line: options close to expiry and near the strike have huge gamma, because tiny moves decide whether they pay off at all.',
            'Plot vega. Unlike gamma, it is largest for long-dated options. Volatility matters most when there is a lot of time left.',
          ]}
        />
      </Section>

      <Section title="4. Put–call parity">
        <InPlainWords>
          Buy a call and sell a put, both with strike K. At expiry, if the share is above K you exercise the call (buy at K). If it is below K the
          put buyer exercises against you (you must buy at K). <strong>Either way you end up buying the share for K.</strong> So "call
          − put" is the same as an agreement to buy the share at K later, and must cost the same.
        </InPlainWords>
        <Example>
          <table>
            <thead>
              <tr>
                <th>Share at expiry</th>
                <th>Long call pays</th>
                <th>Short put pays</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>€80 (K = 100)</td><td>0</td><td>−20</td><td>−20 = 80 − 100</td></tr>
              <tr><td>€130 (K = 100)</td><td>30</td><td>0</td><td>30 = 130 − 100</td></tr>
            </tbody>
          </table>
          The total is always <Tex>{'S_T - K'}</Tex>. Its value today is <Tex>{String.raw`S - Ke^{-rT}`}</Tex>: the share, minus the present value of paying K.
        </Example>
        <TexBlock>{String.raw`C - P = S - K e^{-rT}`}</TexBlock>
        <Stats
          items={[
            { label: 'C − P (Black–Scholes)', value: num(parityLhs, 6) },
            { label: 'S − K·e^(−rT)', value: num(parityRhs, 6) },
            { label: 'Difference', value: num(parityLhs - parityRhs, 10) },
          ]}
        />
        <p>
          This holds in <em>any</em> model, because it follows from no-arbitrage alone. You will meet it again in rate form:{' '}
          <strong>cap − floor = swap</strong> (module 3) and <strong>payer − receiver = forward swap</strong> (module 4).
        </p>
      </Section>

      <Takeaways
        items={[
          'Options are worth more than their payoff today because of uncertainty: the upside counts and the downside is capped. More volatility means a higher price, for calls and puts alike.',
          'Black–Scholes prices an option by no-arbitrage: it equals the cost of copying its payoff with shares and cash. The price is the discounted risk-neutral expected payoff.',
          'C = S·N(d₁) − K·e^(−rT)·N(d₂): "value of what you receive" minus "value of what you pay".',
          'The Greeks are marginal effects: delta (share price), gamma (change in delta), vega (volatility), theta (time), rho (rates). Delta also tells you how to hedge.',
          'Put–call parity, C − P = S − K·e^(−rT), holds in every model.',
        ]}
      />

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
