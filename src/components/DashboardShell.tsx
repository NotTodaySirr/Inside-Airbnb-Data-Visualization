import { useEffect, useState } from 'react'
import type { ChartDefinition } from '../types/charts'
import { BottomSheetTabs, type DashboardTab, type DashboardTabId } from './BottomSheetTabs'
import { ChartSlotsProvider } from './ChartSlots'
import { DashboardOverview } from './DashboardOverview'
import { FilterRail } from './FilterRail'
import { GlobalFiltersProvider } from './GlobalFiltersContext'

type Props = {
  charts: ChartDefinition[]
  defaultTab?: DashboardTabId
}

export function DashboardShell({ charts, defaultTab = 'overview' }: Props) {
  const [activeId, setActiveId] = useState<DashboardTabId>(defaultTab)
  const [summaryTarget, setSummaryTarget] = useState<HTMLDivElement | null>(null)
  const [toolboxTarget, setToolboxTarget] = useState<HTMLDivElement | null>(null)

  // When switching tabs, scroll canvas back to top.
  useEffect(() => {
    const canvas = document.querySelector('.dashboard-canvas')
    if (canvas) canvas.scrollTop = 0
  }, [activeId])

  const tabs: DashboardTab[] = [
    { id: 'overview', label: 'Dashboard', subtitle: 'Overview' },
    ...charts.map((c, i) => ({
      id: c.id as DashboardTabId,
      label: `Task ${i + 1}`,
      subtitle: c.idiom,
    })),
  ]

  const isOverview = activeId === 'overview'
  const activeChart = isOverview ? null : charts.find((c) => c.id === activeId) ?? null
  const activeChartLabel = activeChart
    ? `Task ${charts.findIndex((c) => c.id === activeChart.id) + 1}`
    : null

  return (
    <GlobalFiltersProvider>
      <ChartSlotsProvider toolboxTarget={toolboxTarget} summaryTarget={summaryTarget}>
        <div className="dashboard-shell">
          {/* ── Top header ──────────────────────────────────────────────── */}
          <header className="dashboard-header">
            <div>
              <p className="eyebrow">Inside Airbnb NYC</p>
              <h1 className="dashboard-title">Dashboard</h1>
            </div>
            <p className="dashboard-subtitle">Group 9 · DataVis Lab</p>
          </header>

          {/* ── Main: canvas + filter rail ──────────────────────────────── */}
          <div className="dashboard-main">
            <main className="dashboard-canvas" aria-live="polite">
              {isOverview ? (
                <DashboardOverview charts={charts} onOpenChart={setActiveId} />
              ) : activeChart ? (
                <ActiveChartView chart={activeChart} taskLabel={activeChartLabel ?? ''} />
              ) : null}
            </main>

            <FilterRail
              activeChartLabel={activeChartLabel}
              setSummaryTarget={setSummaryTarget}
              setToolboxTarget={setToolboxTarget}
            />
          </div>

          {/* ── Bottom sheet tabs ───────────────────────────────────────── */}
          <BottomSheetTabs tabs={tabs} activeId={activeId} onSelect={setActiveId} />
        </div>
      </ChartSlotsProvider>
    </GlobalFiltersProvider>
  )
}

function ActiveChartView({ chart, taskLabel }: { chart: ChartDefinition; taskLabel: string }) {
  const ChartComponent = chart.component
  return (
    <article className="chart-card chart-card--focus" aria-labelledby="active-chart-title">
      <div className="chart-card__heading">
        <p className="eyebrow">{taskLabel} · {chart.idiom}</p>
        <h2 id="active-chart-title">{chart.title}</h2>
        <p className="chart-card__task-text">{chart.taskText}</p>
      </div>
      <div className="chart-card__body">
        <ChartComponent />
      </div>
    </article>
  )
}
