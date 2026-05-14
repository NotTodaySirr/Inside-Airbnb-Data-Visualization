import * as d3 from 'd3'
import { useState } from 'react'
import { useCsvData } from '../data/useCsvData'
import type { Task2ReviewMonthRoomTypeRow } from '../types/charts'
import { EmptyState, Legend } from './chartHelpers'
import { chartMargins, formatNumber, roomTypeColor, wideChart } from './chartScales'

function monthKey(value: Task2ReviewMonthRoomTypeRow['review_month']): string {
  if (value instanceof Date) return d3.timeFormat('%Y-%m')(value)
  return String(value)
}

export function Task2StackedReviews() {
  const state = useCsvData<Task2ReviewMonthRoomTypeRow>('/data/derived/task2_review_month_room_type.csv')
  const [tip, setTip] = useState('')
  if (state.status === 'loading') return <div className="loading-state">Loading monthly reviews...</div>
  if (state.status === 'error') return <EmptyState title="Could not load Task 2" message={state.error} />
  const rows = state.data.map((row) => ({ ...row, review_month: monthKey(row.review_month) }))
  if (!rows.length) return <EmptyState title="No reviews found" message="The derived monthly review file is empty." />
  const months = Array.from(new Set(rows.map(d => d.review_month))).sort().slice(-36)
  const rooms = Array.from(new Set(rows.map(d => d.room_type))).sort()
  roomTypeColor.domain(rooms)
  const byMonth = months.map(m => Object.assign({ review_month: m }, Object.fromEntries(rooms.map(r => [r, 0])), ...rows.filter(d => d.review_month === m).map(d => ({ [d.room_type]: d.review_count })))) as Record<string, number | string>[]
  const stack = d3.stack<Record<string, number | string>>().keys(rooms)(byMonth)
  const { width, height } = wideChart
  const x = d3.scaleBand(months, [chartMargins.left, width-chartMargins.right]).padding(.18)
  const y = d3.scaleLinear([0, d3.max(stack, s => d3.max(s, d => d[1])) ?? 1], [height-chartMargins.bottom, chartMargins.top]).nice()
  return <div><Legend items={rooms} color={roomTypeColor}/><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Stacked monthly reviews by room type">
    {y.ticks(5).map(t => <g key={t}><line x1={chartMargins.left} x2={width-chartMargins.right} y1={y(t)} y2={y(t)} className="grid-line"/><text x={chartMargins.left-10} y={y(t)+4} textAnchor="end" className="axis-label">{formatNumber(t)}</text></g>)}
    {stack.map(series => <g key={series.key} fill={roomTypeColor(series.key)}>{series.map(d => <rect key={`${series.key}-${d.data.review_month}`} x={x(String(d.data.review_month))} y={y(d[1])} width={x.bandwidth()} height={Math.max(0, y(d[0])-y(d[1]))} rx={4} onMouseEnter={() => setTip(`${String(d.data.review_month)} · ${series.key}: ${formatNumber(Number(d[1]-d[0]))} reviews`)} onMouseLeave={() => setTip('')}/>)}</g>)}
    {months.filter((_,i)=>i%3===0).map(m => <text key={m} x={(x(m)??0)+x.bandwidth()/2} y={height-42} textAnchor="middle" className="axis-label" transform={`rotate(-35 ${(x(m)??0)+x.bandwidth()/2} ${height-42})`}>{m}</text>)}
  </svg><div className="tooltip-bar">{tip || 'Hover a segment to inspect monthly review volume.'}</div></div>
}
