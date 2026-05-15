import * as d3 from 'd3'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChartWorkspace, ToolboxControl, ToolboxSection } from '../components/ChartLayout'
import { useCsvData } from '../data/useCsvData'
import type { Task3DailyHostGroupRow } from '../types/charts'
import { EmptyState } from './chartHelpers'
import { formatPercent, uniqueValues } from './chartScales'

// ─── constants ────────────────────────────────────────────────────────────────
const DATE_PRESETS = [
  { label: 'Next 30 days', days: 30 },
  { label: 'Next 90 days', days: 90 },
  { label: 'Full 365 days', days: 365 },
] as const

const HOST_GROUPS = ['Individual host', 'Commercial host'] as const
type HostGroup = (typeof HOST_GROUPS)[number]

const GROUP_COLORS: Record<HostGroup, { accent: string }> = {
  'Individual host': { accent: '#14b8a6' },   // teal
  'Commercial host': { accent: '#f59e0b' },   // amber
}

// Cell gap is fixed screen pixels
const CELL_GAP = 2
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// ─── helpers ──────────────────────────────────────────────────────────────────
const dateFmt = d3.timeFormat('%Y-%m-%d')
const labelFmt = d3.timeFormat('%b %d, %Y')
const monthFmt = d3.timeFormat('%b %Y')

function toDateStr(v: unknown): string {
  if (v instanceof Date) return dateFmt(v)
  return String(v).slice(0, 10)
}

function fmtPrice(v: number | null | undefined): string {
  if (v == null || isNaN(v as number)) return 'N/A'
  if ((v as number) >= 1_000_000) return `$${d3.format('.2s')(v as number)}`
  if ((v as number) >= 1_000) return `$${d3.format('.1s')(v as number)}`
  return `$${Math.round(v as number)}`
}

function fmtPct(v: number | null | undefined): string {
  if (v == null || isNaN(v as number)) return 'N/A'
  return formatPercent(v as number)
}

// ISO weekday: Mon=0 … Sun=6
function isoWeekday(d: Date): number {
  return (d.getDay() + 6) % 7
}

// Monday-based week index relative to a reference Monday
function weekIndex(d: Date, firstMonday: Date): number {
  return Math.floor((d.getTime() - firstMonday.getTime()) / (7 * 86_400_000))
}

// Monday on or before a given date
function prevMonday(d: Date): Date {
  const copy = new Date(d)
  copy.setDate(copy.getDate() - isoWeekday(copy))
  return copy
}

// Availability → color: dark background → group accent
function availColor(rate: number, accent: string): string {
  return d3.interpolateRgb('#1a1f2e', accent)(Math.max(0, Math.min(1, rate)))
}

// ─── Tooltip (two-column comparison) ─────────────────────────────────────────
type TooltipState = {
  x: number
  y: number
  date: string
  roomType: string
  individual?: Task3DailyHostGroupRow
  commercial?: Task3DailyHostGroupRow
}

function CellTooltip({ tip }: { tip: TooltipState }) {
  const I = tip.individual
  const C = tip.commercial

  const rows: { label: string; iVal: string; cVal: string }[] = [
    {
      label: 'Availability rate',
      iVal: fmtPct(I?.availability_rate),
      cVal: fmtPct(C?.availability_rate),
    },
    {
      label: 'Est. occupancy',
      iVal: fmtPct(I?.estimated_occupancy_rate),
      cVal: fmtPct(C?.estimated_occupancy_rate),
    },
    {
      label: 'Median price',
      iVal: fmtPrice(I?.median_price_used),
      cVal: fmtPrice(C?.median_price_used),
    },
    {
      label: 'Available / total',
      iVal: I ? `${I.available_days} / ${I.total_listing_days}` : 'N/A',
      cVal: C ? `${C.available_days} / ${C.total_listing_days}` : 'N/A',
    },
    {
      label: 'Price sample',
      iVal: I ? String(I.price_sample_size) : 'N/A',
      cVal: C ? String(C.price_sample_size) : 'N/A',
    },
  ]

  return createPortal(
    <div
      className="hover-card task3-split-tooltip"
      style={{
        position: 'fixed',
        left: tip.x + 14,
        top: tip.y - 10,
        zIndex: 9999,
        minWidth: 340,
        maxWidth: 400,
      }}
    >
      <strong style={{ gridColumn: '1 / -1' }}>{labelFmt(new Date(tip.date))}</strong>
      <span style={{ gridColumn: '1 / -1', color: '#94a3b8', fontSize: '0.75rem' }}>
        {tip.roomType}
      </span>

      {/* column headers */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: '4px 8px',
        marginTop: 6,
        fontSize: '0.72rem',
        fontWeight: 900,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
      }}>
        <span style={{ color: '#94a3b8' }}></span>
        <span style={{ color: GROUP_COLORS['Individual host'].accent }}>Individual</span>
        <span style={{ color: GROUP_COLORS['Commercial host'].accent }}>Commercial</span>
      </div>

      {/* data rows */}
      {rows.map(({ label, iVal, cVal }) => (
        <div key={label} style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '2px 8px',
          fontSize: '0.82rem',
          alignItems: 'center',
        }}>
          <b style={{ color: '#94a3b8', fontWeight: 600, fontSize: '0.76rem' }}>{label}</b>
          <span style={{ color: '#e2e8f0', fontVariantNumeric: 'tabular-nums' }}>{iVal}</span>
          <span style={{ color: '#e2e8f0', fontVariantNumeric: 'tabular-nums' }}>{cVal}</span>
        </div>
      ))}
    </div>,
    document.body
  )
}

// ─── Legend ───────────────────────────────────────────────────────────────────
function HeatmapLegend() {
  const steps = 5
  const W = 90, H = 10
  const teal = GROUP_COLORS['Individual host'].accent
  const amber = GROUP_COLORS['Commercial host'].accent

  // Inline width/height overrides prevent the global svg{width:100%} rule
  // from stretching these small decorative SVGs to full container width.
  const svgStyle = (w: number, h: number): React.CSSProperties => ({
    width: w, height: h, flexShrink: 0, display: 'inline-block',
  })

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: '8px 20px',
      fontSize: 11, color: '#94a3b8', alignItems: 'center',
    }}>
      {/* Sample split cell + label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <svg width={14} height={14} style={{ ...svgStyle(14, 14), overflow: 'visible', borderRadius: 0, background: 'none' }}>
          <rect x={0} y={0} width={14} height={6} fill={availColor(0.75, teal)} rx={1.5} />
          <rect x={0} y={7} width={14} height={6} fill={availColor(0.75, amber)} rx={1.5} />
        </svg>
        <span style={{ whiteSpace: 'nowrap' }}>Top = Individual · Bottom = Commercial</span>
      </div>

      {/* Teal gradient */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <svg width={W} height={H} style={{ ...svgStyle(W, H), borderRadius: 2, overflow: 'hidden', background: 'none' }}>
          <defs>
            <linearGradient id="avail-grad-teal">
              {Array.from({ length: steps + 1 }, (_, i) => (
                <stop key={i} offset={`${(i / steps) * 100}%`} stopColor={availColor(i / steps, teal)} />
              ))}
            </linearGradient>
          </defs>
          <rect width={W} height={H} fill="url(#avail-grad-teal)" />
        </svg>
        <span style={{ color: teal, whiteSpace: 'nowrap' }}>Individual avail. (low→high)</span>
      </div>

      {/* Amber gradient */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <svg width={W} height={H} style={{ ...svgStyle(W, H), borderRadius: 2, overflow: 'hidden', background: 'none' }}>
          <defs>
            <linearGradient id="avail-grad-amber">
              {Array.from({ length: steps + 1 }, (_, i) => (
                <stop key={i} offset={`${(i / steps) * 100}%`} stopColor={availColor(i / steps, amber)} />
              ))}
            </linearGradient>
          </defs>
          <rect width={W} height={H} fill="url(#avail-grad-amber)" />
        </svg>
        <span style={{ color: amber, whiteSpace: 'nowrap' }}>Commercial avail. (low→high)</span>
      </div>

      {/* Gold outline */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{
          display: 'inline-block', width: 14, height: 14, background: '#1e2535',
          border: '1.5px solid #fbbf24', borderRadius: 2, flexShrink: 0,
        }} />
        <span style={{ whiteSpace: 'nowrap' }}>High avail. &amp; high price</span>
      </div>
    </div>
  )
}

// ─── SplitCellCalendar ────────────────────────────────────────────────────────
type SplitCellCalendarProps = {
  individualRows: Task3DailyHostGroupRow[]
  commercialRows: Task3DailyHostGroupRow[]
  dates: string[]
  priceThreshold: number
  availThreshold: number
  onHover: (tip: TooltipState | null) => void
  roomType: string
}

function SplitCellCalendar({
  individualRows, commercialRows, dates,
  priceThreshold, availThreshold, onHover, roomType,
}: SplitCellCalendarProps) {
  const teal = GROUP_COLORS['Individual host'].accent
  const amber = GROUP_COLORS['Commercial host'].accent

  // measure container width to scale cells responsively
  const wrapRef = useRef<HTMLDivElement>(null)
  const [containerW, setContainerW] = useState(0)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      setContainerW(entries[0].contentRect.width)
    })
    ro.observe(el)
    setContainerW(el.getBoundingClientRect().width)
    return () => ro.disconnect()
  }, [])

  const indMap = useMemo(() => {
    const m = new Map<string, Task3DailyHostGroupRow>()
    individualRows.forEach(r => m.set(toDateStr(r.date), r))
    return m
  }, [individualRows])

  const comMap = useMemo(() => {
    const m = new Map<string, Task3DailyHostGroupRow>()
    commercialRows.forEach(r => m.set(toDateStr(r.date), r))
    return m
  }, [commercialRows])

  if (!dates.length) return null

  const firstDate = new Date(dates[0])
  const firstMonday = prevMonday(firstDate)
  const totalWeeks = weekIndex(new Date(dates[dates.length - 1]), firstMonday) + 1

  // ── derive cellPx from container width so the calendar fills the shell ──
  // LABEL_W depends on cellPx, so we solve iteratively with a starting estimate.
  // Formula: containerW = LABEL_W(cellPx) + totalWeeks * (cellPx + CELL_GAP) - CELL_GAP
  // LABEL_W = max(28, cellPx * 2.8)
  // We clamp cellPx between 11 (365-day dense) and 28 (30-day spacious).
  let cellPx = 13
  if (containerW > 0) {
    // solve: containerW = max(28, c*2.8) + totalWeeks*(c+CELL_GAP) - CELL_GAP
    // approximate: containerW ≈ c*2.8 + totalWeeks*(c+2) - 2  (when c*2.8 > 28)
    const approx = (containerW + CELL_GAP + 28) / (2.8 + totalWeeks + CELL_GAP)
    cellPx = Math.max(11, Math.min(28, Math.floor(approx)))
  }

  // ── layout ──
  const FS_WEEKDAY = Math.max(9, Math.min(11, cellPx * 0.55))
  const FS_MONTH   = Math.max(9, Math.min(11, cellPx * 0.60))
  const LABEL_W    = Math.max(28, cellPx * 2.8)
  const BAND_PAD   = 6
  const HEADER_H   = FS_MONTH + 6
  const GRID_TOP   = BAND_PAD + HEADER_H
  const GRID_H     = 7 * (cellPx + CELL_GAP) - CELL_GAP
  const SVG_H      = GRID_TOP + GRID_H + BAND_PAD + 4
  const TOTAL_W    = LABEL_W + totalWeeks * (cellPx + CELL_GAP) - CELL_GAP

  // month label x positions
  const monthLabels: { x: number; label: string }[] = []
  let lastMonth = -1
  dates.forEach(ds => {
    const d = new Date(ds)
    const wi = weekIndex(d, firstMonday)
    const mon = d.getMonth()
    if (mon !== lastMonth) {
      monthLabels.push({ x: LABEL_W + wi * (cellPx + CELL_GAP), label: monthFmt(d) })
      lastMonth = mon
    }
  })

  // half-cell heights with 1px gap between halves
  const halfH = (cellPx - 1) / 2
  const rx = Math.max(1, cellPx * 0.12)

  return (
    <div ref={wrapRef} style={{ width: '100%', overflowX: 'auto', overflowY: 'visible' }}>
      <svg
        width={TOTAL_W}
        height={SVG_H}
        style={{ display: 'block', overflow: 'visible' }}
        aria-label="Split-cell calendar heatmap: Individual host (top, teal) vs Commercial host (bottom, amber)"
      >
        {/* weekday labels */}
        {WEEKDAY_LABELS.map((wd, i) => (
          <text
            key={wd}
            x={LABEL_W - 4}
            y={GRID_TOP + i * (cellPx + CELL_GAP) + cellPx * 0.65}
            textAnchor="end"
            fontSize={FS_WEEKDAY}
            fill="#64748b"
          >
            {cellPx >= 16 ? wd : wd[0]}
          </text>
        ))}

        {/* month labels */}
        {monthLabels.map(({ x, label }) => (
          <text
            key={label + x}
            x={x}
            y={BAND_PAD + FS_MONTH}
            fontSize={FS_MONTH}
            fill="#94a3b8"
            fontWeight={600}
          >
            {label}
          </text>
        ))}

        {/* cells */}
        {dates.map(ds => {
          const d = new Date(ds)
          const wi = weekIndex(d, firstMonday)
          const dow = isoWeekday(d)
          const cx = LABEL_W + wi * (cellPx + CELL_GAP)
          const cy = GRID_TOP + dow * (cellPx + CELL_GAP)

          const rI = indMap.get(ds)
          const rC = comMap.get(ds)

          const availI = rI?.availability_rate ?? 0
          const availC = rC?.availability_rate ?? 0
          const priceI = rI?.median_price_used ?? null
          const priceC = rC?.median_price_used ?? null

          const fillI = rI ? availColor(availI, teal)  : '#1e2535'
          const fillC = rC ? availColor(availC, amber) : '#1e2535'

          const isHighlight =
            (rI != null && availI >= availThreshold && priceI != null && priceI >= priceThreshold) ||
            (rC != null && availC >= availThreshold && priceC != null && priceC >= priceThreshold)

          const hasData = rI != null || rC != null

          return (
            <g key={ds}>
              {/* top half — Individual host */}
              <rect
                x={cx} y={cy}
                width={cellPx} height={halfH}
                rx={rx} ry={rx}
                fill={fillI}
              />
              {/* bottom half — Commercial host */}
              <rect
                x={cx} y={cy + halfH + 1}
                width={cellPx} height={halfH}
                rx={rx} ry={rx}
                fill={fillC}
              />
              {/* gold outline for high-priority cells */}
              {isHighlight && (
                <rect
                  x={cx} y={cy}
                  width={cellPx} height={cellPx}
                  rx={rx} ry={rx}
                  fill="none"
                  stroke="#fbbf24"
                  strokeWidth={1.5}
                  style={{ pointerEvents: 'none' }}
                />
              )}
              {/* invisible full-cell hover hit target */}
              <rect
                x={cx} y={cy}
                width={cellPx} height={cellPx}
                fill="transparent"
                style={{ cursor: hasData ? 'pointer' : 'default' }}
                onMouseEnter={e => {
                  if (!hasData) return
                  onHover({ x: e.clientX, y: e.clientY, date: ds, roomType, individual: rI, commercial: rC })
                }}
                onMouseMove={e => {
                  if (!hasData) return
                  onHover({ x: e.clientX, y: e.clientY, date: ds, roomType, individual: rI, commercial: rC })
                }}
                onMouseLeave={() => onHover(null)}
              />
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export function Task3CalendarHeatmap() {
  const summaryState = useCsvData<Task3DailyHostGroupRow>(
    '/data/derived/task3_daily_host_group_summary.csv'
  )

  const [room, setRoom] = useState('')
  const [datePreset, setDatePreset] = useState<number>(365)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  // normalise date field
  const allRows = useMemo(() => {
    if (summaryState.status !== 'loaded') return []
    return summaryState.data.map(r => ({ ...r, date: toDateStr(r.date) }))
  }, [summaryState])

  const rooms = uniqueValues(allRows, d => d.room_type)
  const selectedRoom = room || rooms[0] || ''
  const roomRows = allRows.filter(d => d.room_type === selectedRoom)
  const allDates = Array.from(new Set(roomRows.map(d => d.date))).sort()
  const visibleDates = allDates.slice(0, datePreset)

  const individualRows = roomRows.filter(r => r.host_group === 'Individual host')
  const commercialRows = roomRows.filter(r => r.host_group === 'Commercial host')

  // 75th-pct thresholds for outline highlight
  const visibleSet = new Set(visibleDates)
  const visibleRows = roomRows.filter(r => visibleSet.has(r.date))
  const _prices = visibleRows.map(r => r.median_price_used).filter((v): v is number => v != null).sort(d3.ascending)
  const _avails = visibleRows.map(r => r.availability_rate).sort(d3.ascending)
  const priceThreshold = d3.quantile(_prices, 0.75) ?? Infinity
  const availThreshold = d3.quantile(_avails, 0.75) ?? Infinity

  // cellPx is now computed inside SplitCellCalendar from container width

  // guards — after all hooks
  if (summaryState.status === 'loading')
    return <div className="loading-state">Loading calendar heatmap…</div>
  if (summaryState.status === 'error')
    return <EmptyState title="Could not load data" message={summaryState.error} />

  const resetFilters = () => {
    setRoom('')
    setDatePreset(365)
  }

  const activeSummary = `${selectedRoom} · ${DATE_PRESETS.find(p => p.days === datePreset)?.label ?? 'Custom'} · Both host groups`

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

      <button className="toolbox-reset" type="button" onClick={resetFilters}>
        Reset filters
      </button>
    </>
  )

  if (!visibleDates.length) {
    return (
      <ChartWorkspace toolbox={toolbox} activeSummary={activeSummary} caption="No data for the current filters.">
        <EmptyState title="No data" message="Adjust room type or date range filters." />
      </ChartWorkspace>
    )
  }

  return (
    <ChartWorkspace
      toolbox={toolbox}
      activeSummary={activeSummary}
      caption={`Top half (teal) = Individual host availability · Bottom half (amber) = Commercial host availability · Gold outline = high availability & high price day. Showing ${visibleDates.length} days for ${selectedRoom}.`}
    >
      <div className="task-chart-shell">
        <div className="task3-heatmap-legend" style={{ marginBottom: 16 }}>
          <HeatmapLegend />
        </div>

        <div className="task3-calendar-shell">
          <SplitCellCalendar
            individualRows={individualRows}
            commercialRows={commercialRows}
            dates={visibleDates}
            priceThreshold={priceThreshold}
            availThreshold={availThreshold}
            onHover={setTooltip}
            roomType={selectedRoom}
          />
        </div>
      </div>

      {tooltip && <CellTooltip tip={tooltip} />}
    </ChartWorkspace>
  )
}
