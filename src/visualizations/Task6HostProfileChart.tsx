import * as d3 from 'd3'
import { useState } from 'react'
import { ChartWorkspace } from '../components/ChartLayout'
import { useCsvData } from '../data/useCsvData'
import type { Task6HostProfileRow } from '../types/charts'
import { EmptyState, HoverCard, Legend } from './chartHelpers'
import type { HoverCardProps } from './chartHelpers'
import { formatDecimal, formatNumber } from './chartScales'

// ─── Layout constants ────────────────────────────────────────────────────────
const W = 900
const LABEL_W = 160   // left margin for metric labels
const AXIS_W = 60     // right margin for target value labels
const PLOT_W = W - LABEL_W - AXIS_W
const ROW_H = 46
const SECTION_GAP = 18
const TOP_PAD = 36
const BOTTOM_PAD = 40

// ─── Colour / shape tokens ───────────────────────────────────────────────────
const COLOR_SH = '#a78bfa'   // Superhost – violet
const COLOR_RH = '#38bdf8'   // Regular host – sky
const COLOR_TARGET = '#fbbf24' // target diamond – amber
const COLOR_TARGET_OPTIONAL = '#94a3b8' // instant bookable target – muted

const DOT_R = 7
const DIAMOND_HALF = 7

// ─── Metric ordering (fixed, grouped by section) ─────────────────────────────
const METRIC_ORDER = [
  'rating', 'trust', 'low_risk', 'demand', 'occupancy',  // Quality & Outcomes
  'acceptance', 'response',                               // Operations
  'identity', 'instant',                                  // Technical settings
]

const SECTION_LABELS: Record<string, string> = {
  'Quality & Outcomes': 'Quality & Outcomes',
  'Operations': 'Operations',
  'Technical settings': 'Technical settings',
}

// Raw value formatter per unit
function fmtRaw(value: number, unit: string, metricId: string): string {
  if (unit === 'rating') return `${formatDecimal(value)} / 5`
  if (unit === 'score')  return `${formatDecimal(value)} / 3`
  if (unit === 'count')  return formatNumber(Math.round(value))
  if (metricId === 'identity' || metricId === 'instant') {
    return `${Math.round(value * 100)}%`
  }
  return `${(value * 100).toFixed(1)}%`
}

function fmtTarget(targetValue: number, unit: string, metricId: string, targetLabel: string): string {
  let val: string
  if (unit === 'rating') val = `≥ ${formatDecimal(targetValue)}`
  else if (unit === 'score') val = `≥ ${formatDecimal(targetValue)}`
  else if (unit === 'count') val = `≥ ${formatNumber(Math.round(targetValue))}`
  else if (metricId === 'identity') val = '= verified'
  else val = `≥ ${(targetValue * 100).toFixed(0)}%`
  return `${val} (${targetLabel})`
}

type HoverState = HoverCardProps

export function Task6HostProfileChart() {
  const state = useCsvData<Task6HostProfileRow>('/data/derived/task6_host_profile.csv')
  const [hover, setHover] = useState<HoverState | null>(null)

  if (state.status === 'loading') return <div className="loading-state">Loading host profile…</div>
  if (state.status === 'error')   return <EmptyState title="Could not load Task 6" message={state.error} />

  const data = state.data
  if (!data.length) return <EmptyState title="No profile data" message="task6_host_profile.csv is empty." />

  // ── Build lookup: metricId → { Superhost: row, 'Regular host': row } ──────
  const byMetric = new Map<string, Map<string, Task6HostProfileRow>>()
  for (const row of data) {
    if (!byMetric.has(row.metric_id)) byMetric.set(row.metric_id, new Map())
    byMetric.get(row.metric_id)!.set(row.host_profile_group, row)
  }

  // ── Ordered metric rows (only those present in data) ─────────────────────
  const orderedMetrics = METRIC_ORDER.filter(id => byMetric.has(id))

  // ── Section boundaries ────────────────────────────────────────────────────
  // Collect section for each metric from data
  const metricSection = new Map<string, string>()
  for (const row of data) metricSection.set(row.metric_id, row.metric_group)

  // Compute y positions with section gaps
  const yPositions: number[] = []
  let cursor = TOP_PAD
  let lastSection = ''
  for (const id of orderedMetrics) {
    const section = metricSection.get(id) ?? ''
    if (lastSection && section !== lastSection) cursor += SECTION_GAP
    yPositions.push(cursor + ROW_H / 2)
    cursor += ROW_H
    lastSection = section
  }
  const totalH = cursor + BOTTOM_PAD

  // ── X scale ───────────────────────────────────────────────────────────────
  const xScale = d3.scaleLinear([0, 100], [0, PLOT_W])

  // ── Section header y positions ────────────────────────────────────────────
  const sectionHeaderY: { label: string; y: number }[] = []
  {
    let cur = TOP_PAD
    let lastSec = ''
    for (let i = 0; i < orderedMetrics.length; i++) {
      const id = orderedMetrics[i]
      const sec = metricSection.get(id) ?? ''
      if (sec !== lastSec) {
        if (lastSec) cur += SECTION_GAP
        sectionHeaderY.push({ label: sec, y: cur })
        lastSec = sec
      }
      cur += ROW_H
    }
  }

  // ── Axis ticks ────────────────────────────────────────────────────────────
  const ticks = [0, 25, 50, 75, 100]

  return (
    <ChartWorkspace
      toolbox={null}
      activeSummary="9 metrics · 2 host groups · Superhost benchmark targets"
      caption={
        'Each row shows the mean normalized score (0–100) for Superhost and Regular host. ' +
        'The amber ◆ marks the minimum target for new hosts derived from the Superhost benchmark. ' +
        'Instant bookable target is diagnostic only — a low Superhost median does not make it mandatory.'
      }
    >
      <div className="task-chart-shell">
        <Legend
          items={['Superhost', 'Regular host', 'New host target']}
          color={(label: string) => {
            if (label === 'Superhost') return COLOR_SH
            if (label === 'Regular host') return COLOR_RH
            return COLOR_TARGET
          }}
        />

        <div className="task-plot-wrap" style={{ overflowX: 'auto' }}>
          <svg
            viewBox={`0 0 ${W} ${totalH}`}
            role="img"
            aria-label="Host benchmark profile chart"
            style={{ width: '100%', minWidth: 600 }}
          >
            {/* ── Grid lines + x-axis ticks ── */}
            {ticks.map(t => (
              <g key={t}>
                <line
                  className="grid-line"
                  x1={LABEL_W + xScale(t)}
                  x2={LABEL_W + xScale(t)}
                  y1={TOP_PAD - 12}
                  y2={totalH - BOTTOM_PAD + 8}
                  strokeDasharray={t === 0 ? 'none' : '3 3'}
                />
                <text
                  className="axis-label"
                  x={LABEL_W + xScale(t)}
                  y={TOP_PAD - 16}
                  textAnchor="middle"
                  fontSize={10}
                >
                  {t}
                </text>
              </g>
            ))}

            {/* ── Section headers ── */}
            {sectionHeaderY.map(({ label, y }) => (
              <g key={label}>
                <text
                  x={LABEL_W - 8}
                  y={y + 11}
                  textAnchor="end"
                  fontSize={9}
                  fontWeight={700}
                  letterSpacing={0.8}
                  fill="var(--color-text-muted, #94a3b8)"
                  style={{ textTransform: 'uppercase' }}
                >
                  {SECTION_LABELS[label] ?? label}
                </text>
                <line
                  x1={LABEL_W}
                  x2={LABEL_W + PLOT_W}
                  y1={y + 14}
                  y2={y + 14}
                  stroke="var(--color-border, #334155)"
                  strokeWidth={1}
                  opacity={0.5}
                />
              </g>
            ))}

            {/* ── Per-metric rows ── */}
            {orderedMetrics.map((metricId, i) => {
              const rowMap = byMetric.get(metricId)!
              const shRow  = rowMap.get('Superhost')
              const rhRow  = rowMap.get('Regular host')
              const anyRow = shRow ?? rhRow!
              const y = yPositions[i]

              const shX  = shRow  ? LABEL_W + xScale(+shRow.normalized_score)  : null
              const rhX  = rhRow  ? LABEL_W + xScale(+rhRow.normalized_score)  : null
              const tgtX = anyRow ? LABEL_W + xScale(+anyRow.target_score)     : null
              const isOptional = metricId === 'instant'

              const makeHover = (row: Task6HostProfileRow) => {
                return (e: React.MouseEvent) => {
                  setHover({
                    x: e.clientX + 16,
                    y: e.clientY - 18,
                    title: `${row.metric_label} — ${row.host_profile_group}`,
                    rows: [
                      { label: 'Group',       value: row.host_profile_group },
                      { label: 'Score',       value: `${(+row.normalized_score).toFixed(1)} / 100` },
                      { label: 'Raw value',   value: fmtRaw(+row.raw_value, row.raw_unit, row.metric_id) },
                      { label: 'Sample',      value: `${formatNumber(row.sample_size)} hosts` },
                      { label: 'Total hosts', value: formatNumber(row.total_hosts) },
                      { label: 'Completeness',value: `${(+row.completeness_rate * 100).toFixed(1)}%` },
                      { label: 'Target',      value: fmtTarget(+row.target_value, row.raw_unit, row.metric_id, row.target_label) },
                    ],
                  })
                }
              }

              return (
                <g key={metricId}>
                  {/* Metric label */}
                  <text
                    x={LABEL_W - 12}
                    y={y + 4}
                    textAnchor="end"
                    fontSize={11}
                    fill="var(--color-text, #e2e8f0)"
                  >
                    {anyRow.metric_label}
                  </text>

                  {/* Row background stripe (alternating) */}
                  <rect
                    x={LABEL_W}
                    y={y - ROW_H / 2 + 2}
                    width={PLOT_W}
                    height={ROW_H - 4}
                    fill={i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent'}
                    rx={3}
                  />

                  {/* Connector line between RH and SH dots */}
                  {shX !== null && rhX !== null && (
                    <line
                      x1={Math.min(shX, rhX)}
                      x2={Math.max(shX, rhX)}
                      y1={y}
                      y2={y}
                      stroke="var(--color-border, #475569)"
                      strokeWidth={1.5}
                      strokeDasharray="4 2"
                    />
                  )}

                  {/* Regular host dot */}
                  {rhRow && rhX !== null && (
                    <circle
                      cx={rhX}
                      cy={y}
                      r={DOT_R}
                      fill={COLOR_RH}
                      stroke="var(--color-bg, #0f172a)"
                      strokeWidth={1.5}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={e => makeHover(rhRow)(e)}
                      onMouseMove={e  => makeHover(rhRow)(e)}
                      onMouseLeave={() => setHover(null)}
                    />
                  )}

                  {/* Superhost dot */}
                  {shRow && shX !== null && (
                    <circle
                      cx={shX}
                      cy={y}
                      r={DOT_R}
                      fill={COLOR_SH}
                      stroke="var(--color-bg, #0f172a)"
                      strokeWidth={1.5}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={e => makeHover(shRow)(e)}
                      onMouseMove={e  => makeHover(shRow)(e)}
                      onMouseLeave={() => setHover(null)}
                    />
                  )}

                  {/* Target diamond — skip for instant bookable (target=0, diagnostic only) */}
                  {tgtX !== null && !isOptional && (
                    <g
                      transform={`translate(${tgtX},${y})`}
                      style={{ cursor: 'default' }}
                    >
                      <rect
                        x={-DIAMOND_HALF}
                        y={-DIAMOND_HALF}
                        width={DIAMOND_HALF * 2}
                        height={DIAMOND_HALF * 2}
                        transform="rotate(45)"
                        fill={COLOR_TARGET}
                        stroke="var(--color-bg, #0f172a)"
                        strokeWidth={1.5}
                      />
                    </g>
                  )}

                  {/* Target value label */}
                  {anyRow && (
                    <text
                      x={LABEL_W + PLOT_W + 8}
                      y={y + 4}
                      fontSize={9}
                      fill={isOptional ? COLOR_TARGET_OPTIONAL : COLOR_TARGET}
                      opacity={isOptional ? 0.7 : 1}
                    >
                      {isOptional ? 'optional' : (() => {
                        const rv = +anyRow.target_value
                        const unit = anyRow.raw_unit
                        const mid = anyRow.metric_id
                        if (unit === 'rating') return `≥ ${formatDecimal(rv)}`
                        if (unit === 'score')  return `≥ ${formatDecimal(rv)}`
                        if (unit === 'count')  return `≥ ${formatNumber(Math.round(rv))}`
                        if (mid === 'identity') return '= verified'
                        return `≥ ${(rv * 100).toFixed(0)}%`
                      })()}
                    </text>
                  )}
                </g>
              )
            })}

            {/* ── X-axis baseline ── */}
            <line
              x1={LABEL_W}
              x2={LABEL_W + PLOT_W}
              y1={totalH - BOTTOM_PAD + 8}
              y2={totalH - BOTTOM_PAD + 8}
              stroke="var(--color-border, #334155)"
              strokeWidth={1}
            />
            <text
              x={LABEL_W + PLOT_W / 2}
              y={totalH - BOTTOM_PAD + 24}
              textAnchor="middle"
              fontSize={10}
              fill="var(--color-text-muted, #94a3b8)"
            >
              Normalized score (0 – 100)
            </text>
          </svg>

          {hover && <HoverCard {...hover} />}
        </div>
      </div>
    </ChartWorkspace>
  )
}
