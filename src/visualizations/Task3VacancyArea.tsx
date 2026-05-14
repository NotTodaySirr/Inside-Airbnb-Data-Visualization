import * as d3 from 'd3'
import { useState } from 'react'
import { useCsvData } from '../data/useCsvData'
import type { Task3VacancyMonthHostGroupRow } from '../types/charts'
import { EmptyState, Legend } from './chartHelpers'
import { chartMargins, formatPercent, hostGroupColor, uniqueValues, wideChart } from './chartScales'

function monthKey(value: Task3VacancyMonthHostGroupRow['date_month']): string {
  if (value instanceof Date) return d3.timeFormat('%Y-%m')(value)
  return String(value)
}

export function Task3VacancyArea() {
  const state = useCsvData<Task3VacancyMonthHostGroupRow>('/data/derived/task3_vacancy_month_host_group.csv')
  const [room, setRoom] = useState('')
  const [tip, setTip] = useState('')
  if (state.status === 'loading') return <div className="loading-state">Loading vacancy trends...</div>
  if (state.status === 'error') return <EmptyState title="Could not load Task 3" message={state.error} />

  const normalizedRows = state.data.map((row) => ({ ...row, date_month: monthKey(row.date_month) }))
  const rooms = uniqueValues(normalizedRows, d => d.room_type)
  const selected = room || rooms[0]
  const data = normalizedRows.filter(d => d.room_type === selected)
  if (!data.length) return <EmptyState title="No vacancy data" message="Choose another room type or rerun preprocessing." />

  const groups = uniqueValues(data, d => d.host_group)
  const months = uniqueValues(data, d => d.date_month)
  const { width, height } = wideChart
  const x = d3.scalePoint(months, [chartMargins.left, width-chartMargins.right])
  const y = d3.scaleLinear([0, Math.min(1, d3.max(data, d=>d.vacancy_rate) ?? 1)], [height-chartMargins.bottom, chartMargins.top]).nice()
  const area = d3.area<typeof data[number]>().x(d => x(d.date_month) ?? 0).y0(height-chartMargins.bottom).y1(d => y(d.vacancy_rate)).curve(d3.curveMonotoneX)
  const line = d3.line<typeof data[number]>().x(d => x(d.date_month) ?? 0).y(d => y(d.vacancy_rate)).curve(d3.curveMonotoneX)

  return <div><label className="filter-control">Room type <select id="task3-room-type" value={selected} onChange={e=>setRoom(e.target.value)}>{rooms.map(r=><option key={r}>{r}</option>)}</select></label><Legend items={groups} color={hostGroupColor}/><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Vacancy rate area chart">
    {y.ticks(5).map(t=><g key={t}><line className="grid-line" x1={chartMargins.left} x2={width-chartMargins.right} y1={y(t)} y2={y(t)}/><text className="axis-label" x={chartMargins.left-10} y={y(t)+4} textAnchor="end">{formatPercent(t)}</text></g>)}
    {groups.map(g => { const series=data.filter(d=>d.host_group===g).sort((a,b)=>a.date_month.localeCompare(b.date_month)); return <g key={g}><path d={area(series) ?? ''} fill={hostGroupColor(g)} opacity=".18"/><path d={line(series) ?? ''} fill="none" stroke={hostGroupColor(g)} strokeWidth="3"/>{series.map(d=><circle key={`${g}-${d.date_month}`} cx={x(d.date_month)} cy={y(d.vacancy_rate)} r="4" fill={hostGroupColor(g)} onMouseEnter={()=>setTip(`${d.date_month} · ${g}: ${formatPercent(d.vacancy_rate)} vacancy (${d.available_days}/${d.total_days} days)`)} onMouseLeave={()=>setTip('')}/>)}</g>})}
    {months.filter((_,i)=>i%2===0).map(m=><text key={m} className="axis-label" x={x(m)} y={height-42} textAnchor="middle">{m}</text>)}
  </svg><div className="tooltip-bar">{tip || 'Filter by room type, then hover points for available days.'}</div></div>
}
