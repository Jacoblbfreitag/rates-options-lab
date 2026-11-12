/** Building blocks for lesson pages: sections, callouts, quizzes, code pointers. */
import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { glossary } from '../data/glossary';
import { lessons } from '../lessons';
import { Tex } from './Formula';

export function LessonHeader({ id, children }: { id: string; children?: ReactNode }) {
  const lesson = lessons.find((l) => l.id === id)!;
  return (
    <header className="lesson-header">
      <div className="lesson-kicker">Module {lesson.number}</div>
      <h1>{lesson.title}</h1>
      <p className="lesson-summary">{lesson.summary}</p>
      {children}
      <div className="lesson-goals">
        <strong>By the end you should be able to:</strong>
        <ul>
          {lesson.goals.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      </div>
    </header>
  );
}

export function Section({ title, id, children }: { title: string; id?: string; children: ReactNode }) {
  return (
    <section className="section" id={id}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

/** Background, intuition, or a market-practice remark. */
export function Note({ title = 'Note', children }: { title?: string; children: ReactNode }) {
  return (
    <aside className="callout note">
      <div className="callout-title">{title}</div>
      {children}
    </aside>
  );
}

/** The intuition first, with no maths: what is going on and why anyone cares. */
export function InPlainWords({ children }: { children: ReactNode }) {
  return (
    <aside className="callout plain">
      <div className="callout-title">In plain words</div>
      {children}
    </aside>
  );
}

/** A calculation walked through with concrete numbers. */
export function Example({ title = 'Worked example', children }: { title?: string; children: ReactNode }) {
  return (
    <aside className="callout example">
      <div className="callout-title">{title}</div>
      {children}
    </aside>
  );
}

/** "What each symbol means" table to put right under a formula. */
export function Symbols({ items }: { items: [string, ReactNode][] }) {
  return (
    <details className="symbols" open>
      <summary>What each symbol means</summary>
      <table>
        <tbody>
          {items.map(([tex, meaning]) => (
            <tr key={tex}>
              <td className="sym">
                <Tex>{tex}</Tex>
              </td>
              <td>{meaning}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/** A short summary of the module's main ideas, before the quiz. */
export function Takeaways({ items }: { items: ReactNode[] }) {
  return (
    <section className="section takeaways">
      <h2>Key takeaways</h2>
      <ul>
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </section>
  );
}

/**
 * A glossary term inside running text: hover (or tap) to see the definition,
 * click to open it in the glossary. `name` must match a glossary term exactly.
 */
export function Term({ name, children }: { name: string; children?: ReactNode }) {
  const entry = glossary.find((e) => e.term === name);
  const navigate = useNavigate();
  // Open the tooltip towards whichever side has room, so it never runs off-screen.
  const [alignRight, setAlignRight] = useState(false);
  if (!entry) return <>{children ?? name}</>;
  return (
    <span
      className={`term-link ${alignRight ? 'tip-right' : ''}`}
      onMouseEnter={(e) => setAlignRight(e.currentTarget.getBoundingClientRect().left > window.innerWidth / 2)}
      onFocus={(e) => setAlignRight(e.currentTarget.getBoundingClientRect().left > window.innerWidth / 2)}
      tabIndex={0}
      role="link"
      onClick={() => navigate('/glossary', { state: { q: entry.term } })}
      onKeyDown={(e) => e.key === 'Enter' && navigate('/glossary', { state: { q: entry.term } })}
    >
      {children ?? name}
      <span className="term-tip" role="tooltip">
        <strong>{entry.term}</strong>
        {entry.definition}
      </span>
    </span>
  );
}

/** Hands-on exercises: things to do with the sliders. */
export function TryThis({ items }: { items: ReactNode[] }) {
  return (
    <aside className="callout try">
      <div className="callout-title">Try this</div>
      <ol>
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ol>
    </aside>
  );
}

/** Points to the source file where a model lives, so you can read the real code. */
export function CodeRef({ file, children }: { file: string; children?: ReactNode }) {
  const url = `https://github.com/Jacoblbfreitag/rates-options-lab/blob/main/${file}`;
  return (
    <aside className="callout code">
      <div className="callout-title">In the code</div>
      <a href={url} target="_blank" rel="noreferrer">
        <code>{file}</code>
      </a>
      {children && <div>{children}</div>}
    </aside>
  );
}

export interface QuizQuestion {
  q: ReactNode;
  options: ReactNode[];
  answer: number;
  why: ReactNode;
}

export function Quiz({ questions }: { questions: QuizQuestion[] }) {
  const [picked, setPicked] = useState<(number | null)[]>(questions.map(() => null));
  const score = picked.filter((p, i) => p === questions[i].answer).length;
  const done = picked.every((p) => p !== null);
  return (
    <section className="section quiz">
      <h2>Check your understanding</h2>
      {questions.map((qq, qi) => (
        <div className="quiz-q" key={qi}>
          <div className="quiz-text">
            {qi + 1}. {qq.q}
          </div>
          <div className="quiz-options">
            {qq.options.map((o, oi) => {
              const chosen = picked[qi] === oi;
              const state = picked[qi] === null ? '' : oi === qq.answer ? 'correct' : chosen ? 'wrong' : '';
              return (
                <button
                  key={oi}
                  type="button"
                  className={`quiz-option ${state} ${chosen ? 'chosen' : ''}`}
                  disabled={picked[qi] !== null}
                  onClick={() => setPicked((p) => p.map((v, i) => (i === qi ? oi : v)))}
                >
                  {o}
                </button>
              );
            })}
          </div>
          {picked[qi] !== null && <div className="quiz-why">{qq.why}</div>}
        </div>
      ))}
      {done && (
        <div className="quiz-score">
          Score: {score} / {questions.length}{' '}
          <button type="button" className="link-button" onClick={() => setPicked(questions.map(() => null))}>
            Reset
          </button>
        </div>
      )}
    </section>
  );
}

export function LessonFooter({ id }: { id: string }) {
  const i = lessons.findIndex((l) => l.id === id);
  const prev = lessons[i - 1];
  const next = lessons[i + 1];
  return (
    <nav className="lesson-footer">
      {prev ? <Link to={prev.path}>← {prev.title}</Link> : <span />}
      {next ? <Link to={next.path}>{next.title} →</Link> : <Link to="/">Back to overview</Link>}
    </nav>
  );
}
