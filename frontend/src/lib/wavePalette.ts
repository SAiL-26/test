// Clinical color tokens shared with Tailwind theme (see styles.css).
// Used by Plotly panes so charts stay coherent with chrome.
export const WAVE_COLORS = {
  bg: '#0B0F14',
  surface: '#121821',
  border: '#28323F',
  text: '#E6EDF5',
  muted: '#8A9BB0',
  accent: '#58C2F0',
  good: '#3CD49A',
  warn: '#F2B441',
  bad: '#FF5D5D',
  findingHi: '#FF3E8A',
  findingLo: '#FFB3D1',
  crosshair: '#FFD23F',
  roi: '#A78BFA',
} as const

// Seismic blue-white-red used in the reference visualization. Centered at 0.5.
export const SEISMIC_COLORSCALE: Array<[number, string]> = [
  [0.0,  '#0a1a4d'],
  [0.2,  '#1d5cff'],
  [0.4,  '#7faaff'],
  [0.5,  '#ffffff'],
  [0.6,  '#ff8a8a'],
  [0.8,  '#ff2b2b'],
  [1.0,  '#4d0000'],
]

// Tissue class 0..4 discrete steps matching CrossSection + VelocitySlice.
export const TISSUE_CLASS_COLORSCALE: Array<[number, string]> = [
  [0.00, '#1A2230'],  // background — dark imaging surface
  [0.20, '#1A2230'],
  [0.22, '#FFB3D1'],  // gingiva
  [0.42, '#FFB3D1'],
  [0.44, '#F2B441'],  // bone (warm)
  [0.62, '#F2B441'],
  [0.64, '#F5EFE2'],  // tooth (enamel)
  [0.82, '#F5EFE2'],
  [0.84, '#FF3E8A'],  // inflammation
  [1.00, '#FF3E8A'],
]

export const TISSUE_LABELS = ['bg', 'gingiva', 'bone', 'tooth', 'inflam.']

// Light viridis-ish for MCMC distribution density (matches reference PyVista code).
export const MCMC_DENSITY_COLORSCALE: Array<[number, string]> = [
  [0,    '#b07fd4'],
  [0.33, '#3b9ebe'],
  [0.67, '#35b779'],
  [1,    '#fde725'],
]

// Hot energy / candidate region — viridis-warm.
export const ENERGY_COLORSCALE: Array<[number, string]> = [
  [0,    '#0B0F14'],
  [0.25, '#4C1D95'],
  [0.5,  '#DC2626'],
  [0.75, '#F2B441'],
  [1,    '#FEF3C7'],
]

export function basePlotlyLayout(): any {
  return {
    autosize: true,
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: WAVE_COLORS.surface,
    font: { color: WAVE_COLORS.text, family: 'Inter, ui-sans-serif, system-ui, sans-serif', size: 11 },
    margin: { l: 56, r: 16, t: 10, b: 44 },
    xaxis: { color: WAVE_COLORS.muted, gridcolor: WAVE_COLORS.border, zerolinecolor: WAVE_COLORS.border },
    yaxis: { color: WAVE_COLORS.muted, gridcolor: WAVE_COLORS.border, zerolinecolor: WAVE_COLORS.border },
    showlegend: false,
  }
}
