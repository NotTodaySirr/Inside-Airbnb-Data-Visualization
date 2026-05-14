import * as d3 from 'd3'
import { useMemo, useState } from 'react'
import { useCsvData } from '../data/useCsvData'
import type { Task1PriceRatingCorrBarRow, Task1PriceRatingCorrRow } from '../types/charts'
import { EmptyState } from './chartHelpers'
import { chartMargins, formatDecimal, formatNumber, wideChart } from './chartScales'

const url = '/data/derived/task1_price_rating_corr.csv'
const topOptions = [10, 20, 30, 40]
const sortModes = [
  { value: 'strongest', label: 'Strongest relationship' },
  { value: 'positive', label: 'Premium opportunity' },
  { value: 'negative', label: 'Pricing risk' },
] as const

type SortMode = (typeof sortModes)[number]['value']

function strengthClass(value: number): 'weak' | 'moderate' | 'strong' {
  const abs = Math.abs(value)
  if (abs >= 0.6) return 'strong'
  if (abs >= 0.3) return 'moderate'
  return 'weak'
}

function barColor(value: number): string {
  const abs = Math.abs(value)
  const strong = abs >= 0.6
  if (value >= 0) return strong ? '#fb7185' : '#fda4af'
  return strong ? '#60a5fa' : '#93c5fd'
}

function barOpacity(value: number): number {
  const abs = Math.abs(value)
  if (abs >= 0.6) return 0.95
  if (abs >= 0.3) return 0.8
  return 0.58
}

export function Task1CorrelationBars() {
  const state = useCsvData<Task1PriceRatingCorrRow>(url)
  const [minSample, setMinSample] = useState(10)
  const [topCount, setTopCount] = useState(20)
  const [sortMode, setSortMode] = useState<SortMode>('strongest')
  const [tip, setTip] = useState('')

  const filtered = useMemo<Task1PriceRatingCorrBarRow[]>(() => {
    if (state.status !== 'loaded') return []

    const mapped = state.data
      .filter((d) => d.sample_size >= minSample)
      .map((d) => ({ ...d, group_label: `${d.neighbourhood_cleansed} · ${d.room_type}` }))

    const sorted = mapped.sort((a, b) => {
      if (sortMode === 'positive') return d3.descending(a.pearson_r, b.pearson_r)
      if (sortMode === 'negative') return d3.ascending(a.pearson_r, b.pearson_r)
      return d3.descending(Math.abs(a.pearson_r), Math.abs(b.pearson_r))
    })

    return sorted.slice(0, topCount)
  }, [minSample, sortMode, state, topCount])

  if (state.status === 'loading') return <div className="loading-state">Loading correlation ranking...</div>
  if (state.status === 'error') return <EmptyState title="Could not load Task 1 bar chart" message={state.error} />
  if (!filtered.length) {
    return (
      <>
        <div className="filter-row">
          <label className="filter-control">
            Minimum sample size
            <input id="task1b-min-sample" type="range" min="10" max="100" value={minSample} onChange={(e) => setMinSample(Number(e.target.value))} />
            <b>{minSample}</b>
          </label>
          <label className="filter-control">
            Top N groups
            <select id="task1b-top-count" value={topCount} onChange={(e) => setTopCount(Number(e.target.value))}>
              {topOptions.map((count) => (
                <option key={count} value={count}>Top {count}</option>
              ))}
            </select>
          </label>
          <label className="filter-control">
            Sort mode
            <select id="task1b-sort-mode" value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
              {sortModes.map((mode) => (
                <option key={mode.value} value={mode.value}>{mode.label}</option>
              ))}
            </select>
          </label>
        </div>
        <EmptyState title="No qualified correlations" message="Try lowering the minimum sample size or rerun preprocessing." />
      </>
    )
  }

  const { width, height } = wideChart
  const x = d3.scaleLinear([-1, 1], [chartMargins.left + 120, width - chartMargins.right])
  const y = d3.scaleBand(filtered.map((d) => d.group_label), [chartMargins.top, height - chartMargins.bottom]).padding(0.22)
  const zeroX = x(0)

  return (
    <div>
      <div className="filter-row">
        <label className="filter-control">
          Minimum sample size
          <input id="task1b-min-sample" type="range" min="10" max="100" value={minSample} onChange={(e) => setMinSample(Number(e.target.value))} />
          <b>{minSample}</b>
        </label>
        <label className="filter-control">
          Top N groups
          <select id="task1b-top-count" value={topCount} onChange={(e) => setTopCount(Number(e.target.value))}>
            {topOptions.map((count) => (
              <option key={count} value={count}>Top {count}</option>
            ))}
          </select>
        </label>
        <label className="filter-control">
          Sort mode
          <select id="task1b-sort-mode" value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
            {sortModes.map((mode) => (
              <option key={mode.value} value={mode.value}>{mode.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="legend task1b-legend" aria-label="Correlation legend">
        <span className="legend-item"><i className="legend-swatch positive-strong" />Positive, strong</span>
        <span className="legend-item"><i className="legend-swatch positive-weak" />Positive, weak</span>
        <span className="legend-item"><i className="legend-swatch neutral" />Near zero</span>
        <span className="legend-item"><i className="legend-swatch negative-weak" />Negative, weak</span>
        <span className="legend-item"><i className="legend-swatch negative-strong" />Negative, strong</span>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Correlation ranking bar chart">
        <line x1={zeroX} x2={zeroX} y1={chartMargins.top} y2={height - chartMargins.bottom} stroke="rgba(255,255,255,.24)" strokeDasharray="4 4" />
        {[-1, -0.5, 0, 0.5, 1].map((tick) => (
          <g key={tick}>
            <line className="grid-line" x1={x(tick)} x2={x(tick)} y1={chartMargins.top} y2={height - chartMargins.bottom} opacity={tick === 0 ? 0.5 : 0.18} />
            <text className="axis-label" x={x(tick)} y={height - 42} textAnchor="middle">{formatDecimal(tick)}</text>
          </g>
        ))}
        <text x={chartMargins.left + 12} y={32} className="axis-label">Neighbourhood · Room type</text>
        <text x={width - chartMargins.right - 10} y={32} className="axis-label" textAnchor="end">Pearson r</text>
        {filtered.map((d) => {
          const yPos = y(d.group_label) ?? 0
          const barX = x(Math.min(0, d.pearson_r))
          const barWidth = Math.abs(x(d.pearson_r) - x(0))
          const labelColor = strengthClass(d.pearson_r) === 'strong' ? '#ffffff' : '#e2e8f0'
          return (
            <g
              key={d.group_label}
              onMouseEnter={() => setTip(`${d.group_label}: r=${formatDecimal(d.pearson_r)}, n=${formatNumber(d.sample_size)}, avg price=$${formatDecimal(d.avg_price_clean)}, avg rating=${formatDecimal(d.avg_review_scores_rating)}`)}
              onMouseLeave={() => setTip('')}
            >
              <text x={chartMargins.left + 110} y={yPos + (y.bandwidth() / 2) + 4} textAnchor="end" className="axis-label small">{d.group_label}</text>
              <rect x={barX} y={yPos} width={Math.max(1, barWidth)} height={y.bandwidth()} rx={Math.max(3, y.bandwidth() * 0.2)} fill={barColor(d.pearson_r)} opacity={barOpacity(d.pearson_r)} />
              <text x={d.pearson_r >= 0 ? x(d.pearson_r) + 6 : x(d.pearson_r) - 6} y={yPos + (y.bandwidth() / 2) + 4} textAnchor={d.pearson_r >= 0 ? 'start' : 'end'} className="cell-text" style={{ fill: labelColor }}>{formatDecimal(d.pearson_r)}</text>
            </g>
          )
        })}
      </svg>

      <div className="tooltip-bar">
        {tip || `Bars to the right show segments where higher prices tend to align with higher ratings. Bars to the left show segments where higher prices may not be supported by guest satisfaction. Darker bars indicate stronger correlation.`}
      </div>
    </div>
  )
}
