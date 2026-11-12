/**
 * One wrapper around Plotly so every chart in the app looks the same.
 * Pass Plotly `data` traces and an optional partial `layout`.
 * Docs for traces/layout: https://plotly.com/javascript/reference/
 */
import createPlotlyComponent from 'react-plotly.js/factory';
import Plotly from 'plotly.js-dist-min';
import type { Data, Layout } from 'plotly.js';

const Plot = createPlotlyComponent(Plotly);

/** The app's chart colours, in the order series should use them. */
export const palette = ['#1f6fb4', '#e08a1e', '#2a9d6f', '#c2453c', '#7a5bbf', '#5f6b7a'];

const axisDefaults = { gridcolor: '#e6e9ee', zerolinecolor: '#c3c9d2', linecolor: '#c3c9d2', automargin: true };

interface ChartProps {
  data: Data[];
  layout?: Partial<Layout>;
  height?: number;
  /** x-axis title */
  x?: string;
  /** y-axis title */
  y?: string;
}

export function Chart({ data, layout = {}, height = 340, x, y }: ChartProps) {
  const merged: Partial<Layout> = {
    height,
    margin: { l: 56, r: layout.yaxis2 ? 64 : 16, t: 40, b: 48 },
    font: { family: 'Inter, system-ui, sans-serif', size: 12, color: '#2b3442' },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    colorway: palette,
    // Legend above the plot so it never collides with the x-axis title.
    legend: { orientation: 'h', x: 0, y: 1.02, xanchor: 'left', yanchor: 'bottom' },
    hovermode: 'x unified',
    ...layout,
    xaxis: { ...axisDefaults, title: { text: x ?? '' }, ...(layout.xaxis ?? {}) },
    yaxis: { ...axisDefaults, title: { text: y ?? '' }, ...(layout.yaxis ?? {}) },
  };
  return (
    <div className="chart">
      <Plot
        data={data}
        layout={merged}
        config={{ displaylogo: false, responsive: true, modeBarButtonsToRemove: ['lasso2d', 'select2d'] }}
        useResizeHandler
        style={{ width: '100%' }}
      />
    </div>
  );
}

/** A grid of numbers x → y as a Plotly line trace. */
export function line(xs: number[], ys: number[], name: string, extra: Record<string, unknown> = {}): Data {
  return { x: xs, y: ys, name, type: 'scatter', mode: 'lines', ...extra } as Data;
}

/** n evenly spaced numbers from a to b. */
export function linspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
}
