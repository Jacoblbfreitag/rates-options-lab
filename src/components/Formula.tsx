/**
 * Maths typesetting with KaTeX (LaTeX syntax).
 *   <Tex>{String.raw`\sigma\sqrt{T}`}</Tex>      inline
 *   <TexBlock>{String.raw`C = ...`}</TexBlock>   displayed on its own line
 * String.raw stops JavaScript from eating the backslashes.
 */
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { useMemo } from 'react';

function render(tex: string, displayMode: boolean) {
  return katex.renderToString(tex, { displayMode, throwOnError: false });
}

export function Tex({ children }: { children: string }) {
  const html = useMemo(() => render(children, false), [children]);
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

export function TexBlock({ children }: { children: string }) {
  const html = useMemo(() => render(children, true), [children]);
  return <div className="formula" dangerouslySetInnerHTML={{ __html: html }} />;
}
