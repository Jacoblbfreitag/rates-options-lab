import { useMemo, useState } from 'react';
import type { Data } from 'plotly.js';
import { Chart, line, linspace, palette } from '../components/Chart';
import { Playground, Slider, Stats, Toggle, num, pct } from '../components/Controls';
import { Tex, TexBlock } from '../components/Formula';
import { Example, InPlainWords, LessonFooter, LessonHeader, Note, Quiz, Section, Symbols, Takeaways, Term, TryThis } from '../components/Lesson';
import { normCdf, normPdf } from '../models/math/normal';

type Side = 'buyer' | 'seller';
type Kind = 'call' | 'put';

export default function StartHere() {
  // ── Section 1: profit at expiry ──
  const [kind, setKind] = useState<Kind>('call');
  const [side, setSide] = useState<Side>('buyer');
  const [strike, setStrike] = useState(100);
  const [premium, setPremium] = useState(5);
  const profitChart = useMemo(() => {
    const xs = linspace(50, 150, 201);
    const payoff = (s: number) => (kind === 'call' ? Math.max(s - strike, 0) : Math.max(strike - s, 0));
    const profit = (s: number) => (side === 'buyer' ? payoff(s) - premium : premium - payoff(s));
    return [
      line(xs, xs.map(profit), `${side === 'buyer' ? 'Buyer' : 'Seller'}’s profit at expiry`, { line: { width: 3 } }),
      line([50, 150], [0, 0], 'Break-even line', { line: { dash: 'dot', color: '#5f6b7a', width: 1 } }),
    ];
  }, [kind, side, strike, premium]);
  const breakEven = kind === 'call' ? strike + premium : strike - premium;

  // ── Section 3: present value ──
  const [amount, setAmount] = useState(100);
  const [rate, setRate] = useState(0.04);
  const [years, setYears] = useState(5);
  const pv = amount / Math.pow(1 + rate, years);
  const pvChart = useMemo(() => {
    const ts = linspace(0, 30, 121);
    return [0.01, 0.03, 0.05, 0.08].map((r) => line(ts, ts.map((t) => 100 / Math.pow(1 + r, t)), `rate ${pct(r, 0)}`));
  }, []);

  // ── Section 4: a borrower with and without a cap ──
  const [capStrike, setCapStrike] = useState(0.04);
  const loan = 10_000_000;
  const capCost = 0.0025; // illustrative premium: 0.25% of the loan per year
  const capChart = useMemo(() => {
    const rates = linspace(0, 0.08, 161);
    return [
      line(rates.map((r) => r * 100), rates.map((r) => (r * loan) / 1e3), 'Interest cost without a cap', { line: { color: palette[0] } }),
      line(rates.map((r) => r * 100), rates.map((r) => ((Math.min(r, capStrike) + capCost) * loan) / 1e3), 'With a cap (incl. its cost)', {
        line: { width: 3, color: palette[1] },
      }),
    ];
  }, [capStrike]);

  // ── Section 5: the normal distribution ──
  const [x, setX] = useState(1);
  const bellChart = useMemo(() => {
    const zs = linspace(-4, 4, 321);
    const left = zs.filter((z) => z <= x);
    return [
      { x: left, y: left.map(normPdf), type: 'scatter', mode: 'lines', fill: 'tozeroy', name: `Area = N(${x.toFixed(2)})`, line: { color: '#1f6fb4' } } as Data,
      line(zs, zs.map(normPdf), 'Bell curve', { line: { color: '#14243a' } }),
    ];
  }, [x]);

  return (
    <article>
      <LessonHeader id="start" />

      <Section title="1. What is an option?">
        <InPlainWords>
          <p>
            An option is a <strong>reservation on a price</strong>. Suppose a house is for sale at €300,000 and you pay the
            owner €5,000 today for the right to buy it at that price any time in the next year. If house prices jump, you use
            your right and buy below market value. If prices fall, you walk away and lose only the €5,000.
          </p>
          <p style={{ marginBottom: 0 }}>
            That is all an option is: the <strong>right, but not the obligation</strong>, to buy or sell something at a price
            fixed today. The €5,000 is the <Term name="Premium">premium</Term>. Because you can always walk away, your
            downside is limited while your upside is not. That asymmetry is why options are worth paying for.
          </p>
        </InPlainWords>
        <ul>
          <li>
            A <Term name="Call option">call</Term> is the right to <strong>buy</strong> at the <Term name="Strike">strike</Term>{' '}
            price <Tex>K</Tex>. It pays off when the price goes <em>up</em>.
          </li>
          <li>
            A <Term name="Put option">put</Term> is the right to <strong>sell</strong> at <Tex>K</Tex>. It pays off when the
            price goes <em>down</em>, so it works like insurance against a fall.
          </li>
          <li>
            Every option has a <strong>buyer</strong> (pays the premium, holds the right) and a <Term name="Writer">seller</Term>{' '}
            (receives the premium, must pay if the buyer exercises). It is a zero-sum game: what one gains, the other loses.
          </li>
        </ul>
        <Example title="Worked example: a call on a share">
          <p>
            You pay a premium of €5 for a call with strike €100, expiring in one year. In a year's time the share price is{' '}
            <Tex>S_T</Tex>:
          </p>
          <table>
            <thead>
              <tr>
                <th>Share price at expiry</th>
                <th>Exercise?</th>
                <th>Payoff</th>
                <th>Profit (payoff − premium)</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>€80</td><td>No: why pay €100 for something worth €80?</td><td>€0</td><td>−€5</td></tr>
              <tr><td>€100</td><td>Doesn't matter</td><td>€0</td><td>−€5</td></tr>
              <tr><td>€105</td><td>Yes</td><td>€5</td><td>€0 (break-even)</td></tr>
              <tr><td>€130</td><td>Yes: buy at €100, worth €130</td><td>€30</td><td>+€25</td></tr>
            </tbody>
          </table>
          <p style={{ marginBottom: 0 }}>
            The payoff of a call is therefore <Tex>{String.raw`\max(S_T - K,\, 0)`}</Tex>: either the gain from exercising,
            or zero if you walk away. The profit subtracts the premium you paid at the start.
          </p>
        </Example>
        <Playground
          controls={
            <>
              <Toggle value={kind} onChange={setKind} options={[{ value: 'call', label: 'Call' }, { value: 'put', label: 'Put' }]} />
              <Toggle value={side} onChange={setSide} options={[{ value: 'buyer', label: 'Buyer' }, { value: 'seller', label: 'Seller' }]} />
              <Slider label="Strike K" value={strike} min={70} max={130} step={1} onChange={setStrike} format={(v) => `€${v}`} />
              <Slider label="Premium" value={premium} min={0} max={20} step={0.5} onChange={setPremium} format={(v) => `€${v}`} />
            </>
          }
        >
          <Stats
            items={[
              { label: 'Break-even price', value: `€${breakEven.toFixed(1)}` },
              { label: 'Maximum loss', value: side === 'buyer' ? `€${premium}` : kind === 'call' ? 'Unlimited' : `€${(strike - premium).toFixed(1)}` },
              { label: 'Maximum gain', value: side === 'buyer' ? (kind === 'call' ? 'Unlimited' : `€${(strike - premium).toFixed(1)}`) : `€${premium}` },
            ]}
          />
          <Chart data={profitChart} x="Share price at expiry (€)" y="Profit (€)" />
        </Playground>
        <TryThis
          items={[
            'Switch between Buyer and Seller. The two charts are mirror images: the seller’s profit is exactly the buyer’s loss.',
            'As a seller of a call, the most you can make is the premium, and your possible loss is unlimited. Why would anyone sell options? (They charge a fair premium for taking on that risk, much as an insurance company does.)',
            'Look at a put buyer. It works like insurance on something you own: you pay a small premium, and you are protected if the price falls below K.',
          ]}
        />
      </Section>

      <Section title="2. Why do people buy options?">
        <p>There are two main reasons, and you will meet both throughout the course:</p>
        <ul>
          <li>
            <Term name="Hedging">Hedging</Term> means <strong>reducing a risk you already have</strong>. An airline worried about
            fuel prices buys calls on oil. A company with a floating-rate loan buys a <Term name="Cap">cap</Term> so its
            interest rate can never exceed, say, 4%. This is the insurance use, and it is the main reason interest rate
            options exist.
          </li>
          <li>
            <Term name="Speculation">Speculation</Term> means <strong>betting on a view</strong>. Options give{' '}
            <Term name="Leverage">leverage</Term>: a small premium gives exposure to a large amount.
          </li>
        </ul>
        <Example title="Worked example: leverage">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>You pay today</th>
                <th>Share goes to €110</th>
                <th>Share goes to €90</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Buy the share</td><td>€100</td><td>+€10 (+10%)</td><td>−€10 (−10%)</td></tr>
              <tr><td>Buy a €100 call</td><td>€5</td><td>+€5 (+100%)</td><td>−€5 (−100%)</td></tr>
            </tbody>
          </table>
          <p style={{ marginBottom: 0 }}>
            The same 10% move in the share doubles or wipes out the option. That is why options are both useful and risky.
          </p>
        </Example>
      </Section>

      <Section title="3. Money later is worth less than money now">
        <InPlainWords>
          You already know this idea from economics: €100 today can be put in the bank and earn interest, so €100 received in
          five years is worth <em>less</em> than €100 today. Converting a future amount into today's money is called{' '}
          <Term name="Present value">discounting</Term>. Every option price in this course is a <em>discounted</em> expected
          payoff, because the payoff arrives in the future.
        </InPlainWords>
        <TexBlock>{String.raw`PV = \frac{X}{(1+r)^T}`}</TexBlock>
        <Symbols
          items={[
            ['PV', 'Present value: what the future payment is worth today'],
            ['X', 'The amount you will receive in the future'],
            ['r', 'The interest rate per year, as a decimal (4% = 0.04)'],
            ['T', 'Number of years until you receive it'],
          ]}
        />
        <Playground
          controls={
            <>
              <Slider label="Future amount X" value={amount} min={10} max={1000} step={10} onChange={setAmount} format={(v) => `€${v}`} />
              <Slider label="Interest rate r" value={rate} min={0} max={0.12} step={0.0025} onChange={setRate} format={(v) => pct(v)} />
              <Slider label="Years T" value={years} min={0} max={30} step={1} onChange={setYears} format={(v) => `${v}y`} />
            </>
          }
        >
          <Stats
            items={[
              { label: 'Present value', value: `€${num(pv, 2)}` },
              { label: 'Discount factor', value: num(pv / amount, 4), hint: 'value today of €1 paid in T years' },
            ]}
          />
          <Chart data={pvChart} x="Years until payment" y="Value today of €100" height={300} />
        </Playground>
        <Note title="Why this matters for interest rate options">
          The <Term name="Discount factor">discount factor</Term>, the value today of €1 paid at a future date, is the
          single most important object in interest rate maths. A <Term name="Bond">bond</Term> is a promise of future
          payments, so its price is a sum of discount factors. That gives you a key fact:{' '}
          <strong>when interest rates go up, bond prices go down</strong>. Try it above: raise r and watch the present value fall.
        </Note>
      </Section>

      <Section title="4. What are interest rate options?">
        <p>
          With interest rate options the "thing" being bought or sold is not a share. It is an <strong>interest rate</strong>.
          The most common ones:
        </p>
        <ul>
          <li>
            A <Term name="Cap">cap</Term> (module 3) is insurance for a borrower against rates going <em>above</em> a
            level. A <Term name="Floor">floor</Term> is insurance for a lender against rates going <em>below</em> a level.
          </li>
          <li>
            A <Term name="Swaption">swaption</Term> (module 4) is the right to lock in a fixed interest rate for several years,
            starting at a future date. Think of it as the right to fix your mortgage rate next year at today's agreed rate.
          </li>
          <li>
            A <Term name="Bermudan swaption">Bermudan swaption</Term> (module 6) is the same right, but it can be used on any of
            several dates. It is built into many callable bonds and mortgages.
          </li>
        </ul>
        <Example title="Worked example: a company’s €10m floating-rate loan">
          <p>
            A company pays a floating rate (it resets every quarter to the market rate) on a €10m loan. If rates rise from 3% to
            7%, its yearly interest bill jumps from €300k to €700k. It buys a cap at 4% for an (illustrative) cost of 0.25% a
            year. Now, however high rates go, it never pays more than 4% + 0.25% = 4.25%, i.e. €425k a year.
          </p>
          <Slider label="Cap strike" value={capStrike} min={0.01} max={0.07} step={0.0025} onChange={setCapStrike} format={(v) => pct(v)} />
          <Chart data={capChart} x="Market interest rate (%)" y="Yearly interest cost (€ thousands)" height={280} />
          <p style={{ marginBottom: 0 }}>
            When rates are low, the cap costs a little (the blue line is lower than the orange). When rates are high, it saves
            a lot. That is insurance. Module 3 shows how to work out the <em>fair</em> price of that cap.
          </p>
        </Example>
      </Section>

      <Section title="5. How to read the maths in this course">
        <p>
          The formulas look scary at first, but they use only a handful of symbols. Each formula in the course comes with a
          "What each symbol means" table like this one:
        </p>
        <Symbols
          items={[
            [String.raw`\sigma`, <><strong>sigma</strong>: volatility, i.e. how much a price or rate typically moves in a year</>],
            [String.raw`\tau`, <><strong>tau</strong>: the length of an interest period in years (0.25 = a quarter)</>],
            [String.raw`\Delta, \Gamma`, <><strong>Delta, Gamma</strong>: sensitivities of a price to the underlying (module 1)</>],
            [String.raw`\rho`, <><strong>rho</strong>: usually a correlation, i.e. how much two things move together (between −1 and 1)</>],
            [String.raw`\textstyle\sum_{i=1}^{n} x_i`, <><strong>Sum</strong>: add up <Tex>x_1 + x_2 + \dots + x_n</Tex></>],
            ['e^{x},\ \ln x', <>The exponential and its inverse, the natural log. <Tex>{'e^{-rT}'}</Tex> is the discount factor with continuously compounded interest. It is almost the same as <Tex>{'1/(1+r)^T'}</Tex></>],
            ['\\max(a, b)', <>The larger of a and b. <Tex>{'\\max(S-K,0)'}</Tex> = "the gain if positive, otherwise zero"</>],
            ['N(x)', <>The probability that a bell-curve variable is below x. See the chart below</>],
            ['F,\\ K,\\ T', <>Forward rate, strike, and time to expiry: the three numbers in every rate-option formula</>],
          ]}
        />
        <h3>The bell curve and N(x)</h3>
        <p>
          Option models assume that future prices or rates are uncertain, and they describe that uncertainty with the{' '}
          <Term name="Normal distribution">normal distribution</Term>, the bell curve from your statistics course. Option formulas
          constantly ask: <em>what is the probability that the outcome ends up above or below the strike?</em> The answer is the
          shaded area under the bell curve, written <Tex>N(x)</Tex>.
        </p>
        <div className="grid-2">
          <div>
            <Slider label="x" value={x} min={-3} max={3} step={0.05} onChange={setX} format={(v) => v.toFixed(2)} />
            <Stats items={[{ label: `N(${x.toFixed(2)})`, value: pct(normCdf(x), 1), hint: 'shaded area = probability of being below x' }]} />
            <p className="muted">
              N(0) = 50% (half the curve is below the middle). N(1.96) ≈ 97.5%, the number behind the familiar "95% confidence"
              interval.
            </p>
          </div>
          <Chart data={bellChart} x="x (standard deviations)" y="Density" height={260} />
        </div>
      </Section>

      <Takeaways
        items={[
          'An option is a right, not an obligation. The buyer pays a premium; the seller receives it and takes the risk.',
          'Call = right to buy (profits when prices rise). Put = right to sell (profits when prices fall).',
          'Payoff at expiry: call max(S − K, 0), put max(K − S, 0). Profit = payoff − premium.',
          'Money in the future is worth less today. Option prices are discounted expected payoffs.',
          'Interest rate options are mostly insurance: caps for borrowers, floors for lenders, swaptions to lock in fixed rates.',
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'You buy a put with strike €50 for a premium of €3. At expiry the share is at €44. What is your profit?',
            options: ['€6', '€3', '−€3', '€9'],
            answer: 1,
            why: 'Payoff = max(50 − 44, 0) = €6. Profit = 6 − 3 premium = €3.',
          },
          {
            q: 'What is the most the BUYER of an option can lose?',
            options: ['Nothing', 'The premium paid', 'The strike price', 'Unlimited'],
            answer: 1,
            why: 'The buyer can always walk away, so the worst case is losing the premium. The seller is the one with potentially large losses.',
          },
          {
            q: 'At an interest rate of 5%, what is €100 received in 2 years worth today?',
            options: ['About €110.25', '€100', 'About €90.70', '€95'],
            answer: 2,
            why: '100 / 1.05² = 100 / 1.1025 ≈ €90.70.',
          },
          {
            q: 'A company has a floating-rate loan and is worried rates will rise. What should it buy?',
            options: ['A floor', 'A cap', 'A bond', 'Nothing — rising rates help borrowers'],
            answer: 1,
            why: 'A cap pays out when rates go above the strike, which offsets the borrower’s higher interest bill.',
          },
          {
            q: 'Interest rates rise. What happens to bond prices?',
            options: ['They rise', 'They fall', 'They stay the same', 'It depends on the strike'],
            answer: 1,
            why: 'A bond’s price is the present value of its fixed payments. Higher rates mean heavier discounting, so the price falls.',
          },
        ]}
      />
      <LessonFooter id="start" />
    </article>
  );
}
