import * as d3 from 'd3'
import { useState } from 'react'
import { ChartWorkspace, ToolboxSection } from '../components/ChartLayout'
import { useCsvData } from '../data/useCsvData'
import type { Task6HostKpiRow } from '../types/charts'
import { EmptyState, HoverCard, Legend } from './chartHelpers'
import type { HoverCardProps } from './chartHelpers'
import { chartMargins, formatDecimal, formatNumber, hostGroupColor, uniqueValues, wideChart } from './chartScales'

const labels: Record<string, string> = {
  avg_host_acceptance_rate: 'Acceptance',
  instant_bookable_rate: 'Instant book',
  avg_review_scores_rating: 'Rating',
}

type HoverCardState = HoverCardProps

export function Task6HostKpiBars() {
  const state = useCsvData<Task6HostKpiRow>('/data/derived/task6_host_kpi.csv')
  const [hiddenKpis, setHiddenKpis] = useState<string[]>([])
  const [hiddenHostGroups, setHiddenHostGroups] = useState<string[]>([])
  const [hoverCard, setHoverCard] = useState<HoverCardState | null>(null)

  if (state.status === 'loading') return <div className="loading-state">Loading host KPIs...</div>
  if (state.status === 'error') return <EmptyState title="Could not load Task 6" message={state.error} />

  const data = state.data.filter(d => d.kpi_name !== 'license_valid_rate')
  const kpis = ['avg_host_acceptance_rate', 'instant_bookable_rate', 'avg_review_scores_rating']
  const groups = uniqueValues(data, d => d.host_performance_group)
  const visibleKpis = kpis.filter(kpi => !hiddenKpis.includes(kpi))
  const visibleGroups = groups.filter(group => !hiddenHostGroups.includes(group))
  const visibleData = data.filter(d => visibleKpis.includes(d.kpi_name) && visibleGroups.includes(d.host_performance_group))
  const kpiSummary = visibleKpis.length === kpis.length ? 'All KPIs' : `${visibleKpis.length}/${kpis.length} KPIs`
  const groupSummary = visibleGroups.length === groups.length ? 'All host groups' : `${visibleGroups.length}/${groups.length} host groups`
  const activeSummary = `${kpiSummary} - ${groupSummary}`

  const toggleKpi = (kpi: string) => {
    setHiddenKpis((current) => (
      current.includes(kpi) ? current.filter(item => item !== kpi) : [...current, kpi]
    ))
  }

  const toggleHostGroup = (group: string) => {
    setHiddenHostGroups((current) => (
      current.includes(group) ? current.filter(item => item !== group) : [...current, group]
    ))
  }

  const resetFilters = () => {
    setHiddenKpis([])
    setHiddenHostGroups([])
  }

  const toolbox = (
    <>
      <ToolboxSection title="Metrics">
        <div className="toolbox-check-list">
          {kpis.map((kpi) => (
            <label key={kpi} className="toolbox-check">
              <input type="checkbox" checked={!hiddenKpis.includes(kpi)} onChange={() => toggleKpi(kpi)} />
              <span>{labels[kpi]}</span>
            </label>
          ))}
        </div>
      </ToolboxSection>

      <ToolboxSection title="Host Groups">
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
      <ChartWorkspace toolbox={toolbox} activeSummary={activeSummary} caption="No host KPI rows are available in the derived file.">
        <EmptyState title="No KPI data" message="The derived KPI file is empty." />
      </ChartWorkspace>
    )
  }

  if (!visibleData.length) {
    return (
      <ChartWorkspace toolbox={toolbox} activeSummary={activeSummary} caption="No KPI bars are currently visible. Re-enable at least one KPI and host group.">
        <EmptyState title="No visible KPIs" message="Use the toolbox to turn a metric or host group back on." />
      </ChartWorkspace>
    )
  }

  const { width, height } = wideChart
  const x0 = d3.scaleBand(visibleKpis, [chartMargins.left, width - chartMargins.right]).padding(.24)
  const x1 = d3.scaleBand(visibleGroups, [0, x0.bandwidth()]).padding(.16)
  const y = d3.scaleLinear([0, d3.max(visibleData, d => d.kpi_name.includes('rating') ? d.kpi_value : Math.min(1, d.kpi_value)) ?? 1], [height - chartMargins.bottom, chartMargins.top]).nice()

  return (
    <ChartWorkspace
      toolbox={toolbox}
      activeSummary={activeSummary}
      caption="Comparing host performance KPIs for visible host groups. Tooltip details include metric value and sample size."
    >
      <div className="task-chart-shell">
        <Legend items={visibleGroups} color={hostGroupColor} />
        <div className="task-plot-wrap">
          <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Grouped host KPI bars">
            {y.ticks(5).map(t => (
              <g key={t}>
                <line className="grid-line" x1={chartMargins.left} x2={width - chartMargins.right} y1={y(t)} y2={y(t)} />
                <text className="axis-label" x={chartMargins.left - 10} y={y(t) + 4} textAnchor="end">{formatDecimal(t)}</text>
              </g>
            ))}
            {visibleData.map(d => {
              const h = d.host_performance_group
              const hover = {
                title: `${labels[d.kpi_name] ?? d.kpi_name} - ${h}`,
                rows: [
                  { label: 'KPI', value: labels[d.kpi_name] ?? d.kpi_name },
                  { label: 'Host group', value: h },
                  { label: 'Value', value: formatDecimal(d.kpi_value) },
                  { label: 'Sample size', value: formatNumber(d.sample_size) },
                ],
              }

              return (
                <rect
                  key={`${d.kpi_name}-${h}`}
                  x={(x0(d.kpi_name) ?? 0) + (x1(h) ?? 0)}
                  y={y(d.kpi_value)}
                  width={x1.bandwidth()}
                  height={height - chartMargins.bottom - y(d.kpi_value)}
                  rx="10"
                  fill={hostGroupColor(h)}
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
            {visibleKpis.map(k => (
              <text key={k} className="axis-label" x={(x0(k) ?? 0) + x0.bandwidth() / 2} y={height - 42} textAnchor="middle">{labels[k]}</text>
            ))}
          </svg>
          {hoverCard ? <HoverCard {...hoverCard} /> : null}
        </div>
      </div>
    </ChartWorkspace>
  )
}
