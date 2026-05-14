import * as d3 from 'd3'
import { useState } from 'react'
import { ChartWorkspace, ToolboxControl, ToolboxSection } from '../components/ChartLayout'
import { useCsvData } from '../data/useCsvData'
import type { Task2ReviewMonthRoomTypeRow } from '../types/charts'
import { EmptyState, HoverCard, Legend } from './chartHelpers'
import { chartMargins, formatNumber, roomTypeColor, uniqueValues, wideChart } from './chartScales'

const monthWindowOptions = [
  { value: '12', label: 'Last 12 months' },
  { value: '24', label: 'Last 24 months' },
  { value: '36', label: 'Last 36 months' },
  { value: 'all', label: 'All months' },
] as const

function monthKey(value: Task2ReviewMonthRoomTypeRow['review_month']): string {
  if (value instanceof Date) return d3.timeFormat('%Y-%m')(value)
  return String(value)
}

type HoverCardState = {
  x: number
  y: number
  title: string
  rows: { label: string; value: string }[]
}

export function Task2StackedReviews() {
  const state = useCsvData<Task2ReviewMonthRoomTypeRow>('/data/derived/task2_review_month_room_type.csv')
  const [hiddenRoomTypes, setHiddenRoomTypes] = useState<string[]>([])
  const [monthWindow, setMonthWindow] = useState('36')
  const [hoverCard, setHoverCard] = useState<HoverCardState | null>(null)

  if (state.status === 'loading') return <div className="loading-state">Loading monthly reviews...</div>
  if (state.status === 'error') return <EmptyState title="Could not load Task 2" message={state.error} />

  const rows = state.data.map((row) => ({ ...row, review_month: monthKey(row.review_month) }))
  const rooms = uniqueValues(rows, d => d.room_type)
  const visibleRooms = rooms.filter(room => !hiddenRoomTypes.includes(room))
  const allMonths = uniqueValues(rows, d => d.review_month)
  const months = monthWindow === 'all' ? allMonths : allMonths.slice(-Number(monthWindow))
  const monthLabel = monthWindowOptions.find(option => option.value === monthWindow)?.label ?? 'Last 36 months'
  const roomSummary = visibleRooms.length === rooms.length ? 'All room types' : `${visibleRooms.length}/${rooms.length} room types`
  const activeSummary = `${roomSummary} - ${monthLabel}`

  const toggleRoom = (room: string) => {
    setHiddenRoomTypes((current) => (
      current.includes(room) ? current.filter(item => item !== room) : [...current, room]
    ))
  }

  const resetFilters = () => {
    setHiddenRoomTypes([])
    setMonthWindow('36')
  }

  const toolbox = (
    <>
      <ToolboxSection title="Data Filters">
        <div className="toolbox-check-list">
          {rooms.map((room) => (
            <label key={room} className="toolbox-check">
              <input type="checkbox" checked={!hiddenRoomTypes.includes(room)} onChange={() => toggleRoom(room)} />
              <span>{room}</span>
            </label>
          ))}
        </div>
      </ToolboxSection>

      <ToolboxSection title="Display">
        <ToolboxControl label="Month window">
          <select id="task2-month-window" value={monthWindow} onChange={(e) => setMonthWindow(e.target.value)}>
            {monthWindowOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </ToolboxControl>
      </ToolboxSection>

      <button className="toolbox-reset" type="button" onClick={resetFilters}>Reset filters</button>
    </>
  )

  if (!rows.length) {
    return (
      <ChartWorkspace toolbox={toolbox} activeSummary={activeSummary} caption="No review rows are available in the derived monthly review file.">
        <EmptyState title="No reviews found" message="The derived monthly review file is empty." />
      </ChartWorkspace>
    )
  }

  if (!visibleRooms.length) {
    return (
      <ChartWorkspace toolbox={toolbox} activeSummary={activeSummary} caption="No room types are currently visible. Re-enable at least one room type to draw the chart.">
        <EmptyState title="No visible room types" message="Use the toolbox to turn a room type back on." />
      </ChartWorkspace>
    )
  }

  roomTypeColor.domain(rooms)
  const filteredRows = rows.filter(d => visibleRooms.includes(d.room_type) && months.includes(d.review_month))
  const byMonth = months.map((month) => {
    const monthRecord = Object.fromEntries(visibleRooms.map(room => [room, 0])) as Record<string, number>
    filteredRows.filter(d => d.review_month === month).forEach((row) => {
      monthRecord[row.room_type] = row.review_count
    })
    return { review_month: month, ...monthRecord }
  }) as Record<string, number | string>[]
  const stack = d3.stack<Record<string, number | string>>().keys(visibleRooms)(byMonth)
  const { width, height } = wideChart
  const x = d3.scaleBand(months, [chartMargins.left, width - chartMargins.right]).padding(.18)
  const y = d3.scaleLinear([0, d3.max(stack, s => d3.max(s, d => d[1])) ?? 1], [height - chartMargins.bottom, chartMargins.top]).nice()

  return (
    <ChartWorkspace
      toolbox={toolbox}
      activeSummary={activeSummary}
      caption={`Showing monthly review volume by room type for ${monthLabel.toLowerCase()}. Toggle room types to compare demand composition.`}
    >
      <div className="task-chart-shell">
        <Legend items={visibleRooms} color={roomTypeColor} />
        <div className="task-plot-wrap">
          <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Stacked monthly reviews by room type">
            {y.ticks(5).map(t => (
              <g key={t}>
                <line x1={chartMargins.left} x2={width - chartMargins.right} y1={y(t)} y2={y(t)} className="grid-line" />
                <text x={chartMargins.left - 10} y={y(t) + 4} textAnchor="end" className="axis-label">{formatNumber(t)}</text>
              </g>
            ))}
            {stack.map(series => (
              <g key={series.key} fill={roomTypeColor(series.key)}>
                {series.map(d => {
                  const reviewCount = Number(d[1] - d[0])
                  const hover = {
                    title: `${String(d.data.review_month)} - ${series.key}`,
                    rows: [
                      { label: 'Month', value: String(d.data.review_month) },
                      { label: 'Room type', value: String(series.key) },
                      { label: 'Review count', value: formatNumber(reviewCount) },
                    ],
                  }

                  return (
                    <rect
                      key={`${series.key}-${d.data.review_month}`}
                      x={x(String(d.data.review_month))}
                      y={y(d[1])}
                      width={x.bandwidth()}
                      height={Math.max(0, y(d[0]) - y(d[1]))}
                      rx={4}
                      onMouseEnter={(e) => {
                        const rect = (e.currentTarget.ownerSVGElement ?? e.currentTarget).getBoundingClientRect()
                        setHoverCard({ x: e.clientX - rect.left + 16, y: e.clientY - rect.top - 18, ...hover })
                      }}
                      onMouseMove={(e) => {
                        const rect = (e.currentTarget.ownerSVGElement ?? e.currentTarget).getBoundingClientRect()
                        setHoverCard((current) => current ? { ...current, x: e.clientX - rect.left + 16, y: e.clientY - rect.top - 18, ...hover } : null)
                      }}
                      onMouseLeave={() => setHoverCard(null)}
                    />
                  )
                })}
              </g>
            ))}
            {months.filter((_, i) => i % 3 === 0).map(m => (
              <text key={m} x={(x(m) ?? 0) + x.bandwidth() / 2} y={height - 42} textAnchor="middle" className="axis-label" transform={`rotate(-35 ${(x(m) ?? 0) + x.bandwidth() / 2} ${height - 42})`}>{m}</text>
            ))}
          </svg>
          {hoverCard ? <HoverCard {...hoverCard} /> : null}
        </div>
      </div>
    </ChartWorkspace>
  )
}
