import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Tex } from '../components/Formula';
import { glossary, type GlossaryEntry } from '../data/glossary';
import { lessons } from '../lessons';

const sorted = glossary.slice().sort((a, b) => a.term.localeCompare(b.term));
const anchorId = (term: string) => 'term-' + term.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const firstLetter = (term: string) => term[0].toUpperCase();

function matches(e: GlossaryEntry, q: string) {
  const text = [e.term, ...(e.aka ?? []), e.definition].join(' ').toLowerCase();
  return q.split(/\s+/).every((word) => text.includes(word));
}

export default function Glossary() {
  // A <Term> link in a lesson opens the glossary pre-searched for that term.
  const location = useLocation();
  const [query, setQuery] = useState<string>((location.state as { q?: string } | null)?.q ?? '');
  const [module, setModule] = useState('all');
  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () => sorted.filter((e) => (module === 'all' || e.module === module) && (!q || matches(e, q))),
    [q, module],
  );
  const letters = [...new Set(shown.map((e) => firstLetter(e.term)))];

  // Jump to a related term: clear filters so it is visible, then scroll to it.
  const goTo = (term: string) => {
    setQuery('');
    setModule('all');
    requestAnimationFrame(() => {
      const el = document.getElementById(anchorId(term));
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.classList.add('flash');
      setTimeout(() => el?.classList.remove('flash'), 1500);
    });
  };

  return (
    <article>
      <header className="lesson-header">
        <div className="lesson-kicker">Reference</div>
        <h1>Glossary</h1>
        <p className="lesson-summary">
          {glossary.length} terms from the course. Search by name, abbreviation or anything in the definition.
        </p>
      </header>

      <div className="glossary-tools">
        <input
          className="search"
          type="search"
          placeholder="Search terms, e.g. annuity, vega, Bermudan…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <select value={module} onChange={(e) => setModule(e.target.value)} aria-label="Filter by module">
          <option value="all">All modules</option>
          {lessons.map((l) => (
            <option key={l.id} value={l.id}>
              {l.number}. {l.title}
            </option>
          ))}
        </select>
      </div>

      {letters.length > 1 && (
        <nav className="letters">
          {letters.map((l) => (
            <button key={l} type="button" onClick={() => document.getElementById(`letter-${l}`)?.scrollIntoView({ behavior: 'smooth' })}>
              {l}
            </button>
          ))}
        </nav>
      )}

      {shown.length === 0 && <p className="muted">No terms match “{query}”.</p>}

      {letters.map((letter) => (
        <section key={letter} id={`letter-${letter}`} className="glossary-group">
          <h2>{letter}</h2>
          {shown
            .filter((e) => firstLetter(e.term) === letter)
            .map((e) => {
              const lesson = lessons.find((l) => l.id === e.module);
              return (
                <div key={e.term} id={anchorId(e.term)} className="term">
                  <div className="term-head">
                    <h3>{e.term}</h3>
                    {e.aka && <span className="aka">also: {e.aka.join(', ')}</span>}
                  </div>
                  <p>{e.definition}</p>
                  {e.formula && (
                    <div className="term-formula">
                      <Tex>{e.formula}</Tex>
                    </div>
                  )}
                  <div className="term-foot">
                    {lesson && (
                      <Link to={lesson.path} className="module-chip">
                        Module {lesson.number}: {lesson.title}
                      </Link>
                    )}
                    {e.related?.map((r) => (
                      <button key={r} type="button" className="related" onClick={() => goTo(r)}>
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
        </section>
      ))}
    </article>
  );
}
