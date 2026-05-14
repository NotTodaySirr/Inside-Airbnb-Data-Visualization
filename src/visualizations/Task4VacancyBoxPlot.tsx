import * as d3 from 'd3'
import { useState } from 'react'
import { ChartWorkspace, ToolboxControl, ToolboxSection } from '../components/ChartLayout'
import { useCsvData } from '../data/useCsvData'
import type { Task4MinNightsVacancyBoxRow, Task4MinNightsVacancyOutlierRow } from '../types/charts'
import { EmptyState, HoverCard, Legend } from './chartHelpers'
import type { HoverCardProps } from './chartHelpers'
import { chartMargins, formatNumber, formatPercent, hostGroupColor, uniqueValues, wideChart } from './chartScales'

type HoverCardState = HoverCardProps

export function Task4VacancyBoxPlot() {
  const boxState = useCsvData<Task4MinNightsVacancyBoxRow>('/data/derived/task4_min_nights_vacancy_box.csv')
  const outState = useCsvData<Task4MinNightsVacancyOutlierRow>('/data/derived/task4_min_nights_vacancy_outliers.csv')
  const [host, setHost] = useState('All')
  const [showOutliers, setShowOutliers] = useState(true)
  const [hoverCard, setHoverCard] = useState<HoverCardState | null>(null)

  if (boxState.status === 'loading' || outState.status === 'loading') return <div className="loading-state">Loading box plot...</div>
  if (boxState.status === 'error') return <EmptyState title="Could not load Task 4" message={boxState.error} />
  if (outState.status === 'error') return <EmptyState title="Could not load outliers" message={outState.error} />

  const hosts = uniqueValues(boxState.data, d => d.host_group)
  const boxes = host === 'All' ? boxState.data : boxState.data.filter(d => d.host_group === host)
  const outliers = showOutliers ? (host === 'All' ? outState.data : outState.data.filter(d => d.host_group === host)).slice(0, 700) : []
  const activeSummary = `${host} host groups - outliers ${showOutliers ? 'on' : 'off'}`

  const resetFilters = () => {
    setHost('All')
    setShowOutliers(true)
  }

  const toolbox = (
    <>
      <ToolboxSection title="Data Filters">
        <ToolboxControl label="Host group">
          <select id="task4-host-group" value={host} onChange={e => setHost(e.target.value)}>
            <option>All</option>
            {hosts.map(h => <option key={h}>{h}</option>)}
          </select>
        </ToolboxControl>
      </ToolboxSection>

      <ToolboxSection title="Display">
        <label className="toolbox-check">
          <input type="checkbox" checked={showOutliers} onChange={(e) => setShowOutliers(e.target.checked)} />
          <span>Show outliers</span>
        </label>
      </ToolboxSection>

      <button className="toolbox-reset" type="button" onClick={resetFilters}>Reset filters</button>
    </>
  )

  if (!boxes.length) {
    return (
      <ChartWorkspace toolbox={toolbox} activeSummary={activeSummary} caption="No box plot rows are available for the selected host group.">
        <EmptyState title="No box plot data" message="Try another host group." />
      </ChartWorkspace>
    )
  }

  const bins = ['1-2 nights', '3-6 nights', '7-29 nights', '30+ nights']
  const visibleHosts = host === 'All' ? hosts : [host]
  const { width, height } = wideChart
  const x0 = d3.scaleBand(bins, [chartMargins.left, width - chartMargins.right]).padding(.24)
  const x1 = d3.scaleBand(visibleHosts, [0, x0.bandwidth()]).padding(.18)
  const y = d3.scaleLinear([0, 1], [height - chartMargins.bottom, chartMargins.top])

  return (
    <ChartWorkspace
      toolbox={toolbox}
      activeSummary={activeSummary}
      caption={`Showing vacancy distribution by minimum-night policy for ${host === 'All' ? 'all host groups' : host}. Outlier markers are ${showOutliers ? 'visible' : 'hidden'}.`}
    >
      <div className="task-chart-shell">
        <Legend items={visibleHosts} color={hostGroupColor} />
        <div className="task-plot-wrap">
          <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Vacancy box plot by minimum nights">
            {y.ticks(5).map(t => (
              <g key={t}>
                <line className="grid-line" x1={chartMargins.left} x2={width - chartMargins.right} y1={y(t)} y2={y(t)} />
                <text className="axis-label" x={chartMargins.left - 10} y={y(t) + 4} textAnchor="end">{formatPercent(t)}</text>
              </g>
            ))}
            {boxes.map(b => {
              const cx = (x0(b.minimum_nights_group) ?? 0) + (x1(b.host_group) ?? x0.bandwidth() / 3) + x1.bandwidth() / 2
              const hover = {
                title: `${b.minimum_nights_group} - ${b.host_group}`,
                rows: [
                  { label: 'Median', value: formatPercent(b.median) },
                  { label: 'Q1 / Q3', value: `${formatPercent(b.q1)} / ${formatPercent(b.q3)}` },
                  { label: 'Whiskers', value: `${formatPercent(b.whisker_low)} - ${formatPercent(b.whisker_high)}` },
                  { label: 'Sample size', value: formatNumber(b.sample_size) },
                ],
              }

              return (
                <g
                  key={`${b.minimum_nights_group}-${b.host_group}`}
                  onMouseEnter={e => {
                    const rect = (e.currentTarget.ownerSVGElement ?? e.currentTarget).getBoundingClientRect()
                    setHoverCard({ x: e.clientX - rect.left + 16, y: e.clientY - rect.top - 18, ...hover })
                  }}
                  onMouseMove={e => {
                    const rect = (e.currentTarget.ownerSVGElement ?? e.currentTarget).getBoundingClientRect()
                    setHoverCard(current => current ? { ...current, x: e.clientX - rect.left + 16, y: e.clientY - rect.top - 18, ...hover } : null)
                  }}
                  onMouseLeave={() => setHoverCard(null)}
                >
                  <line x1={cx} x2={cx} y1={y(b.whisker_low)} y2={y(b.whisker_high)} stroke={hostGroupColor(b.host_group)} strokeWidth="2" />
                  <rect x={cx - x1.bandwidth() / 2} y={y(b.q3)} width={x1.bandwidth()} height={Math.max(1, y(b.q1) - y(b.q3))} fill={hostGroupColor(b.host_group)} opacity=".7" rx="8" />
                  <line x1={cx - x1.bandwidth() / 2} x2={cx + x1.bandwidth() / 2} y1={y(b.median)} y2={y(b.median)} stroke="white" strokeWidth="3" />
                </g>
              )
            })}
            {outliers.map(o => {
              const hover = {
                title: `Outlier listing ${o.listing_id}`,
                rows: [
                  { label: 'Minimum nights', value: o.minimum_nights_group },
                  { label: 'Host group', value: o.host_group },
                  { label: 'Vacancy rate', value: formatPercent(o.vacancy_rate) },
                ],
              }

              return (
                <circle
                  key={`${o.listing_id}-${o.vacancy_rate}`}
                  cx={(x0(o.minimum_nights_group) ?? 0) + x0.bandwidth() / 2 + (Number(o.listing_id.toString().slice(-3)) % 40 - 20)}
                  cy={y(o.vacancy_rate)}
                  r="3"
                  fill={hostGroupColor(o.host_group)}
                  opacity=".42"
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
            {bins.map(b => (
              <text key={b} className="axis-label" x={(x0(b) ?? 0) + x0.bandwidth() / 2} y={height - 42} textAnchor="middle">{b}</text>
            ))}
          </svg>
          {hoverCard ? <HoverCard {...hoverCard} /> : null}
        </div>
      </div>
    </ChartWorkspace>
  )
}
