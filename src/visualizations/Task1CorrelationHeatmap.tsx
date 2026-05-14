import * as d3 from 'd3'
import { useState } from 'react'
import { useCsvData } from '../data/useCsvData'
import type { Task1PriceRatingCorrRow } from '../types/charts'
import { EmptyState } from './chartHelpers'
import { chartMargins, correlationColor, formatDecimal, formatNumber, wideChart } from './chartScales'

const url = '/data/derived/task1_price_rating_corr.csv'
const topCounts = [25, 50, 100, 200]

export function Task1CorrelationHeatmap() {
  const state = useCsvData<Task1PriceRatingCorrRow>(url)
  const [minSample, setMinSample] = useState(10)
  const [topCount, setTopCount] = useState(50)
  const [tip, setTip] = useState<string>('')
  if (state.status === 'loading') return <div className="loading-state">Loading correlation heatmap...</div>
  if (state.status === 'error') return <EmptyState title="Could not load Task 1" message={state.error} />

  const data = state.data.filter((d) => d.sample_size >= minSample)
  const rankedNeighbourhoods = Array.from(d3.rollup(data, v => d3.sum(v, d => d.sample_size), d => d.neighbourhood_cleansed))
    .sort((a, b) => d3.descending(a[1], b[1]))
    .slice(0, topCount)
    .map(([name]) => name)
    .sort((a, b) => a.localeCompare(b))

  if (!data.length) return <><Filter minSample={minSample} setMinSample={setMinSample} topCount={topCount} setTopCount={setTopCount}/><EmptyState title="No qualified correlations" message="Try lowering the minimum sample size or rerun preprocessing." /></>

  const rooms = Array.from(new Set(data.map(d => d.room_type))).sort()
  const visible = data.filter(d => rankedNeighbourhoods.includes(d.neighbourhood_cleansed))
  const { width, height } = wideChart
  const x = d3.scaleBand(rooms, [chartMargins.left + 90, width - chartMargins.right]).padding(.04)
  const y = d3.scaleBand(rankedNeighbourhoods, [chartMargins.top, height - chartMargins.bottom]).padding(.04)
  const cellSize = Math.min(x.bandwidth(), y.bandwidth())

  return <div><Filter minSample={minSample} setMinSample={setMinSample} topCount={topCount} setTopCount={setTopCount}/><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Price rating correlation heatmap">
    <text x={chartMargins.left + 90} y={height - 18} className="axis-label">Room type</text>
    <text x="22" y="32" className="axis-label">Neighbourhood</text>
    <g>{rooms.map(r => <text key={r} x={(x(r) ?? 0)+x.bandwidth()/2} y={height-42} textAnchor="middle" className="axis-label">{r}</text>)}</g>
    <g>{rankedNeighbourhoods.map(n => <text key={n} x={chartMargins.left+78} y={(y(n) ?? 0)+y.bandwidth()/2+4} textAnchor="end" className="axis-label small">{n}</text>)}</g>
    {visible.map(d => {
      const cx = (x(d.room_type) ?? 0) + x.bandwidth() / 2
      const cy = (y(d.neighbourhood_cleansed) ?? 0) + y.bandwidth() / 2
      return <g key={`${d.neighbourhood_cleansed}-${d.room_type}`} onMouseEnter={() => setTip(`${d.neighbourhood_cleansed} / ${d.room_type}: r=${formatDecimal(d.pearson_r)}, n=${formatNumber(d.sample_size)}, avg price=$${formatDecimal(d.avg_price_clean)}, avg rating=${formatDecimal(d.avg_review_scores_rating)}`)} onMouseLeave={() => setTip('')}>
        <rect x={cx - cellSize / 2} y={cy - cellSize / 2} width={cellSize} height={cellSize} rx={Math.max(2, cellSize * .18)} fill={correlationColor(d.pearson_r)} />
        {cellSize >= 20 && <text x={cx} y={cy+4} textAnchor="middle" className="cell-text">{formatDecimal(d.pearson_r)}</text>}
      </g>
    })}
  </svg><div className="tooltip-bar">{tip || `Hover a square for sample size and averages. Showing top ${topCount} neighbourhoods by qualified sample volume.`}</div></div>
}

function Filter({minSample,setMinSample,topCount,setTopCount}:{minSample:number;setMinSample:(v:number)=>void;topCount:number;setTopCount:(v:number)=>void}){
  return <div className="filter-row"><label className="filter-control">Minimum sample size <input id="task1-min-sample" type="range" min="10" max="100" value={minSample} onChange={e=>setMinSample(Number(e.target.value))}/><b>{minSample}</b></label><label className="filter-control">Neighbourhoods <select id="task1-top-count" value={topCount} onChange={e=>setTopCount(Number(e.target.value))}>{topCounts.map(count => <option key={count} value={count}>Top {count}</option>)}</select></label></div>
}
