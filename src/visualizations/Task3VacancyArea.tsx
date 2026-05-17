import * as d3 from 'd3'
import { useMemo, useState } from 'react'
import { ChartWorkspace, ToolboxControl, ToolboxSection } from '../components/ChartLayout'
import { useGlobalFilters } from '../components/GlobalFiltersContext'
import { useCsvData } from '../data/useCsvData'
import type { Task3DailyHostGroupRow } from '../types/charts'
import { EmptyState, HoverCard, Legend } from './chartHelpers'
import type { HoverCardProps } from './chartHelpers'
import { chartMargins, formatPercent, hostGroupColor, uniqueValues } from './chartScales'
import { rowMatchesGlobalFilters } from './globalFilterHelpers'

// ─── layout constants ────────────────────────────────────────────────────────
const W = 980
const CHART_TOP = chartMargins.top
const CHART_BOT = 480
const AXIS_Y = 510
const H = 540
const ML = chartMargins.left
const MR = chartMargins.right

const DATE_PRESETS: { label: string; days: number }[] = [
  { label: 'Next 30 days', days: 30 },
  { label: 'Next 90 days', days: 90 },
  { label: 'Full 365 days', days: 365 },
]

type Metric = 'occupancy' | 'availability' | 'price'

const METRIC_LABELS: Record<Metric, string> = {
  occupancy: 'Estimated Occupancy Rate',
  availability: 'Availability Rate',
  price: 'Median Price (USD)',
}

type HoverCardState = HoverCardProps

function fmt$(v: number | null | undefined): string {
  if (v == null || isNaN(v as number)) return 'N/A'
  return `$${d3.format(',.2f')(v as number)}`
}

function fmtPct(v: number | null | undefined): string {
  if (v == null || isNaN(v as number)) return 'N/A'
  return formatPercent(v as number)
}

// useCsvData applies d3.autoType which converts ISO date strings to Date objects.
// Coerce back to a stable YYYY-MM-DD string for grouping, sorting, and tooltip display.
const dateFmt = d3.timeFormat('%Y-%m-%d')
function toDateStr(v: unknown): string {
  if (v instanceof Date) return dateFmt(v)
  return String(v).slice(0, 10)
}

// ─── component ───────────────────────────────────────────────────────────────
export function Task3VacancyArea() {
  const summaryState = useCsvData<Task3DailyHostGroupRow>(
    '/data/derived/task3_daily_host_group_summary.csv'
  )
  const globalFilters = useGlobalFilters()

  const [room, setRoom] = useState('')
  const [hiddenGroups, setHiddenGroups] = useState<string[]>([])
  const [metric, setMetric] = useState<Metric>('occupancy')
  const [datePreset, setDatePreset] = useState<number>(365)
  const [hoverCard, setHoverCard] = useState<HoverCardState | null>(null)

  // ── derive data — always run before any early return ────────────────────
  const allRows = (summaryState.status === 'loaded' ? summaryState.data : [])
    .filter(row => rowMatchesGlobalFilters(row, globalFilters))
    .map(r => ({
      ...r,
      date: toDateStr(r.date),
    }))

  const rooms = uniqueValues(allRows, d => d.room_type)
  const selectedRoom = room && rooms.includes(room) ? room : rooms[0] || ''
  const roomRows = allRows.filter(d => d.room_type === selectedRoom)

  const allDates = useMemo(
    () => Array.from(new Set(roomRows.map(d => d.date))).sort(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedRoom, allRows]
  )
  const visibleDates = allDates.slice(0, datePreset)
  const groups = uniqueValues(roomRows, d => d.host_group)
  const visibleGroups = groups.filter(g => !hiddenGroups.includes(g))
  const filteredRows = roomRows.filter(
    d => visibleDates.includes(d.date) && visibleGroups.includes(d.host_group)
  )

  // ── loading / error guards (after all hooks) ────────────────────────────
  if (summaryState.status === 'loading')
    return <div className="loading-state">Loading daily pricing monitor…</div>
  if (summaryState.status === 'error')
    return <EmptyState title="Could not load summary" message={summaryState.error} />

  // ── scales ──────────────────────────────────────────────────────────────
  const parsedDates = visibleDates.map(d => new Date(d))
  const xScale = d3.scaleTime(
    [parsedDates[0] ?? new Date(), parsedDates[parsedDates.length - 1] ?? new Date()],
    [ML, W - MR]
  )

  type Row = Task3DailyHostGroupRow

  function metricValue(d: Row): number | null {
    if (metric === 'occupancy') return d.estimated_occupancy_rate
    if (metric === 'availability') return d.availability_rate
    return d.median_price_used
  }

  const definedRows = filteredRows.filter(d => metricValue(d) != null)
  const rawMax = d3.max(definedRows, d => metricValue(d) as number) ?? 1
  const yMax = metric === 'price' ? rawMax * 1.1 : Math.min(1, rawMax * 1.1)
  const yScale = d3.scaleLinear([0, yMax], [CHART_BOT, CHART_TOP]).nice()

  const areaGen = d3
    .area<Row>()
    .defined(d => metricValue(d) != null)
    .x(d => xScale(new Date(d.date)))
    .y0(CHART_BOT)
    .y1(d => yScale(metricValue(d) as number))
    .curve(d3.curveMonotoneX)

  const lineGen = d3
    .line<Row>()
    .defined(d => metricValue(d) != null)
    .x(d => xScale(new Date(d.date)))
    .y(d => yScale(metricValue(d) as number))
    .curve(d3.curveMonotoneX)

  // ── helpers ─────────────────────────────────────────────────────────────
  const toggleGroup = (g: string) =>
    setHiddenGroups(cur => (cur.includes(g) ? cur.filter(x => x !== g) : [...cur, g]))

  const resetFilters = () => {
    setRoom('')
    setHiddenGroups([])
    setMetric('occupancy')
    setDatePreset(365)
  }

  const activeSummary = `${selectedRoom} · ${METRIC_LABELS[metric]} · ${
    visibleGroups.length === groups.length ? 'All host groups' : `${visibleGroups.length}/${groups.length} groups`
  } · ${DATE_PRESETS.find(p => p.days === datePreset)?.label ?? 'Custom'}`

  // ── hover overlay handler ────────────────────────────────────────────────
  function handleOverlayMove(e: React.MouseEvent<SVGRectElement>) {
    const svgEl = e.currentTarget.ownerSVGElement
    if (!svgEl) return
    const rect = svgEl.getBoundingClientRect()
    const svgX = ((e.clientX - rect.left) / rect.width) * W
    const hovDate = xScale.invert(svgX)
    const closest = visibleDates.reduce((best, d) => {
      const diff = Math.abs(new Date(d).getTime() - hovDate.getTime())
      const bestDiff = Math.abs(new Date(best).getTime() - hovDate.getTime())
      return diff < bestDiff ? d : best
    }, visibleDates[0])
    if (!closest) return

    const dayRows = filteredRows.filter(d => d.date === closest)
    const rows: { label: string; value: string }[] = [
      { label: 'Date', value: closest },
      { label: 'Room type', value: selectedRoom },
    ]
    for (const g of visibleGroups) {
      const r = dayRows.find(d => d.host_group === g)
      if (!r) continue
      if (metric === 'occupancy') {
        rows.push({ label: `${g} — Est. occupancy`, value: fmtPct(r.estimated_occupancy_rate) })
        rows.push({ label: `${g} — Available days`, value: `${r.available_days} / ${r.total_listing_days}` })
      } else if (metric === 'availability') {
        rows.push({ label: `${g} — Availability`, value: fmtPct(r.availability_rate) })
        rows.push({ label: `${g} — Available days`, value: `${r.available_days} / ${r.total_listing_days}` })
      } else {
        rows.push({ label: `${g} — Median price`, value: fmt$(r.median_price_used) })
        rows.push({ label: `${g} — Price sample`, value: String(r.price_sample_size) })
        rows.push({ label: `${g} — Est. occupancy`, value: fmtPct(r.estimated_occupancy_rate) })
      }
    }

    setHoverCard({
      title: closest,
      rows,
      x: e.clientX + 16,
      y: e.clientY - 18,
    })
  }

  // ── x-axis ticks ────────────────────────────────────────────────────────
  const xTicks = xScale.ticks(datePreset <= 30 ? 10 : datePreset <= 90 ? 8 : 12)

  // ── y-axis formatter ─────────────────────────────────────────────────────
  const yFmt = (t: number) => metric === 'price' ? fmt$(t) : fmtPct(t)

  // ── toolbox ─────────────────────────────────────────────────────────────
  const toolbox = (
    <>
      <ToolboxSection title="Data Filters">
        <ToolboxControl label="Room type">
          <select
            id="task3-room-type"
            value={selectedRoom}
            onChange={e => setRoom(e.target.value)}
          >
            {rooms.map(r => <option key={r}>{r}</option>)}
          </select>
        </ToolboxControl>
      </ToolboxSection>

      <ToolboxSection title="Chart Metric">
        <div className="toolbox-check-list">
          {(['occupancy', 'availability', 'price'] as Metric[]).map(m => (
            <label key={m} className="toolbox-check">
              <input
                type="radio"
                name="task3-metric"
                checked={metric === m}
                onChange={() => setMetric(m)}
              />
              <span>{METRIC_LABELS[m]}</span>
            </label>
          ))}
        </div>
      </ToolboxSection>

      <ToolboxSection title="Date Range">
        <div className="toolbox-check-list">
          {DATE_PRESETS.map(p => (
            <label key={p.days} className="toolbox-check">
              <input
                type="radio"
                name="task3-date-preset"
                checked={datePreset === p.days}
                onChange={() => setDatePreset(p.days)}
              />
              <span>{p.label}</span>
            </label>
          ))}
        </div>
      </ToolboxSection>

      <ToolboxSection title="Host Groups">
        <div className="toolbox-check-list">
          {groups.map(g => (
            <label key={g} className="toolbox-check">
              <input
                type="checkbox"
                checked={!hiddenGroups.includes(g)}
                onChange={() => toggleGroup(g)}
              />
              <span style={{ color: hostGroupColor(g) }}>{g}</span>
            </label>
          ))}
        </div>
      </ToolboxSection>

      <button className="toolbox-reset" type="button" onClick={resetFilters}>
        Reset filters
      </button>
    </>
  )

  if (!filteredRows.length) {
    return (
      <ChartWorkspace toolbox={toolbox} activeSummary={activeSummary} caption="No data for the current filters.">
        <EmptyState title="No data" message="Adjust room type or host group filters." />
      </ChartWorkspace>
    )
  }

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <ChartWorkspace
      toolbox={toolbox}
      activeSummary={activeSummary}
      caption={`Unavailable days are treated as estimated occupancy — not confirmed bookings. Showing ${visibleDates.length} days for ${selectedRoom}.`}
    >
      <div className="task-chart-shell">
        <Legend items={visibleGroups} color={hostGroupColor} />

        <div className="task-plot-wrap" style={{ position: 'relative' }}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={`Daily ${METRIC_LABELS[metric]} area chart by host group`}
            style={{ overflow: 'visible' }}
          >
            {/* ── y-axis label ── */}
            <text className="axis-label" x={ML} y={CHART_TOP - 8} fontWeight={600} fontSize={11}>
              {METRIC_LABELS[metric]}
            </text>

            {/* ── grid + y-axis ── */}
            {yScale.ticks(6).map(t => (
              <g key={t}>
                <line className="grid-line" x1={ML} x2={W - MR} y1={yScale(t)} y2={yScale(t)} />
                <text className="axis-label" x={ML - 8} y={yScale(t) + 4} textAnchor="end">
                  {yFmt(t)}
                </text>
              </g>
            ))}

            {/* ── area series per host group ── */}
            {visibleGroups.map(g => {
              const series = filteredRows
                .filter(d => d.host_group === g)
                .sort((a, b) => String(a.date).localeCompare(String(b.date)))
              const color = hostGroupColor(g)
              return (
                <g key={g}>
                  <path d={areaGen(series) ?? ''} fill={color} opacity={0.18} />
                  <path d={lineGen(series) ?? ''} fill="none" stroke={color} strokeWidth={2.5} />
                </g>
              )
            })}

            {/* ── x-axis ── */}
            <line className="grid-line" x1={ML} x2={W - MR} y1={AXIS_Y} y2={AXIS_Y} />
            {xTicks.map(t => (
              <text
                key={t.toISOString()}
                className="axis-label"
                x={xScale(t)}
                y={AXIS_Y + 16}
                textAnchor="middle"
              >
                {d3.timeFormat(datePreset <= 30 ? '%b %d' : '%b %Y')(t)}
              </text>
            ))}

            {/* ── transparent overlay for hover ── */}
            <rect
              x={ML} y={CHART_TOP}
              width={W - ML - MR}
              height={CHART_BOT - CHART_TOP}
              fill="transparent"
              style={{ cursor: 'crosshair' }}
              onMouseMove={handleOverlayMove}
              onMouseLeave={() => setHoverCard(null)}
            />
          </svg>

          {hoverCard && <HoverCard x={hoverCard.x} y={hoverCard.y} title={hoverCard.title} rows={hoverCard.rows} />}
        </div>
      </div>
    </ChartWorkspace>
  )
}
