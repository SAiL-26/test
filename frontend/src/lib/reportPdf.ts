import { jsPDF } from 'jspdf'
import type { ScanDetail } from '../api/types'
import type { McmcTrace } from '../api/wave'

interface ReportInput {
  scan: ScanDetail
  trace?: McmcTrace
  caseLabel: string
}

// One-page clinical assessment PDF — A4 portrait. English/clinical terminology
// throughout (jsPDF ships Helvetica only, no CJK glyphs). Layout uses generous
// vertical breathing room and embedded visual elements (severity gauge,
// inversion table, posterior diagnostic bars) so the document reads like a
// real assessment artifact rather than a debug dump.
export function generateClinicalReport({ scan, trace, caseLabel }: ReportInput) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210, H = 297, M = 18
  let y = 14

  const det = scan.detection
  const reportId = `WAV-${scan.id.toString().padStart(5, '0')}-${new Date().getFullYear()}`

  // ═══════════════════ TITLE BAR ═══════════════════
  doc.setFillColor(11, 27, 45)
  doc.rect(0, 0, W, 22, 'F')
  doc.setTextColor(255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text('DENTAL WAVE — LESION SCREENING REPORT', M, 11)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5)
  doc.setTextColor(180, 210, 235)
  doc.text('30 kHz elastic-wave propagation · Bayesian inversion · simulation-only PoC', M, 16)
  doc.setFontSize(8); doc.setTextColor(255)
  doc.text(`Report ${reportId}`, W - M, 11, { align: 'right' })
  doc.text(`${new Date().toISOString().slice(0, 10)} UTC`, W - M, 16, { align: 'right' })
  doc.setTextColor(0)
  y = 30

  // ═══════════════════ EXECUTIVE SUMMARY ═══════════════════
  if (det) {
    sectionHead(doc, '01  ·  EXECUTIVE SUMMARY', M, y); y += 7
    const score = det.severity_score
    const cat = score < 0.2 ? { label: 'NEGATIVE',         color: [62, 175, 124] }
              : score < 0.5 ? { label: 'EQUIVOCAL',        color: [201, 167, 30] }
              : score < 0.8 ? { label: 'SUSPICIOUS',       color: [201, 118, 26] }
              :               { label: 'PROBABLE LESION',  color: [200, 50, 43] }
    // severity gauge bar
    const gx = M, gy = y, gw = W - 2 * M, gh = 9
    doc.setFillColor(238, 242, 246); doc.rect(gx, gy, gw, gh, 'F')
    doc.setFillColor(cat.color[0], cat.color[1], cat.color[2])
    doc.rect(gx, gy, gw * Math.min(1, Math.max(0, score)), gh, 'F')
    doc.setDrawColor(180); doc.rect(gx, gy, gw, gh)
    // gauge tick marks at 20/50/80 %
    doc.setDrawColor(150)
    for (const t of [0.2, 0.5, 0.8]) {
      doc.line(gx + gw * t, gy, gx + gw * t, gy + gh)
    }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(60)
    doc.text('0', gx, gy + gh + 4)
    doc.text('20', gx + gw * 0.2, gy + gh + 4, { align: 'center' })
    doc.text('50', gx + gw * 0.5, gy + gh + 4, { align: 'center' })
    doc.text('80', gx + gw * 0.8, gy + gh + 4, { align: 'center' })
    doc.text('100 %', gx + gw, gy + gh + 4, { align: 'right' })
    doc.setTextColor(0)
    // Headroom below tick labels before the big severity headline. 15pt text
    // is ~5.3 mm tall, so we need ≥ 8 mm after the gauge to keep its top
    // edge clear of the "0 / 20 / 50 …" tick row.
    y += gh + 14

    doc.setFont('helvetica', 'bold'); doc.setFontSize(15)
    doc.setTextColor(cat.color[0], cat.color[1], cat.color[2])
    doc.text(`${(score * 100).toFixed(0)} %  ·  ${cat.label}`, M, y)
    doc.setTextColor(0)
    y += 8
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(80)
    const summary = score < 0.2
      ? 'Wave-propagation signature is consistent with healthy periodontal tissue. No further imaging indicated; continue routine recall.'
      : score < 0.5
      ? 'Borderline signature. 3-month re-screening recommended with reinforced oral-hygiene instruction.'
      : score < 0.8
      ? 'Localized low-velocity perturbation suggests possible inflammatory tissue change. Periodontal probing + adjunct radiographic correlation indicated.'
      : 'Strong localized low-velocity anomaly with high posterior consistency. Referral to periodontist within 2 weeks with CBCT correlation and biochemical workup is advised.'
    const lines = doc.splitTextToSize(summary, W - 2 * M)
    doc.text(lines, M, y)
    y += lines.length * 5.5 + 6
    doc.setTextColor(0)
  }

  // ═══════════════════ EXAMINATION ═══════════════════
  sectionHead(doc, '02  ·  EXAMINATION', M, y); y += 7
  twoCol(doc, y, [
    ['Subject ID',     `pt-${scan.patient_id.toString().padStart(4, '0')}`],
    ['Scan ID',        `sc-${scan.id.toString().padStart(5, '0')}`],
    ['Acquired',       scan.scan_date],
    ['Scenario tag',   `${scan.scenario_tag} (wave case ${caseLabel})`],
    ['Source signal',  '30 kHz Ricker pulse'],
    ['Forward model',  'Elastic FD · MPML boundary'],
    ['Time samples',   '75,000 steps · dt = 4 ns'],
    ['Receiver array', '100 sensors · arch-conformal'],
    ['Inversion',      'MCMC · Metropolis-Hastings'],
    ['Model build',    det?.model_version ?? '—'],
  ])
  y += 27

  // ═══════════════════ DETECTION FINDINGS ═══════════════════
  if (det) {
    sectionHead(doc, '03  ·  DETECTION FINDINGS', M, y); y += 7
    twoCol(doc, y, [
      ['Severity index',     `${(det.severity_score * 100).toFixed(1)} %`],
      ['Candidate receiver', `#${det.candidate_recv_idx}`],
      ['Residual (RMS)',     det.candidate_residual.toExponential(3)],
      ['Estimated centroid', `(${det.estimate_x_mm.toFixed(2)}, ${det.estimate_y_mm.toFixed(2)}, ${det.estimate_z_mm.toFixed(2)}) mm`],
    ])
    y += 11
  }

  // ═══════════════════ BAYESIAN INVERSION ═══════════════════
  if (trace) {
    const tv = trace.true_values
    const counts: Record<string, number> = {}
    for (let i = 0; i < trace.x.length; i++) {
      const k = `${trace.x[i]},${trace.y[i]},${trace.z[i]}`
      counts[k] = (counts[k] || 0) + 1
    }
    let modeKey = ''; let modeC = 0
    for (const [k, c] of Object.entries(counts)) if (c > modeC) { modeC = c; modeKey = k }
    const [mx, my, mz] = modeKey.split(',').map(Number)
    let bestI = 0; let bestM = trace.misfit[0]
    for (let i = 1; i < trace.misfit.length; i++) if (trace.misfit[i] < bestM) { bestM = trace.misfit[i]; bestI = i }
    const bx = trace.x[bestI], by = trace.y[bestI], bz = trace.z[bestI]
    const dMode = Math.sqrt((mx - tv.x) ** 2 + (my - tv.y) ** 2 + (mz - tv.z) ** 2)
    const dMap  = Math.sqrt((bx - tv.x) ** 2 + (by - tv.y) ** 2 + (bz - tv.z) ** 2)
    let moves = 0
    for (let i = 1; i < trace.x.length; i++) {
      if (trace.x[i] !== trace.x[i - 1] || trace.y[i] !== trace.y[i - 1] || trace.z[i] !== trace.z[i - 1]) moves++
    }
    const accept = (moves / Math.max(1, trace.x.length - 1)) * 100
    const uniq = Object.keys(counts).length

    sectionHead(doc, '04  ·  BAYESIAN INVERSION', M, y); y += 7

    // Diagnostics row
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5)
    const diagY = y
    const diagCols = [M, M + 50, M + 100, M + 150]
    doc.setTextColor(120)
    doc.text('Iterations',       diagCols[0], diagY)
    doc.text('Acceptance',       diagCols[1], diagY)
    doc.text('Unique states',    diagCols[2], diagY)
    doc.text('Min misfit',       diagCols[3], diagY)
    doc.setTextColor(0); doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
    doc.text(trace.total.toLocaleString(),   diagCols[0], diagY + 5)
    doc.text(`${accept.toFixed(1)} %`,        diagCols[1], diagY + 5)
    doc.text(uniq.toString(),                 diagCols[2], diagY + 5)
    doc.text(bestM.toExponential(2),          diagCols[3], diagY + 5)
    y += 11
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5)

    // Estimator comparison table
    doc.setFont('helvetica', 'bold'); doc.setTextColor(120); doc.setFontSize(9)
    const colX = [M + 4, M + 50, M + 70, M + 90, M + 110, M + 145]
    doc.text('ESTIMATOR',        colX[0], y)
    doc.text('x',                 colX[1], y, { align: 'right' })
    doc.text('y',                 colX[2], y, { align: 'right' })
    doc.text('z',                 colX[3], y, { align: 'right' })
    doc.text('r',                 colX[4], y, { align: 'right' })
    doc.text('|Δ| vs GT (vox)',   colX[5], y, { align: 'right' })
    y += 1.5
    doc.setDrawColor(60, 120, 180); doc.setLineWidth(0.4); doc.line(M, y, W - M, y); doc.setLineWidth(0.2); y += 4

    doc.setFont('helvetica', 'normal'); doc.setTextColor(0); doc.setFontSize(9.5)
    row(doc, y, colX, ['Ground truth',           tv.x, tv.y, tv.z, tv.r, '—']); y += 5.5
    row(doc, y, colX, ['Posterior mode',         mx, my, mz, '—', dMode.toFixed(2)]); y += 5.5
    row(doc, y, colX, ['MAP (min misfit)',       bx, by, bz, trace.r[bestI] ?? '—', dMap.toFixed(2)]); y += 6

    // Convergence note
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(110)
    const convNote = `Acceptance ratio ${accept.toFixed(1)} % is ${accept >= 20 && accept <= 60 ? 'within the healthy 20-60 % MH range' : 'outside the 20-60 % optimal MH range and may indicate suboptimal proposal scaling'}. The chain explored ${uniq} distinct posterior states across ${trace.total} iterations (${(uniq / trace.total * 100).toFixed(1)} % effective coverage).`
    const convLines = doc.splitTextToSize(convNote, W - 2 * M)
    doc.text(convLines, M, y)
    y += convLines.length * 4 + 4
    doc.setTextColor(0)
  }

  // ═══════════════════ ASSESSMENT & PLAN ═══════════════════
  if (det) {
    sectionHead(doc, '05  ·  ASSESSMENT & PLAN', M, y); y += 7
    const score = det.severity_score
    let label = '', detail = ''
    if (score < 0.2) {
      label = 'Routine periodontal recall'
      detail = 'No imaging follow-up required at this time. Continue 6-month recall schedule. Patient education on standard oral hygiene maintenance.'
    } else if (score < 0.5) {
      label = 'Active surveillance'
      detail = 'Re-screen within 3 months. Reinforce oral-hygiene instruction (brushing technique, interdental cleaning). Document baseline for trend analysis at next recall.'
    } else if (score < 0.8) {
      label = 'Periodontal evaluation + adjunct imaging'
      detail = 'Full-mouth periodontal probing (6-point). Consider periapical or CBCT correlation of the localized anomaly. Monitor tissue change at 6-week interval.'
    } else {
      label = 'Refer to periodontist (priority)'
      detail = 'Localized low-velocity perturbation with high posterior consistency. CBCT correlation, full-mouth probing, and biochemical inflammatory markers indicated. Specialist evaluation advised within 2 weeks; document all imaging in the referral packet.'
    }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(11, 123, 196)
    doc.text(label, M, y); y += 6
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(50)
    const plan = doc.splitTextToSize(detail, W - 2 * M)
    doc.text(plan, M, y)
    y += plan.length * 5 + 3
    doc.setTextColor(0)
  }

  // ═══════════════════ FOOTER ═══════════════════
  const fy = H - 15
  doc.setDrawColor(220); doc.line(M, fy, W - M, fy)
  doc.setFontSize(7.5); doc.setTextColor(140)
  const disc = 'Generated from a simulation-only proof-of-concept dental-wave-propagation pipeline (elastic FD forward model + Bayesian MCMC inversion of a synthetic dataset). Findings should not be used as a sole basis for clinical decision-making.'
  doc.text(disc, M, fy + 4, { maxWidth: W - 2 * M })
  doc.text(`Report ${reportId}  ·  page 1 of 1`, W - M, fy + 10, { align: 'right' })
  doc.text('Dental Wave Viz', M, fy + 10)
  doc.setTextColor(0)

  doc.save(`${reportId}.pdf`)
}

// ─── helpers ──────────────────────────────────────────────────────

function sectionHead(doc: jsPDF, title: string, x: number, y: number) {
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
  doc.setTextColor(11, 123, 196)
  doc.text(title, x, y)
  doc.setTextColor(0)
  // accent underline
  doc.setDrawColor(11, 123, 196); doc.setLineWidth(0.4)
  doc.line(x, y + 1, 210 - 18, y + 1)
  doc.setLineWidth(0.2)
}

function twoCol(doc: jsPDF, y0: number, rows: Array<[string, string]>) {
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5)
  const half = Math.ceil(rows.length / 2)
  const ROW_H = 5
  const leftX = 22
  const rightX = 22 + 90
  const labelW = 38
  for (let i = 0; i < rows.length; i++) {
    const isRight = i >= half
    const rIdx = isRight ? i - half : i
    const y = y0 + rIdx * ROW_H
    const x = isRight ? rightX : leftX
    doc.setTextColor(110); doc.text(rows[i][0], x, y)
    doc.setTextColor(0);   doc.text(rows[i][1], x + labelW, y)
  }
}

function row(doc: jsPDF, y: number, cols: number[], values: Array<string | number>) {
  doc.setTextColor(0)
  doc.text(String(values[0]), cols[0], y)
  for (let i = 1; i < values.length; i++) {
    doc.text(String(values[i]), cols[i], y, { align: 'right' })
  }
}
