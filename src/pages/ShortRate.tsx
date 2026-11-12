import { useMemo, useState } from 'react';
import type { Data } from 'plotly.js';
import { Chart, line, linspace, palette } from '../components/Chart';
import { Playground, Slider, Stats, Toggle, bp, num, pct } from '../components/Controls';
import { Tex, TexBlock } from '../components/Formula';
import { CodeRef, Example, InPlainWords, LessonFooter, LessonHeader, Note, Quiz, Section, Symbols, Takeaways, Term, TryThis } from '../components/Lesson';
import { baseCurve } from '../data/curves';
import { swaptionExpiries, swaptionNormalVolsBp, swaptionTenorLabels, swaptionTenors } from '../data/market';
import { impliedNormalVol } from '../models/black76';
import {
  buildTree,
  calibrateHwSigma,
  hwSwaption,
  simulateHw,
  treeBranch,
  treeRate,
  treeSwaption,
  treeWidth,
} from '../models/hullwhite';
import { forwardSwap, swaptionPrice } from '../models/swaption';
import { simulateVasicek, vasicekZero } from '../models/vasicek';

const maturities = linspace(0.1, 30, 120);

function pathTraces(times: number[], paths: number[][]): Data[] {
  return paths.map((p, i) =>
    line(times, p.map((r) => r * 100), `path ${i + 1}`, { line: { width: 1, color: palette[i % palette.length] }, opacity: 0.55, showlegend: false, hoverinfo: 'skip' }),
  );
}

/** HW-implied ATM normal vol for an expiry × tenor swaption. */
function hwImpliedNormal(a: number, sigma: number, e: number, n: number) {
  const { rate, annuity } = forwardSwap(baseCurve, e, n);
  const price = hwSwaption(baseCurve, { a, sigma }, e, n, rate, 'payer');
  return impliedNormalVol('call', price, rate, rate, e, annuity);
}

export default function ShortRate() {
  // ── Vasicek ──
  const [va, setVa] = useState(0.2);
  const [vb, setVb] = useState(0.04);
  const [vs, setVs] = useState(0.01);
  const [vr0, setVr0] = useState(0.039);
  const vp = { a: va, b: vb, sigma: vs, r0: vr0 };
  const vasPaths = useMemo(() => simulateVasicek({ a: va, b: vb, sigma: vs, r0: vr0 }, 10, 200, 25, 3), [va, vb, vs, vr0]);
  const vasBand = useMemo(() => {
    const t = vasPaths.times;
    const mean = t.map((s) => vr0 * Math.exp(-va * s) + vb * (1 - Math.exp(-va * s)));
    const sd = t.map((s) => vs * Math.sqrt((1 - Math.exp(-2 * va * s)) / (2 * va)));
    return [
      line(t, mean.map((m, i) => (m + 2 * sd[i]) * 100), '+2 sd', { line: { color: '#14243a', dash: 'dash', width: 2 } }),
      line(t, mean.map((m) => m * 100), 'Mean', { line: { color: '#14243a', width: 3 } }),
      line(t, mean.map((m, i) => (m - 2 * sd[i]) * 100), '−2 sd', { line: { color: '#14243a', dash: 'dash', width: 2 } }),
    ];
  }, [vasPaths, va, vb, vs, vr0]);
  const vasCurve = [
    line(maturities, maturities.map((t) => baseCurve.zero(t) * 100), 'Market zero curve', { line: { color: '#c2453c', width: 3 } }),
    line(maturities, maturities.map((t) => vasicekZero(vp, t) * 100), 'Vasicek zero curve'),
  ];

  // ── Hull–White ──
  const [a, setA] = useState(0.03);
  const [sigma, setSigma] = useState(0.0105);
  const [tenorIdx, setTenorIdx] = useState(2);
  const hwPaths = useMemo(() => simulateHw(baseCurve, { a, sigma }, 10, 200, 25, 5), [a, sigma]);
  const hwChart = useMemo(
    () => [
      ...pathTraces(hwPaths.times, hwPaths.paths),
      line(hwPaths.times, hwPaths.times.map((t) => baseCurve.instFwd(t) * 100), 'Instantaneous forward f(0,t)', { line: { color: '#c2453c', width: 3 } }),
      line(hwPaths.times, hwPaths.phi.map((p) => p * 100), 'φ(t) — the fitted drift level', { line: { color: '#14243a', width: 2, dash: 'dash' } }),
    ],
    [hwPaths],
  );
  const volTermChart = useMemo(() => {
    const n = swaptionTenors[tenorIdx];
    const es = swaptionExpiries.filter((e) => e >= 0.25);
    return [
      {
        x: es,
        y: es.map((e) => swaptionNormalVolsBp[swaptionExpiries.indexOf(e)][tenorIdx]),
        type: 'scatter',
        mode: 'markers',
        name: `Market (× ${swaptionTenorLabels[tenorIdx]})`,
        marker: { size: 9, color: '#c2453c' },
      } as Data,
      line(es, es.map((e) => hwImpliedNormal(a, sigma, e, n) * 1e4), 'Hull–White'),
    ];
  }, [a, sigma, tenorIdx]);
  const calibrateTo1Y = () => {
    const n = swaptionTenors[tenorIdx];
    const { rate } = forwardSwap(baseCurve, 1, n);
    const marketVol = swaptionNormalVolsBp[swaptionExpiries.indexOf(1)][tenorIdx] / 1e4;
    const target = swaptionPrice(baseCurve, 1, n, rate, marketVol, 'normal', 'payer');
    setSigma(calibrateHwSigma(baseCurve, a, 1, n, rate, target));
  };

  // ── Tree visualiser ──
  const [treeSteps, setTreeSteps] = useState(6);
  const [treeA, setTreeA] = useState(0.2);
  const treeChart = useMemo(() => {
    const dt = 0.5;
    const tree = buildTree(baseCurve, { a: treeA, sigma: 0.01 }, dt, treeSteps);
    const ex: (number | null)[] = [];
    const ey: (number | null)[] = [];
    const nx: number[] = [];
    const ny: number[] = [];
    const labels: string[] = [];
    for (let m = 0; m <= treeSteps; m++) {
      const w = treeWidth(tree, m);
      for (let j = -w; j <= w; j++) {
        if (m < treeSteps) {
          nx.push(m * dt);
          ny.push(treeRate(tree, m, j) * 100);
          labels.push(`step ${m}, j=${j}<br>r = ${pct(treeRate(tree, m, j), 2)}<br>Q = ${tree.Q[m][j + w].toFixed(4)}`);
          for (const k of treeBranch(j, tree.jMax)) {
            if (m + 1 < treeSteps) {
              ex.push(m * dt, (m + 1) * dt, null);
              ey.push(treeRate(tree, m, j) * 100, treeRate(tree, m + 1, k) * 100, null);
            }
          }
        }
      }
    }
    return {
      jMax: tree.jMax,
      data: [
        { x: ex, y: ey, type: 'scatter', mode: 'lines', line: { color: '#c3c9d2', width: 1 }, hoverinfo: 'skip', name: 'branches' } as Data,
        { x: nx, y: ny, text: labels, type: 'scatter', mode: 'markers', marker: { size: 11, color: '#1f6fb4' }, hovertemplate: '%{text}<extra></extra>', name: 'nodes' } as Data,
      ],
    };
  }, [treeSteps, treeA]);

  // ── Bermudan ──
  const [finalMat, setFinalMat] = useState(10);
  const [nonCall, setNonCall] = useState(2);
  const [bType, setBType] = useState<'payer' | 'receiver'>('receiver');
  const [moneyness, setMoneyness] = useState(0);
  const tenor = finalMat - nonCall;
  const bStrike = forwardSwap(baseCurve, nonCall, tenor).rate + moneyness;
  const berm = useMemo(() => {
    const hw = { a, sigma };
    return {
      euAnalytic: hwSwaption(baseCurve, hw, nonCall, tenor, bStrike, bType),
      euTree: treeSwaption(baseCurve, hw, nonCall, tenor, bStrike, bType, 'european', 1, 24),
      bermudan: treeSwaption(baseCurve, hw, nonCall, tenor, bStrike, bType, 'bermudan', 1, 24),
    };
  }, [a, sigma, nonCall, tenor, bStrike, bType]);
  // For each a, recalibrate σ so the European price is unchanged, then measure the Bermudan's extra value.
  const meanRevChart = useMemo(() => {
    const as = [0.005, 0.02, 0.04, 0.06, 0.08, 0.1, 0.13, 0.16];
    const switchValue = as.map((aa) => {
      const hw = { a: aa, sigma: calibrateHwSigma(baseCurve, aa, nonCall, tenor, bStrike, berm.euAnalytic, bType) };
      const be = treeSwaption(baseCurve, hw, nonCall, tenor, bStrike, bType, 'bermudan', 1, 12);
      const eu = treeSwaption(baseCurve, hw, nonCall, tenor, bStrike, bType, 'european', 1, 12);
      return (be - eu) * 1e4;
    });
    return [{ x: as, y: switchValue, type: 'scatter', mode: 'lines+markers', name: 'Bermudan − European' } as Data];
  }, [berm.euAnalytic, nonCall, tenor, bStrike, bType]);

  return (
    <article>
      <LessonHeader id="short-rate" />

      <Section title="1. Vasicek: one random number drives the whole curve">
        <InPlainWords>
          <p>
            So far each option had its own little model: one forward rate, one volatility. That works for caps and swaptions on
            their own, but some products depend on how the <em>whole curve</em> moves over time. The biggest example is the right
            to cancel a loan or swap on several future dates (the Bermudan, section 4). For those we need one model that moves
            the entire yield curve consistently: a <strong>term-structure model</strong>.
          </p>
          <p style={{ marginBottom: 0 }}>
            The simplest approach models just one number, the <Term name="Short rate">short rate</Term> <Tex>r</Tex>: the
            overnight interest rate, roughly the rate the central bank steers. If you know how <Tex>r</Tex> might evolve, you
            know every bond price: a bond's price is the average, over all possible future paths of r, of the discounting along
            each path. Every longer rate then follows from the short rate.
          </p>
        </InPlainWords>
        <TexBlock>{String.raw`dr = a\,(b - r)\,dt + \sigma\,dW \qquad\text{(Vasicek, 1977)}`}</TexBlock>
        <Symbols
          items={[
            ['dr', 'The change in the short rate over a tiny time step dt'],
            [String.raw`a\,(b - r)\,dt`, <>The <strong>predictable</strong> part: if r is above b it is pulled down, if below it is pulled up</>],
            ['b', 'The long-run level that rates are pulled towards'],
            ['a', <>The <Term name="Mean reversion">mean-reversion</Term> speed: how strong the pull is</>],
            [String.raw`\sigma\,dW`, <>The <strong>random</strong> part: a normally distributed shock of size σ (in bp per year)</>],
          ]}
        />
        <Example title="Mean reversion with numbers">
          Say <Tex>a = 0.2</Tex>, <Tex>b = 4\%</Tex>, and today <Tex>r = 6\%</Tex>. The gap to the long-run level is 2%, so on
          average the rate falls by about <Tex>{String.raw`0.2 \times 2\% = 0.4\%`}</Tex> over the next year, before any random
          shock. The further away it is, the stronger the pull. It works like a rubber band, or like a central bank steering rates back
          towards "normal". A mean-reversion speed of a means a gap closes with a half-life of about ln(2)/a years, here ≈ 3.5 years.
        </Example>
        <Playground
          controls={
            <>
              <Slider label="Mean reversion a" value={va} min={0.01} max={1} step={0.01} onChange={setVa} format={(v) => v.toFixed(2)} />
              <Slider label="Long-run level b" value={vb} min={0} max={0.08} step={0.001} onChange={setVb} format={(v) => pct(v, 1)} />
              <Slider label="Vol σ" value={vs} min={0.001} max={0.03} step={0.0005} onChange={setVs} format={(v) => bp(v)} />
              <Slider label="Today’s short rate r₀" value={vr0} min={-0.01} max={0.08} step={0.001} onChange={setVr0} format={(v) => pct(v, 1)} />
            </>
          }
        >
          <div className="grid-2">
            <Chart data={[...pathTraces(vasPaths.times, vasPaths.paths), ...vasBand]} x="Years" y="Short rate (%)" />
            <Chart data={vasCurve} x="Maturity (years)" y="Zero rate (%)" />
          </div>
        </Playground>
        <TryThis
          items={[
            'Try to make the Vasicek curve (right) match the market curve. You will not manage it: with three constants the model can produce only a few shapes. A model that cannot price today’s bonds cannot be used to hedge them.',
            'Set a = 0.01. Paths wander far and the ±2sd band widens like √t. Set a = 1: the band quickly settles. Mean reversion caps long-run uncertainty.',
            'Make σ large with a small a and watch the long end of the curve bend down. That is convexity: uncertainty about rates makes bonds more valuable.',
          ]}
        />
      </Section>

      <Section title="2. Hull–White: fit today’s curve exactly">
        <TexBlock>{String.raw`dr = \big[\theta(t) - a\,r\big]\,dt + \sigma\,dW, \qquad r(t) = x(t) + \varphi(t),\quad \varphi(t) = f(0,t) + \frac{\sigma^2}{2a^2}\big(1-e^{-at}\big)^2`}</TexBlock>
        <InPlainWords>
          <p>
            Vasicek's big problem (section 1): with only three constant parameters it cannot reproduce today's actual yield
            curve. A model that misprices simple bonds is useless for pricing options on them, because you could not even hedge
            with it.
          </p>
          <p style={{ marginBottom: 0 }}>
            Hull and White (1990) fixed this by letting the target level change over time: <Tex>{String.raw`\theta(t)`}</Tex>{' '}
            instead of a constant <Tex>b</Tex>. That one function is chosen so that the model reproduces <strong>every</strong>{' '}
            discount factor on today's curve exactly. In effect the short rate moves randomly <em>around the forward curve</em> (the
            dashed line in the left chart sits on top of the red forward curve). The two remaining parameters, <Tex>a</Tex> and{' '}
            <Tex>{String.raw`\sigma`}</Tex>, are then chosen to match option prices.
          </p>
        </InPlainWords>
        <Symbols
          items={[
            [String.raw`\theta(t)`, 'Time-dependent target, chosen so the model fits today’s yield curve exactly'],
            ['x(t)', 'The random part: a mean-reverting process that starts at 0'],
            [String.raw`\varphi(t)`, 'The deterministic part: the forward curve plus a small correction for convexity'],
            ['f(0,t)', 'Today’s instantaneous forward rate for time t (module 2)'],
          ]}
        />
        <p>
          The right-hand chart compares the option vols the model produces with the market's (from module 4). Press
          "Calibrate" to choose σ so the model matches one market point. That is <Term name="Calibration">calibration</Term>.
        </p>
        <Playground
          controls={
            <>
              <Slider label="Mean reversion a" value={a} min={0.005} max={0.25} step={0.005} onChange={setA} format={(v) => v.toFixed(3)} />
              <Slider label="Vol σ" value={sigma} min={0.002} max={0.02} step={0.0001} onChange={setSigma} format={(v) => bp(v, 1)} />
              <Toggle
                label="Swap tenor (vol chart)"
                value={String(tenorIdx)}
                onChange={(v) => setTenorIdx(Number(v))}
                options={swaptionTenorLabels.map((l, i) => ({ value: String(i), label: l }))}
              />
              <button className="button" type="button" onClick={calibrateTo1Y}>
                Calibrate σ to 1Y × {swaptionTenorLabels[tenorIdx]}
              </button>
            </>
          }
        >
          <div className="grid-2">
            <Chart data={hwChart} x="Years" y="Short rate (%)" />
            <Chart data={volTermChart} x="Option expiry (years)" y="ATM normal vol (bp)" />
          </div>
        </Playground>
        <Note title="What mean reversion does to option vols">
          In Hull–White the vol of a forward rate starting at T decays like <Tex>{String.raw`\sigma e^{-aT}`}</Tex>. Higher{' '}
          <Tex>a</Tex> therefore means lower vols for long tenors and long expiries. One (a, σ) pair can match only a slice of
          the vol grid. Desks choose which swaptions to calibrate to (typically the <strong>co-terminal</strong> ones, which
          make up a Bermudan) and use a time-dependent σ(t) to hit them exactly.
        </Note>
        <TryThis
          items={[
            'Press "Calibrate σ". The model now matches the 1Y point. Then change a and calibrate again: the curve pivots around the calibrated point. Mean reversion controls the slope along expiries.',
            'Calibrate to 1Y × 1Y, then switch the chart to the 30Y tenor without recalibrating. One (a, σ) pair cannot fit short and long tenors at once. Desks therefore calibrate only the swaptions relevant to the trade, or move to time-dependent or two-factor models.',
          ]}
        />
      </Section>

      <Section title="3. The trinomial tree">
        <InPlainWords>
          <p>
            You know <strong>game trees</strong> and <strong>backward induction</strong> from game theory: draw every possible
            future, start at the end, and work backwards, choosing the best action at each decision point. Pricing options that
            can be exercised early works exactly the same way.
          </p>
          <p style={{ marginBottom: 0 }}>
            A <Term name="Trinomial tree">trinomial tree</Term> chops time into steps. At each step the interest rate can go{' '}
            <strong>up, stay, or go down</strong>, with probabilities chosen so the tree matches the model's average and
            volatility. Each dot (node) below is one possible state of the world. To value an option, you start at the last
            date, where you know the payoff. You then step back, and at each node the value is the discounted probability-weighted
            average of the three nodes it can move to. That is <Term name="Backward induction">backward induction</Term>.
          </p>
        </InPlainWords>
        <p>Two special features of Hull and White's tree:</p>
        <ul>
          <li>
            <strong>Mean reversion bends the branches</strong>. At the top and bottom edges, nodes can only move back towards
            the middle (very high rates are pulled down), so the tree stops growing wider. Try a higher a below: the tree
            gets narrower.
          </li>
          <li>
            <strong>Each column is shifted up or down</strong> so the tree reprices every bond on today's curve. To find the shift,
            it uses <Term name="Arrow–Debreu price">Arrow–Debreu prices</Term> (the value today of €1 paid only if a particular node
            is reached). Hover over a node to see its value.
          </li>
        </ul>
        <Playground
          controls={
            <>
              <Slider label="Steps (Δt = 0.5y)" value={treeSteps} min={2} max={14} step={1} onChange={setTreeSteps} />
              <Slider label="Mean reversion a" value={treeA} min={0.05} max={0.6} step={0.01} onChange={setTreeA} format={(v) => v.toFixed(2)} />
              <div className="muted" style={{ fontSize: 13 }}>
                j<sub>max</sub> = ⌈0.184 / (aΔt)⌉ = <strong>{treeChart.jMax}</strong>. Hover over a node to see its rate and
                Arrow–Debreu price.
              </div>
            </>
          }
        >
          <Chart data={treeChart.data} x="Time (years)" y="Δt-period rate (%)" height={380} layout={{ hovermode: 'closest', showlegend: false }} />
        </Playground>
        <CodeRef file="src/models/hullwhite.ts">buildTree() and treeSwaption() — tested against the closed-form formulas.</CodeRef>
      </Section>

      <Section title="4. Bermudan swaptions">
        <InPlainWords>
          <p>
            A European swaption can be exercised on one date. A <Term name="Bermudan swaption">Bermudan swaption</Term> can be
            exercised on <em>several</em> dates. (The name is a joke: Bermuda lies between Europe and America, and "American"
            options can be exercised any day.) A "10NC2" receiver gives the right to start receiving a fixed rate until year 10,
            and that right can be used once a year from year 2 ("non-call 2").
          </p>
          <p style={{ marginBottom: 0 }}>
            Where do you meet these? A homeowner with a fixed-rate mortgage can usually repay early and refinance when rates
            fall. That is an embedded option to choose <em>when</em>. Banks hedge the resulting risk with Bermudan swaptions.
            Callable bonds work the same way.
          </p>
        </InPlainWords>
        <p>
          On the tree, the price comes from backward induction. At each exercise date you compare "exercise now" with "wait"
          (the value of keeping the option) and take the better one:{' '}
          <Tex>{String.raw`V = \max(\text{exercise value}, \text{continuation value})`}</Tex>. A Bermudan is worth at least as
          much as the best European inside it. The extra is the <Term name="Switch option">switch option</Term>: the value of
          flexibility.
        </p>
        <Playground
          controls={
            <>
              <Toggle value={bType} onChange={setBType} options={[{ value: 'receiver', label: 'Receiver' }, { value: 'payer', label: 'Payer' }]} />
              <Slider label="Final maturity" value={finalMat} min={3} max={20} step={1} onChange={(v) => { setFinalMat(v); if (nonCall >= v) setNonCall(v - 1); }} format={(v) => `${v}Y`} />
              <Slider label="Non-call period (first exercise)" value={nonCall} min={1} max={finalMat - 1} step={1} onChange={setNonCall} format={(v) => `${v}Y`} />
              <Slider label="Strike vs ATM" value={moneyness} min={-0.015} max={0.015} step={0.0005} onChange={setMoneyness} format={(v) => `${v >= 0 ? '+' : ''}${bp(v)}`} />
              <div className="muted" style={{ fontSize: 13 }}>
                Uses a = {a.toFixed(3)}, σ = {bp(sigma, 1)} from section 2. Strike {pct(bStrike, 3)}.
              </div>
            </>
          }
        >
          <Stats
            items={[
              { label: `European ${nonCall}Y×${tenor}Y (closed form)`, value: `${num(berm.euAnalytic * 1e4, 1)}bp` },
              { label: 'European (tree)', value: `${num(berm.euTree * 1e4, 1)}bp`, hint: 'checks the tree' },
              { label: `Bermudan ${finalMat}NC${nonCall}`, value: `${num(berm.bermudan * 1e4, 1)}bp` },
              { label: 'Switch option', value: `${num((berm.bermudan - berm.euTree) * 1e4, 1)}bp`, hint: 'Bermudan − European' },
            ]}
          />
          <Chart
            data={meanRevChart}
            x="Mean reversion a (σ recalibrated to keep the European price fixed)"
            y="Switch option (bp)"
            height={300}
          />
        </Playground>
        <Note title="The key insight: mean reversion is a correlation parameter">
          The chart re-calibrates σ for each <Tex>a</Tex> so the European price stays the same, then reprices the Bermudan. Higher
          mean reversion lowers the correlation between rates at different dates. The exercise decision then becomes more
          valuable, so the Bermudan premium rises. Europeans cannot tell you <Tex>a</Tex>, yet the Bermudan depends on it. That
          is why Bermudan desks care so much about mean reversion and why it is often marked from other instruments.
        </Note>
      </Section>

      <Takeaways
        items={[
          'Term-structure models move the whole yield curve consistently, which is needed for products like Bermudans that depend on several future dates.',
          'Short-rate models describe the overnight rate. Mean reversion pulls it back towards a target, like a central bank steering rates.',
          'Vasicek cannot fit today’s curve. Hull–White adds a time-dependent target θ(t) and fits it exactly, leaving a and σ to match option prices.',
          'A trinomial tree is a game tree for interest rates. Options are priced by backward induction, exactly as in game theory.',
          'A Bermudan can be exercised on several dates. Its extra value over a European (the switch option) depends on mean reversion.',
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'Why is Hull–White preferred to Vasicek for pricing?',
            options: ['It is lognormal', 'θ(t) lets it reproduce today’s discount curve exactly', 'It has two factors', 'It prevents negative rates'],
            answer: 1,
            why: 'A pricing model must reprice the hedging instruments. Vasicek’s three constants cannot fit an arbitrary curve.',
          },
          {
            q: 'Increasing mean reversion a (with σ fixed) makes long-expiry swaption vols…',
            options: ['Higher', 'Lower', 'Unchanged', 'Negative'],
            answer: 1,
            why: 'Shocks decay at rate a, so rates far in the future move less: vol falls like σ·e^(−aT).',
          },
          {
            q: 'Why do the tree’s branches bend inward at j_max?',
            options: ['To save memory', 'Because mean reversion makes up-moves at high rates unlikely, and keeps probabilities positive', 'To fit the curve', 'Because rates can’t go negative'],
            answer: 1,
            why: 'With standard branching the probabilities turn negative when |j·a·Δt| gets large. Switching the branching keeps them valid and reflects the pull back to the mean.',
          },
          {
            q: 'Holding European swaption prices fixed, higher mean reversion makes a Bermudan…',
            options: ['Cheaper', 'More expensive', 'Unchanged', 'Equal to the European'],
            answer: 1,
            why: 'Higher a means less correlation between rates on the different exercise dates, so the right to choose when to exercise is worth more.',
          },
        ]}
      />
      <LessonFooter id="short-rate" />
    </article>
  );
}
