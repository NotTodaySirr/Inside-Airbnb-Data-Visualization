import * as d3 from 'd3'
import { useState } from 'react'
import { ChartWorkspace, ToolboxControl, ToolboxSection } from '../components/ChartLayout'
import { useCsvData } from '../data/useCsvData'
import type { Task3VacancyMonthHostGroupRow } from '../types/charts'
import { EmptyState, HoverCard, Legend } from './chartHelpers'
import type { HoverCardProps } from './chartHelpers'
import { chartMargins, formatPercent, hostGroupColor, uniqueValues, wideChart } from './chartScales'

function monthKey(value: Task3VacancyMonthHostGroupRow['date_month']): string {
  if (value instanceof Date) return d3.timeFormat('%Y-%m')(value)
  return String(value)
}

type HoverCardState = HoverCardProps

export function Task3VacancyArea() {
  const state = useCsvData<Task3VacancyMonthHostGroupRow>('/data/derived/task3_vacancy_month_host_group.csv')
  const [room, setRoom] = useState('')
  const [hiddenHostGroups, setHiddenHostGroups] = useState<string[]>([])
  const [hoverCard, setHoverCard] = useState<HoverCardState | null>(null)

  if (state.status === 'loading') return <div className="loading-state">Loading vacancy trends...</div>
  if (state.status === 'error') return <EmptyState title="Could not load Task 3" message={state.error} />

  const normalizedRows = state.data.map((row) => ({ ...row, date_month: monthKey(row.date_month) }))
  const rooms = uniqueValues(normalizedRows, d => d.room_type)
  const selected = room || rooms[0] || ''
  const data = normalizedRows.filter(d => d.room_type === selected)
  const groups = uniqueValues(data, d => d.host_group)
  const visibleGroups = groups.filter(group => !hiddenHostGroups.includes(group))
  const visibleData = data.filter(d => visibleGroups.includes(d.host_group))
  const groupSummary = visibleGroups.length === groups.length ? 'All host groups' : `${visibleGroups.length}/${groups.length} host groups`
  const activeSummary = `${selected || 'No room type'} - ${groupSummary}`

  const toggleHostGroup = (group: string) => {
    setHiddenHostGroups((current) => (
      current.includes(group) ? current.filter(item => item !== group) : [...current, group]
    ))
  }

  const resetFilters = () => {
    setRoom('')
    setHiddenHostGroups([])
  }

  const toolbox = (
    <>
      <ToolboxSection title="Data Filters">
        <ToolboxControl label="Room type">
          <select id="task3-room-type" value={selected} onChange={e => setRoom(e.target.value)}>
            {rooms.map(r => <option key={r}>{r}</option>)}
          </select>
        </ToolboxControl>
      </ToolboxSection>

      <ToolboxSection title="Display">
        <div className="toolbox-check-list">
          {groups.map((group) => (
            <label key={group} className="toolbox-check">
              <input type="checkbox" checked={!hiddenHostGroups.includes(group)} onChange={() => toggleHostGroup(group)} />
              <span>{group}</span>
            </label>
          ))}
        </div>
      </ToolboxSection>

      <button className="toolbox-reset" type="button" onClick={resetFilters}>Reset filters</button>
    </>
  )

  if (!data.length) {
    return (
      <ChartWorkspace toolbox={toolbox} activeSummary={activeSummary} caption="No vacancy rows are available for the selected room type.">
        <EmptyState title="No vacancy data" message="Choose another room type or rerun preprocessing." />
      </ChartWorkspace>
    )
  }

  if (!visibleGroups.length) {
    return (
      <ChartWorkspace toolbox={toolbox} activeSummary={activeSummary} caption="No host groups are currently visible. Re-enable at least one host group to draw the trend.">
        <EmptyState title="No visible host groups" message="Use the toolbox to turn a host group back on." />
      </ChartWorkspace>
    )
  }

  const months = uniqueValues(data, d => d.date_month)
  const { width, height } = wideChart
  const x = d3.scalePoint(months, [chartMargins.left, width - chartMargins.right])
  const y = d3.scaleLinear([0, Math.min(1, d3.max(visibleData, d => d.vacancy_rate) ?? 1)], [height - chartMargins.bottom, chartMargins.top]).nice()
  const area = d3.area<typeof visibleData[number]>().x(d => x(d.date_month) ?? 0).y0(height - chartMargins.bottom).y1(d => y(d.vacancy_rate)).curve(d3.curveMonotoneX)
  const line = d3.line<typeof visibleData[number]>().x(d => x(d.date_month) ?? 0).y(d => y(d.vacancy_rate)).curve(d3.curveMonotoneX)

  return (
    <ChartWorkspace
      toolbox={toolbox}
      activeSummary={activeSummary}
      caption={`Showing vacancy-rate trends for ${selected}, split by visible host groups.`}
    >
      <div className="task-chart-shell">
        <Legend items={visibleGroups} color={hostGroupColor} />
        <div className="task-plot-wrap">
          <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Vacancy rate area chart">
            {y.ticks(5).map(t => (
              <g key={t}>
                <line className="grid-line" x1={chartMargins.left} x2={width - chartMargins.right} y1={y(t)} y2={y(t)} />
                <text className="axis-label" x={chartMargins.left - 10} y={y(t) + 4} textAnchor="end">{formatPercent(t)}</text>
              </g>
            ))}
            {visibleGroups.map(g => {
              const series = visibleData.filter(d => d.host_group === g).sort((a, b) => a.date_month.localeCompare(b.date_month))
              return (
                <g key={g}>
                  <path d={area(series) ?? ''} fill={hostGroupColor(g)} opacity=".18" />
                  <path d={line(series) ?? ''} fill="none" stroke={hostGroupColor(g)} strokeWidth="3" />
                  {series.map(d => {
                    const hover = {
                      title: `${d.date_month} - ${g}`,
                      rows: [
                        { label: 'Month', value: d.date_month },
                        { label: 'Host group', value: g },
                        { label: 'Room type', value: d.room_type },
                        { label: 'Vacancy rate', value: formatPercent(d.vacancy_rate) },
                        { label: 'Available days', value: `${d.available_days}/${d.total_days}` },
                      ],
                    }

                    return (
                      <circle
                        key={`${g}-${d.date_month}`}
                        cx={x(d.date_month)}
                        cy={y(d.vacancy_rate)}
                        r="4"
                        fill={hostGroupColor(g)}
                        onMouseEnter={e => {
                          const rect = (e.currentTarget.ownerSVGElement ?? e.currentTarget).getBoundingClientRect()
                          setHoverCard({ x: e.clientX - rect.left + 16, y: e.clientY - rect.top - 18, ...hover })
                        }}
                        onMouseMove={e => {
                          const rect = (e.currentTarget.ownerSVGElement ?? e.currentTarget).getBoundingClientRect()
                          setHoverCard(current => current ? { ...current, x: e.clientX - rect.left + 16, y: e.clientY - rect.top - 18, ...hover } : null)
                        }}
                        onMouseLeave={() => setHoverCard(null)}
                      />
                    )
                  })}
                </g>
              )
            })}
            {months.filter((_, i) => i % 2 === 0).map(m => (
              <text key={m} className="axis-label" x={x(m)} y={height - 42} textAnchor="middle">{m}</text>
            ))}
          </svg>
          {hoverCard ? <HoverCard {...hoverCard} /> : null}
        </div>
      </div>
    </ChartWorkspace>
  )
}
