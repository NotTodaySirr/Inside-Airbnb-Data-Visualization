import * as d3 from 'd3'
import { useCallback, useMemo, useRef, useState } from 'react'
import { ChartWorkspace, ToolboxControl, ToolboxSection } from '../components/ChartLayout'
import { useGlobalFilters } from '../components/GlobalFiltersContext'
import { useCsvData } from '../data/useCsvData'
import type { Task2BarSummaryRow, Task2ListingDetailRow } from '../types/charts'
import { EmptyState, HoverCard, Legend } from './chartHelpers'
import { chartMargins, formatNumber, roomTypeColor, uniqueValues, wideChart } from './chartScales'
import { rowMatchesGlobalFilters } from './globalFilterHelpers'

const MONTH_NUMS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
const MONTH_LABELS: Record<number, string> = {
  1: 'Jan', 2: 'Feb', 3: 'Mar', 4: 'Apr', 5: 'May', 6: 'Jun',
  7: 'Jul', 8: 'Aug', 9: 'Sep', 10: 'Oct', 11: 'Nov', 12: 'Dec',
}

// Years with incomplete data (current year or known partial years)
const INCOMPLETE_YEARS = new Set([2025])

type HoverCardState = {
  x: number
  y: number
  title: string
  rows: { label: string; value: string }[]
}

type DetailLoadState = 'idle' | 'loading' | 'loaded' | 'error'

function formatPrice(v: number | null): string {
  if (v == null || isNaN(v)) return 'N/A'
  return `$${v.toFixed(0)}`
}

function formatRating(v: number | null): string {
  if (v == null || isNaN(v)) return 'N/A'
  return v.toFixed(2)
}

export function Task2StackedReviews() {
  const barState = useCsvData<Task2BarSummaryRow>('/data/derived/task2_bar_summary.csv')
  const globalFilters = useGlobalFilters()

  const [hiddenRoomTypes, setHiddenRoomTypes] = useState<string[]>([])
  const [selectedYear, setSelectedYear] = useState<string>('2024')
  const [selectedMonthOverride, setSelectedMonth] = useState<number | null>(null)
  const [hoverCard, setHoverCard] = useState<HoverCardState | null>(null)

  // Lazy-load detail file
  const [detailStatus, setDetailStatus] = useState<DetailLoadState>('idle')
  const [detailData, setDetailData] = useState<Task2ListingDetailRow[]>([])
  const detailRef = useRef<Task2ListingDetailRow[]>([])

  const loadDetail = useCallback(() => {
    if (detailStatus !== 'idle') return
    setDetailStatus('loading')
    d3.csv('/data/derived/task2_listing_detail.csv', d3.autoType)
      .then((rows) => {
        const typed = rows as unknown as Task2ListingDetailRow[]
        detailRef.current = typed
        setDetailData(typed)
        setDetailStatus('loaded')
      })
      .catch(() => setDetailStatus('error'))
  }, [detailStatus])

  const allRows = useMemo(() => (
    barState.status === 'loaded'
      ? barState.data.filter(row => rowMatchesGlobalFilters(row, globalFilters))
      : []
  ), [barState, globalFilters])

  if (barState.status === 'loading') return <div className="loading-state">Loading monthly reviews...</div>
  if (barState.status === 'error') return <EmptyState title="Could not load Task 2" message={barState.error} />

  const rooms = uniqueValues(allRows, d => d.room_type)
  const visibleRooms = rooms.filter(r => !hiddenRoomTypes.includes(r))

  // Available years from data
  const years = [...new Set(allRows.map(r => r.review_year))].sort((a, b) => b - a)

  // Filter by selected year
  const yearRows = selectedYear === 'all'
    ? allRows
    : allRows.filter(r => String(r.review_year) === selectedYear)
  const peakMonth = [...d3.rollup(yearRows, v => d3.sum(v, d => d.review_count), d => d.month_num).entries()]
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? 7
  const selectedMonth = selectedMonthOverride ?? peakMonth

  // Aggregate to month_num x room_type for stacked bar
  const byMonthRoom = new Map<string, number>()
  for (const row of yearRows) {
    if (!visibleRooms.includes(row.room_type)) continue
    const key = `${row.month_num}__${row.room_type}`
    byMonthRoom.set(key, (byMonthRoom.get(key) ?? 0) + row.review_count)
  }

  const stackData = MONTH_NUMS.map(mn => {
    const entry: Record<string, number | string> = { month_num: mn, month_label: MONTH_LABELS[mn] }
    for (const room of visibleRooms) {
      entry[room] = byMonthRoom.get(`${mn}__${room}`) ?? 0
    }
    return entry
  })

  roomTypeColor.domain(rooms)
  const stack = d3.stack<Record<string, number | string>>().keys(visibleRooms)(stackData)
  const { width, height } = wideChart
  const x = d3.scaleBand(MONTH_NUMS.map(String), [chartMargins.left, width - chartMargins.right]).padding(0.18)
  const y = d3.scaleLinear(
    [0, d3.max(stack, s => d3.max(s, d => d[1])) ?? 1],
    [height - chartMargins.bottom, chartMargins.top]
  ).nice()

  // Peak panel data
  const panelRows = detailStatus === 'loaded'
    ? detailData.filter(r =>
        r.month_num === selectedMonth &&
        (selectedYear === 'all' || String(r.review_year) === selectedYear) &&
        rowMatchesGlobalFilters(r, globalFilters)
      )
    : []

  const totalReviews = selectedMonth
    ? d3.sum(yearRows.filter(r => r.month_num === selectedMonth), r => r.review_count)
    : 0

  // Top room type for selected month
  const roomTotals = selectedMonth
    ? d3.rollup(
        yearRows.filter(r => r.month_num === selectedMonth && visibleRooms.includes(r.room_type)),
        v => d3.sum(v, d => d.review_count),
        d => d.room_type
      )
    : new Map<string, number>()
  const topRoomType = [...roomTotals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'

  // Top neighbourhood from detail
  const neighTotals = d3.rollup(panelRows, v => d3.sum(v, d => d.review_count), d => d.neighbourhood_cleansed)
  const topNeigh = [...neighTotals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'

  // Top 5 listings
  const top5 = [...panelRows]
    .sort((a, b) => b.review_count - a.review_count ||
      (b.review_scores_rating ?? 0) - (a.review_scores_rating ?? 0) ||
      b.number_of_reviews_ltm - a.number_of_reviews_ltm
    )
    .slice(0, 5)

  const yearLabel = selectedYear === 'all' ? 'All years' : selectedYear
  const monthLabel = selectedMonth ? MONTH_LABELS[selectedMonth] : '—'
  const roomSummary = visibleRooms.length === rooms.length ? 'All room types' : `${visibleRooms.length}/${rooms.length} room types`
  const activeSummary = `${roomSummary} · ${yearLabel}`

  const toggleRoom = (room: string) => {
    setHiddenRoomTypes(cur => cur.includes(room) ? cur.filter(r => r !== room) : [...cur, room])
  }

  const resetFilters = () => {
    setHiddenRoomTypes([])
    setSelectedYear('2024')
    setSelectedMonth(null)
  }

  const toolbox = (
    <>
      <ToolboxSection title="Data Filters">
        <div className="toolbox-check-list">
          {rooms.map(room => (
            <label key={room} className="toolbox-check">
              <input type="checkbox" checked={!hiddenRoomTypes.includes(room)} onChange={() => toggleRoom(room)} />
              <span>{room}</span>
            </label>
          ))}
        </div>
      </ToolboxSection>

      <ToolboxSection title="Display">
        <ToolboxControl label="Year">
          <select
            id="task2-year-filter"
            value={selectedYear}
            onChange={e => {
              setSelectedYear(e.target.value)
              setSelectedMonth(null)
            }}
          >
            <option value="all">All years</option>
            {years.map(y => (
              <option key={y} value={String(y)}>
                {y}{INCOMPLETE_YEARS.has(y) ? ' ⚠' : ''}
              </option>
            ))}
          </select>
        </ToolboxControl>
        {INCOMPLETE_YEARS.has(Number(selectedYear)) && (
          <p className="toolbox-hint">⚠ {selectedYear} data is incomplete — some months may show zero.</p>
        )}
        {selectedYear === 'all' && (
          <p className="toolbox-hint">All years aggregates every Jan, Feb… across all years. Consider selecting a single year for cleaner seasonality.</p>
        )}
      </ToolboxSection>

      <button className="toolbox-reset" type="button" onClick={resetFilters}>Reset filters</button>
    </>
  )

  if (!visibleRooms.length) {
    return (
      <ChartWorkspace toolbox={toolbox} activeSummary={activeSummary} caption="No room types visible. Re-enable at least one.">
        <EmptyState title="No visible room types" message="Use the toolbox to turn a room type back on." />
      </ChartWorkspace>
    )
  }

  return (
    <ChartWorkspace
      toolbox={toolbox}
      activeSummary={activeSummary}
      caption={`Seasonal review volume by room type for ${yearLabel}. Click a month bar to see top listings and neighbourhoods.`}
    >
      <div className="task-chart-shell">
        <Legend items={visibleRooms} color={roomTypeColor} />

        <div className="task-plot-wrap">
          <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Stacked monthly reviews by room type">
            {/* Grid lines */}
            {y.ticks(5).map(t => (
              <g key={t}>
                <line x1={chartMargins.left} x2={width - chartMargins.right} y1={y(t)} y2={y(t)} className="grid-line" />
                <text x={chartMargins.left - 10} y={y(t) + 4} textAnchor="end" className="axis-label">{formatNumber(t)}</text>
              </g>
            ))}

            {/* Stacked bars */}
            {stack.map(series => (
              <g key={series.key} fill={roomTypeColor(series.key)}>
                {series.map((d, i) => {
                  const mn = MONTH_NUMS[i]
                  const reviewCount = Number(d[1] - d[0])
                  const isSelected = mn === selectedMonth
                  const hover = {
                    title: `${MONTH_LABELS[mn]} ${yearLabel} — ${series.key}`,
                    rows: [
                      { label: 'Month', value: `${MONTH_LABELS[mn]} ${yearLabel}` },
                      { label: 'Room type', value: String(series.key) },
                      { label: 'Review count', value: formatNumber(reviewCount) },
                    ],
                  }
                  return (
                    <rect
                      key={`${series.key}-${mn}`}
                      x={x(String(mn))}
                      y={y(d[1])}
                      width={x.bandwidth()}
                      height={Math.max(0, y(d[0]) - y(d[1]))}
                      rx={3}
                      opacity={isSelected ? 1 : 0.75}
                      stroke={isSelected ? 'var(--color-accent, #fff)' : 'none'}
                      strokeWidth={isSelected ? 1.5 : 0}
                      style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
                      onClick={() => {
                        setSelectedMonth(mn)
                        loadDetail()
                      }}
                      onMouseEnter={e => {
                        setHoverCard({ x: e.clientX + 16, y: e.clientY - 18, ...hover })
                      }}
                      onMouseMove={e => {
                        setHoverCard(cur => cur ? { ...cur, x: e.clientX + 16, y: e.clientY - 18, ...hover } : null)
                      }}
                      onMouseLeave={() => setHoverCard(null)}
                    />
                  )
                })}
              </g>
            ))}

            {/* X-axis month labels */}
            {MONTH_NUMS.map(mn => (
              <text
                key={mn}
                x={(x(String(mn)) ?? 0) + x.bandwidth() / 2}
                y={height - 20}
                textAnchor="middle"
                className="axis-label"
              >
                {MONTH_LABELS[mn]}
              </text>
            ))}
          </svg>
          {hoverCard ? <HoverCard {...hoverCard} /> : null}
        </div>

        {/* Peak month drilldown panel */}
        {selectedMonth && (
          <div className="t2-peak-panel">
            <div className="t2-peak-header">
              <h3 className="t2-peak-title">
                {monthLabel} {yearLabel} — Peak Analysis
              </h3>
              <div className="t2-peak-stats">
                <div className="t2-stat">
                  <span className="t2-stat__label">Total reviews</span>
                  <strong className="t2-stat__value">{formatNumber(totalReviews)}</strong>
                </div>
                <div className="t2-stat">
                  <span className="t2-stat__label">Top room type</span>
                  <strong className="t2-stat__value">{topRoomType}</strong>
                </div>
                <div className="t2-stat">
                  <span className="t2-stat__label">Top neighbourhood</span>
                  <strong className="t2-stat__value">
                    {detailStatus === 'idle' ? '— click bar to load' : detailStatus === 'loading' ? 'Loading…' : topNeigh}
                  </strong>
                </div>
              </div>
            </div>

            {/* Listing recommendation table */}
            <div className="t2-rec-section">
              <h4 className="t2-rec-title">Top listings to promote in {monthLabel}</h4>
              {detailStatus === 'idle' && (
                <p className="t2-rec-hint">Click any bar to load listing recommendations.</p>
              )}
              {detailStatus === 'loading' && (
                <p className="t2-rec-hint">Loading listing data…</p>
              )}
              {detailStatus === 'error' && (
                <p className="t2-rec-hint t2-rec-hint--error">Could not load listing detail file.</p>
              )}
              {detailStatus === 'loaded' && top5.length === 0 && (
                <p className="t2-rec-hint">No listing data for this month/year combination.</p>
              )}
              {detailStatus === 'loaded' && top5.length > 0 && (
                <table className="t2-rec-table">
                  <thead>
                    <tr>
                      <th>Listing name</th>
                      <th>Neighbourhood</th>
                      <th>Room type</th>
                      <th>Reviews (month)</th>
                      <th>Rating</th>
                      <th>Price / night</th>
                      <th>Reviews (LTM)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {top5.map((row) => (
                      <tr key={row.listing_id}>
                        <td className="t2-rec-name" title={row.listing_id}>
                          {row.name || `Listing ${row.listing_id}`}
                        </td>
                        <td>{row.neighbourhood_cleansed ?? 'N/A'}</td>
                        <td>{row.room_type}</td>
                        <td className="t2-rec-num">{formatNumber(row.review_count)}</td>
                        <td className="t2-rec-num">{formatRating(row.review_scores_rating)}</td>
                        <td className="t2-rec-num">{formatPrice(row.price)}</td>
                        <td className="t2-rec-num">{formatNumber(row.number_of_reviews_ltm)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </ChartWorkspace>
  )
}
