// Type declarations for packages that ship without TypeScript types.

declare module 'plotly.js-dist-min' {
  import Plotly from 'plotly.js';
  export default Plotly;
}

declare module 'react-plotly.js/factory' {
  import type { ComponentType, CSSProperties } from 'react';
  import type { Config, Data, Layout } from 'plotly.js';

  export interface PlotProps {
    data: Data[];
    layout?: Partial<Layout>;
    config?: Partial<Config>;
    style?: CSSProperties;
    className?: string;
    useResizeHandler?: boolean;
  }

  export default function createPlotlyComponent(plotly: unknown): ComponentType<PlotProps>;
}
