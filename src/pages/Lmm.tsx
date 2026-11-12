import { useEffect, useMemo, useRef, useState } from 'react';
import type { Data } from 'plotly.js';
import { Chart, line, linspace } from '../components/Chart';
import { Playground, Slider, Stats, Toggle, num, pct } from '../components/Controls';
import { Tex, TexBlock } from '../components/Formula';
import { CodeRef, InPlainWords, LessonFooter, LessonHeader, Note, Quiz, Section, Symbols, Takeaways, Term, TryThis } from '../components/Lesson';
import { baseCurve } from '../data/curves';
import { lmmCapletBlackVols } from '../data/market';
import { abcdVol, calibrateAbcd, capletVolFromAbcd, correlation, lmmSetup, type Abcd, type LmmResult } from '../models/lmm';

const HORIZON = 10;

export default function Lmm() {
  // ── Vol & correlation ──
  const [abcd, setAbcd] = useState<Abcd>({ a: 0.15, b: 0.6, c: 1.2, d: 0.2 });
  const [beta, setBeta] = useState(0.1);
  const [rmse, setRmse] = useState<number | null>(null);
  const set = (k: keyof Abcd) => (v: number) => {
    setAbcd((p) => ({ ...p, [k]: v }));
    setRmse(null);
  };
  const xs = useMemo(() => linspace(0, 10, 101), []);
  const volChart = useMemo(
    () => [
      line(xs, xs.map((x) => abcdVol(abcd, x) * 100), 'Instantaneous vol φ(T − t)', { line: { dash: 'dot' } }),
      line(xs.slice(1), xs.slice(1).map((T) => capletVolFromAbcd(abcd, T) * 100), 'Caplet Black vol (model)'),
      {
        x: lmmCapletBlackVols.map((q) => q.expiry),
        y: lmmCapletBlackVols.map((q) => q.vol * 100),
        type: 'scatter',
        mode: 'markers',
        name: 'Market caplet vols',
        marker: { size: 9, color: '#c2453c' },
      } as Data,
    ],
    [abcd, xs],
  );
  const corrTimes = useMemo(() => Array.from({ length: 10 }, (_, i) => i + 1), []);
  const corrChart = useMemo(
    () => [
      {
        type: 'heatmap',
        x: corrTimes.map((t) => `${t}Y`),
        y: corrTimes.map((t) => `${t}Y`),
        z: corrTimes.map((ti) => corrTimes.map((tj) => correlation(ti, tj, beta))),
        zmin: 0,
        zmax: 1,
        colorscale: 'Blues',
        texttemplate: '%{z:.2f}',
        showscale: false,
      } as Data,
    ],
    [beta, corrTimes],
  );

  // ── Monte Carlo (in a Web Worker) ──
  const [tau, setTau] = useState<'1' | '0.5'>('1');
  const [nPaths, setNPaths] = useState(10000);
  const [steps, setSteps] = useState(4);
  const [expiryYears, setExpiryYears] = useState(3);
  const [seed, setSeed] = useState(1);
  const [running, setRunning] = useState(false);
  const [mc, setMc] = useState<{ result: LmmResult; ms: number; tau: number } | null>(null);
  const [snapshot, setSnapshot] = useState(0);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => () => workerRef.current?.terminate(), []);

  const run = () => {
    workerRef.current?.terminate();
    const worker = new Worker(new URL('../workers/lmm.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    const t = Number(tau);
    const setup = lmmSetup(baseCurve, t, HORIZON, abcd, beta);
    setRunning(true);
    worker.onmessage = (e: MessageEvent<{ result: LmmResult; ms: number }>) => {
      setMc({ ...e.data, tau: t });
      setSnapshot(0);
      setRunning(false);
      worker.terminate();
    };
    worker.postMessage({ setup, opts: { nPaths, stepsPerPeriod: steps, seed, expiryIndex: Math.round(expiryYears / t) } });
  };

  const capletChart = useMemo(() => {
    if (!mc) return [];
    const c = mc.result.caplets;
    return [
      {
        x: c.map((r) => r.reset),
        y: c.map((r) => r.mc * 1e4),
        error_y: { type: 'data', array: c.map((r) => 2 * r.se * 1e4), visible: true },
        type: 'scatter',
        mode: 'markers',
        name: 'Monte Carlo ± 2 s.e.',
        marker: { size: 8 },
      } as Data,
      line(c.map((r) => r.reset), c.map((r) => r.black * 1e4), 'Black-76 (exact in the LMM)'),
    ];
  }, [mc]);

  const pathChart = useMemo(() => {
    if (!mc) return { data: [] as Data[], maxK: 0 };
    const { samplePaths, times } = mc.result;
    const perPeriod = Math.round(mc.tau / (times[1] - times[0]));
    const maxK = times.length - 1;
    const k = Math.min(snapshot, maxK);
    const t = times[k];
    const N = samplePaths[0][0].length;
    const resets = Array.from({ length: N }, (_, i) => i * mc.tau);
    const data = samplePaths.slice(0, 6).map((p, pi) => {
      // Forwards already fixed are shown at their fixing value (they no longer move).
      const fwd = resets.map((T, i) => p[Math.min(k, Math.round((T / mc.tau) * perPeriod))][i] * 100);
      return line(resets, fwd, `path ${pi + 1}`, { mode: 'lines+markers' });
    });
    data.push(line(resets, samplePaths[0][0].map((f) => f * 100), 'Today’s forwards', { line: { color: '#14243a', dash: 'dash', width: 3 } }));
    data.push({ x: [t, t], y: [0, 8], type: 'scatter', mode: 'lines', name: `t = ${t.toFixed(2)}y`, line: { color: '#c2453c', width: 1 } } as Data);
    return { data, maxK };
  }, [mc, snapshot]);

  return (
    <article>
      <LessonHeader id="lmm" />

      <Section title="1. Model the market’s rates directly">
        <InPlainWords>
          <p>
            Module 6 modelled one invisible number (the overnight rate) and <em>derived</em> everything else from it. The LIBOR
            Market Model (LMM) takes the opposite approach. It directly models the rates the market actually trades: the{' '}
            <Term name="Forward rate">forward rates</Term> for each future period (year 1–2, year 2–3, …).
          </p>
          <p>
            Picture each forward rate as its own "share price" that wiggles randomly, as in Black–Scholes. There are ten of them
            for a 10-year horizon, and they don't move independently: when the 3-year forward goes up, the 4-year forward
            usually goes up too. So the model has two ingredients: <strong>a volatility for each forward</strong> and{' '}
            <strong>a correlation between each pair</strong>.
          </p>
          <p style={{ marginBottom: 0 }}>
            The payoff: since each forward behaves like a Black–Scholes asset, caplets come out <strong>exactly</strong> at
            the Black-76 prices the market quotes (module 3). That is why it is called a "market" model. The name LIBOR is
            historical; today the same model is used on SOFR forward rates.
          </p>
        </InPlainWords>
        <TexBlock>{String.raw`\frac{dF_i}{F_i} = \mu_i(t)\,dt + \sigma_i(t)\,dW_i, \qquad dW_i\,dW_j = \rho_{ij}\,dt`}</TexBlock>
        <Symbols
          items={[
            ['F_i(t)', 'Forward rate i: the rate for the period from T_i to T_{i+1}, as seen at time t'],
            [String.raw`dF_i / F_i`, 'The percentage change of that forward (lognormal, like a share price)'],
            [String.raw`\sigma_i(t)`, 'Its volatility (section 2)'],
            [String.raw`\rho_{ij}`, 'Correlation between the random shocks of forwards i and j (between −1 and 1)'],
            [String.raw`\mu_i(t)`, 'A drift term, explained in the box below'],
          ]}
        />
        <p>
          For a single caplet the drift <Tex>{String.raw`\mu_i`}</Tex> can be made zero, so its price is exactly Black-76 with
          the forward's average volatility <Tex>{String.raw`\bar\sigma_i^2 = \frac{1}{T_i}\int_0^{T_i}\sigma_i(t)^2dt`}</Tex>.
        </p>
        <Note title="Why the drift appears (optional, a bit technical)">
          <p>
            Prices are always measured in some unit, the <Term name="Numeraire">numeraire</Term>, much like choosing a currency.
            Measured in the "right" unit (a bond paying on the caplet's payment date), forward i has no drift, which is why its
            caplet is plain Black-76. But each forward has a <em>different</em> right unit. To simulate all of them together in
            one consistent world we must pick a single unit, just as you must convert everything to one currency before adding it up.
          </p>
          We use the <Term name="Spot measure">spot measure</Term> (the unit is a deposit rolled from period to period), and then
          each forward needs a correction to its drift, which comes from its correlation with the forwards before it:
          <TexBlock>{String.raw`\mu_i(t) = \sigma_i(t) \sum_{j=q(t)}^{i} \frac{\tau\,\rho_{ij}\,\sigma_j(t)\,F_j(t)}{1 + \tau F_j(t)}`}</TexBlock>
          The drift depends on the other forwards, so most products have no formula. We price them by simulation (section 3).
        </Note>
      </Section>

      <Section title="2. Volatility and correlation">
        <InPlainWords>
          <p>
            How volatile is each forward rate? Market caplet vols (the red dots below) show a typical <strong>hump</strong>:
            rates about 1–3 years ahead are the most uncertain. Very short rates are pinned down by the central bank's current
            policy, and very long ones are anchored by long-run expectations. The middle is where the market is most unsure what
            the central bank will do.
          </p>
          <p style={{ marginBottom: 0 }}>
            The <Term name="abcd volatility">abcd</Term> formula draws such a hump with four numbers. It makes a forward's vol
            depend on <em>how long until it is fixed</em>, so the shape looks the same next year as today. That is a sensible,
            stable assumption.
          </p>
        </InPlainWords>
        <TexBlock>{String.raw`\sigma_i(t) = \varphi(T_i - t), \qquad \varphi(x) = (a + b\,x)\,e^{-c\,x} + d, \qquad \rho_{ij} = e^{-\beta|T_i - T_j|}`}</TexBlock>
        <Symbols
          items={[
            ['x = T_i - t', 'Time left until forward i is fixed'],
            [String.raw`\varphi(x)`, 'Volatility of a forward that is x years from fixing'],
            ['a + d', 'Vol just before fixing (x = 0)'],
            ['b,\ c', 'Size and position of the hump: (a + bx) rises, e^{−cx} eventually pulls it down'],
            ['d', 'Long-run vol for forwards far in the future'],
            [String.raw`\beta`, 'Decorrelation: how quickly correlation falls as two forwards are further apart in time'],
          ]}
        />
        <Playground
          controls={
            <>
              <Slider label="a (vol at reset ≈ a + d)" value={abcd.a} min={-0.3} max={0.5} step={0.01} onChange={set('a')} format={(v) => v.toFixed(2)} />
              <Slider label="b (hump size)" value={abcd.b} min={0} max={2} step={0.01} onChange={set('b')} format={(v) => v.toFixed(2)} />
              <Slider label="c (hump decay)" value={abcd.c} min={0.05} max={3} step={0.01} onChange={set('c')} format={(v) => v.toFixed(2)} />
              <Slider label="d (long-run vol)" value={abcd.d} min={0.01} max={0.5} step={0.01} onChange={set('d')} format={(v) => v.toFixed(2)} />
              <button
                className="button"
                type="button"
                onClick={() => {
                  const fit = calibrateAbcd(lmmCapletBlackVols, abcd);
                  setAbcd(fit.params);
                  setRmse(fit.rmse);
                }}
              >
                Calibrate to caplet vols
              </button>
              {rmse !== null && <div className="muted" style={{ fontSize: 13 }}>Fit RMSE: {num(rmse * 1e4, 1)} vol bp</div>}
            </>
          }
        >
          <Chart data={volChart} x="Years (time to reset / caplet expiry)" y="Black vol (%)" />
        </Playground>
        <div className="grid-2">
          <div>
            <h3>Correlation between forwards</h3>
            <Slider label="Decorrelation β" value={beta} min={0} max={1} step={0.01} onChange={setBeta} format={(v) => v.toFixed(2)} />
            <p className="muted">
              Caplets depend only on each forward's own vol, so correlation does not affect them at all. Swaptions depend on
              how forwards move together. Lower correlation means the swap rate (an average of forwards) is less volatile.
            </p>
          </div>
          <Chart data={corrChart} height={320} layout={{ margin: { l: 40, r: 10, t: 10, b: 30 } }} />
        </div>
        <TryThis
          items={[
            'Press "Calibrate". The hump in the market caplet vols around 2Y comes from b and c.',
            'Set b = 0 (no hump) and recalibrate by hand. A monotone curve cannot match the market: the hump is real, a feature of how markets expect the central bank to act.',
          ]}
        />
      </Section>

      <Section title="3. Monte Carlo">
        <InPlainWords>
          <p>
            Most LMM prices have no formula, so we use <Term name="Monte Carlo">Monte Carlo</Term> simulation, named after the
            casino. The idea is the <strong>law of large numbers</strong>: to find an expected value, simulate many random
            scenarios and average them.
          </p>
          <ol style={{ marginBottom: 0 }}>
            <li>Generate one random future: move all the forward rates forward in small time steps, with correlated random shocks.</li>
            <li>In that future, work out what the option pays and discount it to today.</li>
            <li>Repeat 10,000 times or more and take the average. That is the price.</li>
            <li>
              The average is itself uncertain. Its <Term name="Standard error">standard error</Term> shrinks like 1/√(number of
              paths), so 4× more paths halves the error.
            </li>
          </ol>
        </InPlainWords>
        <p className="muted">
          Technical details: log-Euler time steps (forwards stay positive), correlated shocks via a{' '}
          <Term name="Cholesky decomposition">Cholesky decomposition</Term>, and payoffs discounted with the rolled deposit{' '}
          <Tex>{String.raw`B(T_{k+1}) = B(T_k)(1+\tau F_k(T_k))`}</Tex>. The simulation runs in a background thread.
        </p>
        <Playground
          controls={
            <>
              <Toggle label="Accrual τ" value={tau} onChange={setTau} options={[{ value: '1', label: 'Annual' }, { value: '0.5', label: 'Semi-annual' }]} />
              <Slider label="Paths" value={nPaths} min={1000} max={50000} step={1000} onChange={setNPaths} format={(v) => v.toLocaleString()} />
              <Slider label="Time steps per period" value={steps} min={1} max={12} step={1} onChange={setSteps} />
              <Slider label="Swaption expiry" value={expiryYears} min={1} max={9} step={1} onChange={setExpiryYears} format={(v) => `${v}Y × ${HORIZON - v}Y`} />
              <Slider label="Random seed" value={seed} min={1} max={50} step={1} onChange={setSeed} />
              <button className="button" type="button" onClick={run} disabled={running}>
                {running ? 'Simulating…' : 'Run simulation'}
              </button>
              <div className="muted" style={{ fontSize: 13 }}>Uses the abcd and β above. Caplets struck at their own forward (ATM).</div>
            </>
          }
        >
          {!mc ? (
            <p className="muted">Press "Run simulation".</p>
          ) : (
            <>
              <Stats
                items={[
                  { label: `${expiryYears}Y×${HORIZON - expiryYears}Y payer (MC)`, value: `${num(mc.result.swaption.mc * 1e4, 2)}bp`, hint: `± ${num(2 * mc.result.swaption.se * 1e4, 2)}bp (2 s.e.)` },
                  { label: 'Rebonato approximation', value: `${num(mc.result.swaption.rebonato * 1e4, 2)}bp`, hint: `Black vol ${pct(mc.result.swaption.rebonatoVol, 1)}` },
                  { label: 'Runtime', value: `${(mc.ms / 1000).toFixed(2)}s` },
                ]}
              />
              <Chart data={capletChart} x="Caplet reset (years)" y="ATM caplet price (bp)" />
            </>
          )}
        </Playground>
        {mc && (
          <>
            <h3>Watch the forward curve evolve</h3>
            <Slider label="Time" value={Math.min(snapshot, pathChart.maxK)} min={0} max={pathChart.maxK} step={1} onChange={setSnapshot} format={(k) => `${mc.result.times[k]?.toFixed(2)}y`} />
            <Chart data={pathChart.data} x="Forward reset date T_i (years)" y="Forward rate F_i (%)" layout={{ yaxis: { range: [0, 8] } }} />
            <p className="muted">
              Each line is one simulated world. Forwards to the left of the red line have already fixed and are frozen. Those to
              the right keep moving. Notice how neighbouring forwards move together (high correlation) while distant ones diverge.
            </p>
          </>
        )}
        <TryThis
          items={[
            'Compare the MC caplets with Black: they agree within the error bars. That is the "market model" property, checked numerically.',
            'Set 1 time step per period and 50,000 paths. Any gap left now is discretisation bias, not noise. Raising the steps removes it.',
            'Set β = 1 (low correlation) and rerun. Caplets do not change, but the swaption gets cheaper. Correlation is a swaption-only parameter.',
            'Compare the MC swaption with Rebonato’s formula. The freezing approximation is usually accurate to well under 1% in price, which is why desks calibrate with it.',
          ]}
        />
        <CodeRef file="src/models/lmm.ts">simulateLmm() — the drift loop is the heart of the model.</CodeRef>
      </Section>

      <Section title="4. Calibration in practice">
        <InPlainWords>
          Calibrating the full model means: choose the vol hump (section 2) to match caplet prices, and the correlation to match
          swaption prices. Simulating every candidate would be far too slow, so desks use a quick approximate formula for swaption
          vols (Rebonato's). The swap rate is roughly a weighted average of the forward rates, so its variance is roughly the
          variance of a weighted portfolio, the same formula as portfolio variance in finance class (Σ wᵢwⱼσᵢσⱼρᵢⱼ).
        </InPlainWords>
        <TexBlock>{String.raw`\sigma_{\text{swpt}}^2\,T_e\,S_0^2 \approx \sum_{i,j} w_i w_j F_i F_j \rho_{ij} \int_0^{T_e}\sigma_i(t)\sigma_j(t)\,dt, \qquad w_i = \frac{\tau P(0,T_{i+1})}{A_0}`}</TexBlock>
        <p>
          With the model calibrated, you can price what the market does not quote: Bermudans (with Longstaff–Schwartz regression
          for the exercise decision), CMS spread options, ratchets and range accruals. Modern desks use displaced-diffusion or
          SABR-LMM extensions so the model also fits the smile from module 5.
        </p>
      </Section>

      <Takeaways
        items={[
          'The LMM models the forward rates directly: each one moves like a Black–Scholes share price, with its own volatility, and they are correlated.',
          'Caplets come out exactly at the market’s Black-76 prices, hence the name “market model”.',
          'To simulate all forwards together they need drift corrections (a change of numeraire), so most prices require Monte Carlo.',
          'Monte Carlo = simulate many random futures, average the discounted payoffs. Error shrinks like 1/√paths.',
          'Caplets depend only on each forward’s vol. Swaptions also depend on correlation, roughly like the variance of a portfolio.',
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'In the LMM, a caplet on F_i is priced…',
            options: ['Only by Monte Carlo', 'Exactly by Black-76 with the average vol of σ_i', 'By Bachelier', 'With a tree'],
            answer: 1,
            why: 'Under its own payment-date forward measure, F_i is a driftless lognormal, which is exactly the Black-76 assumption.',
          },
          {
            q: 'Lowering correlation between forwards (higher β) makes…',
            options: ['Caplets cheaper', 'Swaptions cheaper', 'Both cheaper', 'Neither change'],
            answer: 1,
            why: 'A swap rate is roughly a weighted average of forwards. Less correlation means more diversification and lower vol. Caplets depend on one forward only.',
          },
          {
            q: 'Why do forwards have a drift in the Monte Carlo?',
            options: ['Because rates mean-revert', 'Because we simulate all of them under one common (spot) measure, not each under its own', 'Because of the log-Euler scheme', 'Convexity of bonds'],
            answer: 1,
            why: 'Changing measure from each forward’s own payment measure to a shared numeraire introduces a drift that depends on correlations and the other forwards.',
          },
          {
            q: 'The abcd function gives a humped caplet vol curve. What creates the hump?',
            options: ['d', 'The b·x term multiplied by e^(−cx)', 'Correlation', 'The Monte Carlo'],
            answer: 1,
            why: '(a + bx)·e^(−cx) rises then decays; d sets the long-run level.',
          },
        ]}
      />
      <LessonFooter id="lmm" />
    </article>
  );
}
