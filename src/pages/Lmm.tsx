import { useEffect, useMemo, useRef, useState } from 'react';
import type { Data } from 'plotly.js';
import { Chart, line, linspace } from '../components/Chart';
import { Playground, Slider, Stats, Toggle, num, pct } from '../components/Controls';
import { Tex, TexBlock } from '../components/Formula';
import { CodeRef, LessonFooter, LessonHeader, Note, Quiz, Section, TryThis } from '../components/Lesson';
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
        <p>
          Short-rate models describe one unobservable number and <em>derive</em> forward rates from it. The LIBOR Market Model
          (BGM/Jamshidian, 1997) flips this around. It models the observable simple forward rates{' '}
          <Tex>{String.raw`F_i(t) = F(t; T_i, T_{i+1})`}</Tex>, each lognormal with its own vol:
        </p>
        <TexBlock>{String.raw`\frac{dF_i}{F_i} = \mu_i(t)\,dt + \sigma_i(t)\,dW_i, \qquad dW_i\,dW_j = \rho_{ij}\,dt`}</TexBlock>
        <p>
          Under the <Tex>{String.raw`T_{i+1}`}</Tex>-forward measure, the one that discounts from the caplet's payment date,{' '}
          <Tex>{'F_i'}</Tex> is a martingale with no drift. So the caplet price is <strong>exactly Black-76</strong> with vol{' '}
          <Tex>{String.raw`\bar\sigma_i^2 = \frac{1}{T_i}\int_0^{T_i}\sigma_i(t)^2dt`}</Tex>. That is why the model is called a "market"
          model: it is consistent with how the market already quotes caps.
        </p>
        <Note title="Why the drift appears">
          Each forward is driftless only under <em>its own</em> measure. To simulate all of them together we need a single measure.
          We use the <strong>spot LIBOR measure</strong> (roll a deposit from reset to reset), and in that measure every forward
          picks up a drift from its correlation with the forwards before it:
          <TexBlock>{String.raw`\mu_i(t) = \sigma_i(t) \sum_{j=q(t)}^{i} \frac{\tau\,\rho_{ij}\,\sigma_j(t)\,F_j(t)}{1 + \tau F_j(t)}`}</TexBlock>
          The drift depends on the other forwards, so there is no closed form for most products. We use Monte Carlo.
          (The LIBOR name is historical. The same model is used today on SOFR forward rates.)
        </Note>
      </Section>

      <Section title="2. Volatility and correlation">
        <p>
          The standard parametrisation (Rebonato) makes the instantaneous vol a function of <em>time to reset</em>, so the vol
          structure looks the same tomorrow as today ("time-homogeneous"):
        </p>
        <TexBlock>{String.raw`\sigma_i(t) = \varphi(T_i - t), \qquad \varphi(x) = (a + b\,x)\,e^{-c\,x} + d, \qquad \rho_{ij} = e^{-\beta|T_i - T_j|}`}</TexBlock>
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
        <p>
          The simulation steps all live forwards with a log-Euler scheme, so they stay positive. It uses correlated normals
          from the Cholesky factor of <Tex>{String.raw`\rho`}</Tex>, rolls the spot numeraire{' '}
          <Tex>{String.raw`B(T_{k+1}) = B(T_k)(1+\tau F_k(T_k))`}</Tex>, and discounts every payoff by it. It runs in a background
          thread.
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
        <p>
          A full LMM calibration fits the vol function to caplets (as above) and the correlation to swaptions, typically using
          Rebonato's formula:
        </p>
        <TexBlock>{String.raw`\sigma_{\text{swpt}}^2\,T_e\,S_0^2 \approx \sum_{i,j} w_i w_j F_i F_j \rho_{ij} \int_0^{T_e}\sigma_i(t)\sigma_j(t)\,dt, \qquad w_i = \frac{\tau P(0,T_{i+1})}{A_0}`}</TexBlock>
        <p>
          With the model calibrated, you can price what the market does not quote: Bermudans (with Longstaff–Schwartz regression
          for the exercise decision), CMS spread options, ratchets and range accruals. Modern desks use displaced-diffusion or
          SABR-LMM extensions so the model also fits the smile from module 5.
        </p>
      </Section>

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
