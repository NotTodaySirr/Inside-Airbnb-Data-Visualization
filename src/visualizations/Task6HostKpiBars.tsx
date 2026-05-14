import * as d3 from 'd3'
import { useState } from 'react'
import { useCsvData } from '../data/useCsvData'
import type { Task6HostKpiRow } from '../types/charts'
import { EmptyState, Legend } from './chartHelpers'
import { chartMargins, formatDecimal, formatNumber, hostGroupColor, uniqueValues, wideChart } from './chartScales'

const labels: Record<string,string> = { avg_host_acceptance_rate: 'Acceptance', instant_bookable_rate: 'Instant book', avg_review_scores_rating: 'Rating' }

export function Task6HostKpiBars() {
  const state = useCsvData<Task6HostKpiRow>('/data/derived/task6_host_kpi.csv')
  const [tip, setTip] = useState('')
  if (state.status === 'loading') return <div className="loading-state">Loading host KPIs...</div>
  if (state.status === 'error') return <EmptyState title="Could not load Task 6" message={state.error} />
  const data = state.data.filter(d => d.kpi_name !== 'license_valid_rate')
  if (!data.length) return <EmptyState title="No KPI data" message="The derived KPI file is empty." />
  const kpis = ['avg_host_acceptance_rate','instant_bookable_rate','avg_review_scores_rating']
  const groups = uniqueValues(data, d=>d.host_performance_group)
  const { width, height } = wideChart
  const x0 = d3.scaleBand(kpis, [chartMargins.left, width-chartMargins.right]).padding(.24)
  const x1 = d3.scaleBand(groups, [0, x0.bandwidth()]).padding(.16)
  const y = d3.scaleLinear([0, d3.max(data, d=>d.kpi_name.includes('rating') ? d.kpi_value : Math.min(1,d.kpi_value)) ?? 1], [height-chartMargins.bottom, chartMargins.top]).nice()
  return <div><Legend items={groups} color={hostGroupColor}/><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Grouped host KPI bars">
    {y.ticks(5).map(t=><g key={t}><line className="grid-line" x1={chartMargins.left} x2={width-chartMargins.right} y1={y(t)} y2={y(t)}/><text className="axis-label" x={chartMargins.left-10} y={y(t)+4} textAnchor="end">{formatDecimal(t)}</text></g>)}
    {data.map(d=>{const h=d.host_performance_group; return <rect key={`${d.kpi_name}-${h}`} x={(x0(d.kpi_name)??0)+(x1(h)??0)} y={y(d.kpi_value)} width={x1.bandwidth()} height={height-chartMargins.bottom-y(d.kpi_value)} rx="10" fill={hostGroupColor(h)} onMouseEnter={()=>setTip(`${labels[d.kpi_name] ?? d.kpi_name} · ${h}: ${formatDecimal(d.kpi_value)} from ${formatNumber(d.sample_size)} records`)} onMouseLeave={()=>setTip('')}/>})}
    {kpis.map(k=><text key={k} className="axis-label" x={(x0(k)??0)+x0.bandwidth()/2} y={height-42} textAnchor="middle">{labels[k]}</text>)}
  </svg><div className="tooltip-bar">{tip || 'License KPI removed. Values ignore nulls per KPI.'}</div></div>
}
