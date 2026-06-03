declare module 'plotly.js-dist-min' {
  import type { Data, Layout, Config } from 'plotly.js'
  interface PlotlyStatic {
    react(
      root: HTMLElement,
      data: Data[],
      layout?: Partial<Layout>,
      config?: Partial<Config>,
    ): Promise<HTMLElement>
    purge(root: HTMLElement): void
    Plots: { resize(root: HTMLElement): void }
  }
  const Plotly: PlotlyStatic
  export default Plotly
}
