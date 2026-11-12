import { lazy, Suspense, useEffect, useState } from 'react';
import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { lessons } from './lessons';
import { Home } from './pages/Home';

// Each lesson loads on demand, so the first page opens fast.
const pages: Record<string, React.LazyExoticComponent<() => JSX.Element>> = {
  foundations: lazy(() => import('./pages/Foundations')),
  curves: lazy(() => import('./pages/Curves')),
  caps: lazy(() => import('./pages/CapsFloors')),
  swaptions: lazy(() => import('./pages/Swaptions')),
  smile: lazy(() => import('./pages/Smile')),
  'short-rate': lazy(() => import('./pages/ShortRate')),
  lmm: lazy(() => import('./pages/Lmm')),
};

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  return null;
}

export function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    // HashRouter (#/curves) works on GitHub Pages without any server config.
    <HashRouter>
      <ScrollToTop />
      <div className="app">
        <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
          <div className="brand">
            <NavLink to="/" onClick={() => setMenuOpen(false)}>
              <span className="brand-mark" aria-hidden>
                ∂
              </span>
              Rates Options Lab
            </NavLink>
            <button className="menu-button" type="button" onClick={() => setMenuOpen((o) => !o)} aria-label="Toggle menu">
              ☰
            </button>
          </div>
          <nav className="nav">
            <NavLink to="/" end onClick={() => setMenuOpen(false)}>
              Overview
            </NavLink>
            {lessons.map((l) => (
              <NavLink key={l.id} to={l.path} onClick={() => setMenuOpen(false)}>
                <span className="nav-num">{l.number}</span>
                {l.title}
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-foot">Sample data is illustrative, not live market quotes.</div>
        </aside>
        <main className="content">
          <Suspense fallback={<div className="loading">Loading lesson…</div>}>
            <Routes>
              <Route path="/" element={<Home />} />
              {lessons.map((l) => {
                const Page = pages[l.id];
                return <Route key={l.id} path={l.path} element={<Page />} />;
              })}
            </Routes>
          </Suspense>
        </main>
      </div>
    </HashRouter>
  );
}
