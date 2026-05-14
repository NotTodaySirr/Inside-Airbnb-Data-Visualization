import { useMemo } from 'react'
import { useGlobalFilters, useGlobalFiltersActions } from './GlobalFiltersContext'
import { ToolboxControl, ToolboxSection } from './ChartLayout'

const BOROUGHS = ['All', 'Bronx', 'Brooklyn', 'Manhattan', 'Queens', 'Staten Island']
const ROOM_TYPES = ['All', 'Entire home/apt', 'Private room', 'Shared room', 'Hotel room']

type Props = {
  /**
   * When non-null the rail shows a chart-specific zone with this label
   * (e.g. "Task 5"). When null (Dashboard overview), the chart zone is hidden.
   */
  activeChartLabel: string | null
  /** Refs to mount portal targets for the active chart's toolbox + summary. */
  setSummaryTarget: (el: HTMLDivElement | null) => void
  setToolboxTarget: (el: HTMLDivElement | null) => void
}

export function FilterRail({ activeChartLabel, setSummaryTarget, setToolboxTarget }: Props) {
  const filters = useGlobalFilters()
  const { setFilter, resetGlobal } = useGlobalFiltersActions()

  const globalSummary = useMemo(() => {
    const parts: string[] = []
    parts.push(filters.borough === 'All' ? 'All boroughs' : filters.borough)
    parts.push(filters.roomType === 'All' ? 'All room types' : filters.roomType)
    return parts.join(' · ')
  }, [filters])

  return (
    <aside className="dashboard-rail" aria-label="Dashboard filters">
      {/* ── Global zone ─────────────────────────────────────────────────── */}
      <section className="rail-zone rail-zone--global">
        <header className="rail-zone__header">
          <span className="rail-zone__icon" aria-hidden="true">🌐</span>
          <div>
            <h3>Global filters</h3>
            <p>Apply to all charts</p>
          </div>
        </header>

        <div className="rail-zone__summary">
          <span>Global state</span>
          <strong>{globalSummary}</strong>
        </div>

        <ToolboxSection title="Geography">
          <ToolboxControl label="Borough">
            <select
              id="global-borough"
              value={filters.borough}
              onChange={(e) => setFilter('borough', e.target.value)}
            >
              {BOROUGHS.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </ToolboxControl>
        </ToolboxSection>

        <ToolboxSection title="Listing">
          <ToolboxControl label="Room type">
            <select
              id="global-room-type"
              value={filters.roomType}
              onChange={(e) => setFilter('roomType', e.target.value)}
            >
              {ROOM_TYPES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </ToolboxControl>
        </ToolboxSection>

        <button className="toolbox-reset" type="button" onClick={resetGlobal}>
          Reset global
        </button>
      </section>

      {/* ── Chart-specific zone ─────────────────────────────────────────── */}
      {activeChartLabel ? (
        <section className="rail-zone rail-zone--chart">
          <header className="rail-zone__header">
            <span className="rail-zone__icon" aria-hidden="true">⚙</span>
            <div>
              <h3>Chart filters</h3>
              <p>{activeChartLabel} only</p>
            </div>
          </header>

          {/* Active filter summary portal target (filled by the active chart). */}
          <div ref={setSummaryTarget} className="rail-zone__summary-slot" />

          {/* Toolbox portal target (filled by the active chart). */}
          <div ref={setToolboxTarget} className="rail-zone__toolbox-slot" />
        </section>
      ) : (
        <section className="rail-zone rail-zone--chart rail-zone--empty">
          <p className="rail-zone__empty-hint">
            Open a chart tab to see chart-specific filters here.
          </p>
        </section>
      )}
    </aside>
  )
}
