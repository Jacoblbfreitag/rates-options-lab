import { Link } from 'react-router-dom';
import { lessons } from '../lessons';

export function Home() {
  return (
    <div className="home">
      <header className="hero">
        <h1>Rates Options Lab</h1>
        <p>
          An interactive course on interest rate options, from Black–Scholes to the LIBOR Market Model. Every model is
          built from scratch in this app's code, and every formula comes with a chart you can push around.
        </p>
      </header>

      <section className="section">
        <h2>How to use this</h2>
        <ol className="how">
          <li>
            <strong>Go in order.</strong> Each module builds on the one before. Rate options are options on forwards
            (module 3–4), the smile breaks the single-vol assumption (5), and term-structure models tie everything
            together (6–7).
          </li>
          <li>
            <strong>Do the "Try this" boxes.</strong> Predict what a chart will do before you move the slider — the
            surprises are where the learning is.
          </li>
          <li>
            <strong>Read the code.</strong> The "In the code" boxes link to the model files. They are short, heavily
            commented and free of UI code, so you can follow the maths line by line.
          </li>
          <li>
            <strong>Take the quiz</strong> at the end of each module.
          </li>
        </ol>
      </section>

      <section className="section">
        <h2>Modules</h2>
        <div className="cards">
          {lessons.map((l) => (
            <Link key={l.id} to={l.path} className="card">
              <div className="card-num">Module {l.number}</div>
              <div className="card-title">{l.title}</div>
              <div className="card-summary">{l.summary}</div>
            </Link>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>Map of the course</h2>
        <div className="roadmap">
          <div><strong>Tools</strong><span>Black–Scholes · Greeks · discount curves</span></div>
          <div><strong>Vanilla rate options</strong><span>Caps/floors · swaptions · Black-76 vs Bachelier</span></div>
          <div><strong>The smile</strong><span>SABR · the vol cube</span></div>
          <div><strong>Term-structure models</strong><span>Vasicek · Hull–White trees · Bermudans · LMM Monte Carlo</span></div>
        </div>
        <p className="muted">
          Recommended companion reading: John Hull, <em>Options, Futures, and Other Derivatives</em> (chapters on
          interest rate derivatives); Brigo &amp; Mercurio, <em>Interest Rate Models — Theory and Practice</em> for
          depth.
        </p>
      </section>
    </div>
  );
}
