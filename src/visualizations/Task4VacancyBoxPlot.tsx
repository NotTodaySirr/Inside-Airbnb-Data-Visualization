import * as d3 from 'd3'
import { useState } from 'react'
import { ChartWorkspace, ToolboxSection } from '../components/ChartLayout'
import { useCsvData } from '../data/useCsvData'
import type { Task4MinNightsVacancyBoxRow, Task4SupportCandidateRow } from '../types/charts'
import { EmptyState, HoverCard, Legend } from './chartHelpers'
import type { HoverCardProps } from './chartHelpers'
import { chartMargins, formatNumber, formatPercent, priceSettingColor, wideChart } from './chartScales'

type HoverCardState = HoverCardProps

const PRICE_GROUPS = ['Normal/lower fixed price', 'High fixed price'] as const
const BINS = ['1-2 nights', '3-6 nights', '7-29 nights', '30+ nights'] as const

export function Task4VacancyBoxPlot() {
  const boxState  = useCsvData<Task4MinNightsVacancyBoxRow>('/data/derived/task4_min_nights_vacancy_box.csv')
  const candState = useCsvData<Task4SupportCandidateRow>('/data/derived/task4_support_candidates.csv')
  const [showCandidates, setShowCandidates] = useState(true)
  const [hoverCard, setHoverCard] = useState<HoverCardState | null>(null)

  if (boxState.status === 'loading' || candState.status === 'loading')
    return <div className="loading-state">Loading box plot…</div>
  if (boxState.status === 'error')
    return <EmptyState title="Could not load Task 4" message={boxState.error} />

  const boxes = boxState.data
  const candidates: Task4SupportCandidateRow[] =
    candState.status === 'loaded' ? candState.data.slice(0, 10) : []

  if (!boxes.length)
    return <EmptyState title="No box plot data" message="Run regen_task4_only.py to generate the data." />

  // ── scales ────────────────────────────────────────────────────────────────
  const { width, height } = wideChart
  const x0 = d3.scaleBand(BINS, [chartMargins.left, width - chartMargins.right]).padding(0.24)
  const x1 = d3.scaleBand(PRICE_GROUPS, [0, x0.bandwidth()]).padding(0.18)
  const y  = d3.scaleLinear([0, 1], [height - chartMargins.bottom, chartMargins.top])

  // ── helpers ───────────────────────────────────────────────────────────────
  function boxCx(bin: string, pg: string) {
    return (x0(bin as typeof BINS[number]) ?? 0) + (x1(pg as typeof PRICE_GROUPS[number]) ?? 0) + x1.bandwidth() / 2
  }

  function fmtLift(lift: number) {
    if (!isFinite(lift)) return 'N/A'
    const sign = lift >= 0 ? '+' : ''
    return `${sign}${lift.toFixed(1)} pp`
  }

  // Map candidate listing_id → which bin it belongs to (30+ nights only)
  // Jitter x slightly by listing_id hash so dots don't stack
  function candCx(c: Task4SupportCandidateRow) {
    const bin = '30+ nights'
    const pg  = 'High fixed price'
    const base = boxCx(bin, pg)
    const jitter = (Number(c.listing_id.toString().slice(-3)) % 30) - 15
    return base + jitter
  }

  const activeSummary = `Single-property hosts · candidates ${showCandidates ? 'on' : 'off'}`

  const toolbox = (
    <>
      <ToolboxSection title="Display">
        <label className="toolbox-check">
          <input
            type="checkbox"
            checked={showCandidates}
            onChange={e => setShowCandidates(e.target.checked)}
          />
          <span>Show support candidates</span>
        </label>
      </ToolboxSection>
    </>
  )

  return (
    <ChartWorkspace
      toolbox={toolbox}
      activeSummary={activeSummary}
      caption={
        `Scoped to single-property hosts only. "High fixed price" = listing price ≥ 125% of same-room-type peer median. ` +
        `Highlighted dots are 30+ night listings with high fixed price and ≥ 80% vacancy. ` +
        `Vacancy lift is relative to the 1-2 night / Normal-price baseline.`
      }
    >
      <div className="task-chart-shell">
        <Legend items={[...PRICE_GROUPS]} color={priceSettingColor} />

        <div className="task-plot-wrap" style={{ position: 'relative' }}>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label="Vacancy box plot by minimum-night policy and price setting group"
          >
            {/* ── y-axis grid ── */}
            {y.ticks(5).map(t => (
              <g key={t}>
                <line
                  className="grid-line"
                  x1={chartMargins.left} x2={width - chartMargins.right}
                  y1={y(t)} y2={y(t)}
                />
                <text
                  className="axis-label"
                  x={chartMargins.left - 10} y={y(t) + 4}
                  textAnchor="end"
                >
                  {formatPercent(t)}
                </text>
              </g>
            ))}

            {/* ── boxes ── */}
            {boxes.map(b => {
              const cx = boxCx(b.minimum_nights_group, b.price_setting_group)
              const color = priceSettingColor(b.price_setting_group)
              const hover = {
                title: `${b.minimum_nights_group} · ${b.price_setting_group}`,
                rows: [
                  { label: 'Median vacancy',  value: formatPercent(b.median) },
                  { label: 'Q1 / Q3',         value: `${formatPercent(b.q1)} / ${formatPercent(b.q3)}` },
                  { label: 'Whiskers',         value: `${formatPercent(b.whisker_low)} – ${formatPercent(b.whisker_high)}` },
                  { label: 'Sample size',      value: formatNumber(b.sample_size) },
                  { label: 'Vacancy lift vs baseline', value: fmtLift(b.vacancy_lift_pp) },
                ],
              }

              return (
                <g
                  key={`${b.minimum_nights_group}-${b.price_setting_group}`}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={e => {
                    setHoverCard({ x: e.clientX + 16, y: e.clientY - 18, ...hover })
                  }}
                  onMouseMove={e => {
                    setHoverCard(cur => cur ? { ...cur, x: e.clientX + 16, y: e.clientY - 18, ...hover } : null)
                  }}
                  onMouseLeave={() => setHoverCard(null)}
                >
                  {/* whisker stem */}
                  <line
                    x1={cx} x2={cx}
                    y1={y(b.whisker_low)} y2={y(b.whisker_high)}
                    stroke={color} strokeWidth={2}
                  />
                  {/* whisker caps */}
                  <line x1={cx - 6} x2={cx + 6} y1={y(b.whisker_low)}  y2={y(b.whisker_low)}  stroke={color} strokeWidth={2} />
                  <line x1={cx - 6} x2={cx + 6} y1={y(b.whisker_high)} y2={y(b.whisker_high)} stroke={color} strokeWidth={2} />
                  {/* IQR box */}
                  <rect
                    x={cx - x1.bandwidth() / 2}
                    y={y(b.q3)}
                    width={x1.bandwidth()}
                    height={Math.max(1, y(b.q1) - y(b.q3))}
                    fill={color}
                    opacity={0.7}
                    rx={6}
                  />
                  {/* median line */}
                  <line
                    x1={cx - x1.bandwidth() / 2} x2={cx + x1.bandwidth() / 2}
                    y1={y(b.median)} y2={y(b.median)}
                    stroke="white" strokeWidth={3}
                  />
                </g>
              )
            })}

            {/* ── support candidate dots ── */}
            {showCandidates && candidates.map(c => {
              const hover = {
                title: c.name || `Listing ${c.listing_id}`,
                rows: [
                  { label: 'Vacancy rate',     value: formatPercent(c.vacancy_rate) },
                  { label: 'Minimum nights',   value: String(c.minimum_nights) },
                  { label: 'Price',            value: `$${c.price.toFixed(0)}` },
                  { label: 'Peer median price',value: `$${c.peer_median_price.toFixed(0)}` },
                  { label: 'Price gap',        value: `+${(c.price_gap_pct * 100).toFixed(0)}%` },
                  { label: 'Neighbourhood',    value: c.neighbourhood_cleansed },
                  { label: 'Reason',           value: c.support_reason },
                ],
              }

              return (
                <circle
                  key={c.listing_id}
                  cx={candCx(c)}
                  cy={y(c.vacancy_rate)}
                  r={5}
                  fill="#fbbf24"
                  stroke="#1e293b"
                  strokeWidth={1.5}
                  opacity={0.9}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={e => {
                    setHoverCard({ x: e.clientX + 16, y: e.clientY - 18, ...hover })
                  }}
                  onMouseMove={e => {
                    setHoverCard(cur => cur ? { ...cur, x: e.clientX + 16, y: e.clientY - 18, ...hover } : null)
                  }}
                  onMouseLeave={() => setHoverCard(null)}
                />
              )
            })}

            {/* ── x-axis labels ── */}
            {BINS.map(b => (
              <text
                key={b}
                className="axis-label"
                x={(x0(b) ?? 0) + x0.bandwidth() / 2}
                y={height - 42}
                textAnchor="middle"
              >
                {b}
              </text>
            ))}
          </svg>

          {hoverCard && <HoverCard {...hoverCard} />}
        </div>
      </div>
    </ChartWorkspace>
  )
}
