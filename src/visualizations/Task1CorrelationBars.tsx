import * as d3 from 'd3'
import { useMemo, useState } from 'react'
import { ChartWorkspace, ToolboxControl, ToolboxSection } from '../components/ChartLayout'
import { useGlobalFilters } from '../components/GlobalFiltersContext'
import { useCsvData } from '../data/useCsvData'
import type { Task1PriceRatingCorrBarRow, Task1PriceRatingCorrRow } from '../types/charts'
import { EmptyState, HoverCard } from './chartHelpers'
import { chartMargins, formatDecimal, formatNumber, uniqueValues, wideChart } from './chartScales'
import { rowMatchesGlobalFilters } from './globalFilterHelpers'

const url = '/data/derived/task1_price_rating_corr.csv'
const topOptions = [10, 20, 40, 60]
const sortModes = [
  { value: 'strongest', label: 'Strongest relationship' },
  { value: 'positive', label: 'Highest positive r' },
  { value: 'negative', label: 'Lowest negative r' },
] as const
const directionOptions = [
  { value: 'both', label: 'Both directions' },
  { value: 'positive', label: 'Positive only' },
  { value: 'negative', label: 'Negative only' },
] as const

type SortMode = (typeof sortModes)[number]['value']
type DirectionMode = (typeof directionOptions)[number]['value']

type HoverCardState = {
  x: number
  y: number
  title: string
  rows: { label: string; value: string }[]
}

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
  const globalFilters = useGlobalFilters()
  const [minSample, setMinSample] = useState(10)
  const [topCount, setTopCount] = useState(40)
  const [sortMode, setSortMode] = useState<SortMode>('strongest')
  const [direction, setDirection] = useState<DirectionMode>('both')
  const [roomType, setRoomType] = useState('All')
  const [hoverCard, setHoverCard] = useState<HoverCardState | null>(null)

  const filtered = useMemo<Task1PriceRatingCorrBarRow[]>(() => {
    if (state.status !== 'loaded') return []

    const mapped = state.data
      .filter((d) => rowMatchesGlobalFilters(d, globalFilters))
      .filter((d) => d.sample_size >= minSample)
      .filter((d) => roomType === 'All' || d.room_type === roomType)
      .filter((d) => {
        if (direction === 'positive') return d.pearson_r > 0
        if (direction === 'negative') return d.pearson_r < 0
        return true
      })
      .map((d) => ({ ...d, group_label: `${d.neighbourhood_cleansed} - ${d.room_type}` }))

    const sorted = mapped.sort((a, b) => {
      if (sortMode === 'positive') return d3.descending(a.pearson_r, b.pearson_r)
      if (sortMode === 'negative') return d3.ascending(a.pearson_r, b.pearson_r)
      return d3.descending(Math.abs(a.pearson_r), Math.abs(b.pearson_r))
    })

    return sorted.slice(0, topCount)
  }, [direction, globalFilters, minSample, roomType, sortMode, state, topCount])

  const roomTypes = state.status === 'loaded' ? uniqueValues(state.data, d => d.room_type) : []
  const sortLabel = sortModes.find(mode => mode.value === sortMode)?.label ?? 'Strongest relationship'
  const directionLabel = directionOptions.find(option => option.value === direction)?.label ?? 'Both directions'
  const activeSummary = `${roomType} - sample size >= ${minSample} - Top ${topCount} - ${directionLabel}`

  const resetFilters = () => {
    setMinSample(10)
    setTopCount(40)
    setSortMode('strongest')
    setDirection('both')
    setRoomType('All')
  }

  const toolbox = (
    <>
      <ToolboxSection title="Data Filters">
        <ToolboxControl label="Room type">
          <select id="task1b-room-type" value={roomType} onChange={(e) => setRoomType(e.target.value)}>
            <option>All</option>
            {roomTypes.map((type) => <option key={type}>{type}</option>)}
          </select>
        </ToolboxControl>
        <ToolboxControl label="Minimum sample size">
          <div className="toolbox-range">
            <input id="task1b-min-sample" type="range" min="10" max="100" value={minSample} onChange={(e) => setMinSample(Number(e.target.value))} />
            <b>{minSample}</b>
          </div>
        </ToolboxControl>
      </ToolboxSection>

      <ToolboxSection title="Ranking">
        <ToolboxControl label="Top N groups">
          <select id="task1b-top-count" value={topCount} onChange={(e) => setTopCount(Number(e.target.value))}>
            {topOptions.map((count) => (
              <option key={count} value={count}>Top {count}</option>
            ))}
          </select>
        </ToolboxControl>
        <ToolboxControl label="Direction">
          <select id="task1b-direction" value={direction} onChange={(e) => setDirection(e.target.value as DirectionMode)}>
            {directionOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </ToolboxControl>
        <ToolboxControl label="Sort mode">
          <select id="task1b-sort-mode" value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
            {sortModes.map((mode) => (
              <option key={mode.value} value={mode.value}>{mode.label}</option>
            ))}
          </select>
        </ToolboxControl>
      </ToolboxSection>

      <ToolboxSection title="Metric">
        <div className="toolbox-static">
          <span>Correlation method</span>
          <strong>Pearson r</strong>
        </div>
        <div className="toolbox-static">
          <span>Group level</span>
          <strong>Neighbourhood + room type</strong>
        </div>
      </ToolboxSection>

      <button className="toolbox-reset" type="button" onClick={resetFilters}>Reset filters</button>
    </>
  )

  if (state.status === 'loading') return <div className="loading-state">Loading correlation ranking...</div>
  if (state.status === 'error') return <EmptyState title="Could not load Task 1 bar chart" message={state.error} />
  if (!filtered.length) {
    return (
      <ChartWorkspace
        toolbox={toolbox}
        activeSummary={activeSummary}
        caption={`Showing ${directionLabel.toLowerCase()} ranked by ${sortLabel.toLowerCase()}, filtered to sample size >= ${minSample}.`}
      >
        <EmptyState title="No qualified correlations" message="Try lowering the minimum sample size or rerun preprocessing." />
      </ChartWorkspace>
    )
  }

  const { width, height } = wideChart
  const x = d3.scaleLinear([-1, 1], [chartMargins.left + 120, width - chartMargins.right])
  const y = d3.scaleBand(filtered.map((d) => d.group_label), [chartMargins.top, height - chartMargins.bottom]).padding(0.22)
  const zeroX = x(0)

  return (
    <ChartWorkspace
      toolbox={toolbox}
      activeSummary={activeSummary}
      caption={`Showing the top ${filtered.length} groups by ${sortLabel.toLowerCase()}, filtered to sample size >= ${minSample}. Positive r means higher price tends to align with higher rating; negative r means higher price tends to align with lower rating.`}
    >
      <div className="task1b-chart-shell">
        <div className="legend task1b-legend" aria-label="Correlation legend">
          <span className="legend-item"><i className="legend-swatch positive-strong" />Positive, strong</span>
          <span className="legend-item"><i className="legend-swatch positive-weak" />Positive, weak</span>
          <span className="legend-item"><i className="legend-swatch neutral" />Near zero</span>
          <span className="legend-item"><i className="legend-swatch negative-weak" />Negative, weak</span>
          <span className="legend-item"><i className="legend-swatch negative-strong" />Negative, strong</span>
        </div>

        <div className="task1b-plot-wrap">
          <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Correlation ranking bar chart">
            <line x1={zeroX} x2={zeroX} y1={chartMargins.top} y2={height - chartMargins.bottom} stroke="rgba(255,255,255,.24)" strokeDasharray="4 4" />
            {[-1, -0.5, 0, 0.5, 1].map((tick) => (
              <g key={tick}>
                <line className="grid-line" x1={x(tick)} x2={x(tick)} y1={chartMargins.top} y2={height - chartMargins.bottom} opacity={tick === 0 ? 0.5 : 0.18} />
                <text className="axis-label" x={x(tick)} y={height - 42} textAnchor="middle">{formatDecimal(tick)}</text>
              </g>
            ))}
            <text x={chartMargins.left + 12} y={32} className="axis-label">Neighbourhood - Room type</text>
            <text x={width - chartMargins.right - 10} y={32} className="axis-label" textAnchor="end">Pearson r</text>
            {filtered.map((d) => {
              const yPos = y(d.group_label) ?? 0
              const barX = x(Math.min(0, d.pearson_r))
              const barWidth = Math.abs(x(d.pearson_r) - x(0))
              const labelColor = strengthClass(d.pearson_r) === 'strong' ? '#ffffff' : '#e2e8f0'
              return (
                <g
                  key={d.group_label}
                  onMouseEnter={(e) => {
                    setHoverCard({
                      x: e.clientX + 16,
                      y: e.clientY - 18,
                      title: d.group_label,
                      rows: [
                        { label: 'Neighbourhood', value: d.neighbourhood_cleansed },
                        { label: 'Room type', value: d.room_type },
                        { label: 'Pearson r', value: formatDecimal(d.pearson_r) },
                        { label: 'Sample size', value: formatNumber(d.sample_size) },
                        { label: 'Avg price', value: `$${formatDecimal(d.avg_price_clean)}` },
                        { label: 'Avg rating', value: formatDecimal(d.avg_review_scores_rating) },
                      ],
                    })
                  }}
                  onMouseMove={(e) => {
                    setHoverCard((current) => current ? {
                      ...current,
                      x: e.clientX + 16,
                      y: e.clientY - 18,
                    } : null)
                  }}
                  onMouseLeave={() => setHoverCard(null)}
                >
                  <text x={chartMargins.left + 110} y={yPos + (y.bandwidth() / 2) + 4} textAnchor="end" className="axis-label small">{d.group_label}</text>
                  <rect x={barX} y={yPos} width={Math.max(1, barWidth)} height={y.bandwidth()} rx={Math.max(3, y.bandwidth() * 0.2)} fill={barColor(d.pearson_r)} opacity={barOpacity(d.pearson_r)} />
                  <text x={d.pearson_r >= 0 ? x(d.pearson_r) + 6 : x(d.pearson_r) - 6} y={yPos + (y.bandwidth() / 2) + 4} textAnchor={d.pearson_r >= 0 ? 'start' : 'end'} className="cell-text" style={{ fill: labelColor }}>{formatDecimal(d.pearson_r)}</text>
                </g>
              )
            })}
          </svg>

          {hoverCard && <HoverCard x={hoverCard.x} y={hoverCard.y} title={hoverCard.title} rows={hoverCard.rows} />}
        </div>
      </div>
    </ChartWorkspace>
  )
}
