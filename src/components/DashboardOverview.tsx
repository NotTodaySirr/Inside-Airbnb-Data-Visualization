import type { ChartDefinition, ChartId } from '../types/charts'
import type { DashboardTabId } from './BottomSheetTabs'
import { ChartScope } from './ChartSlots'

type Props = {
  charts: ChartDefinition[]
  onOpenChart: (id: DashboardTabId) => void
  activeCardId: DashboardTabId | null
  onCardClick: (id: DashboardTabId) => void
  toolboxTarget: HTMLElement | null
  summaryTarget: HTMLElement | null
}

/**
 * Overview tab — three thematic sections, scrollable:
 *
 *  Section 1 · Demand & Promotion
 *    T2 (Seasonal Review Demand) | T1 (Price-Rating Correlation)
 *
 *  Section 2 · Pricing & Vacancy Operations
 *    T3 (Daily Availability Calendar)  — full width
 *    T4 (Min-Night Policy Box Plot)    — full width
 *
 *  Section 3 · Host Growth & Benchmarking
 *    T5 (Superhost Spatial Density) | T6 (Host Benchmark Profile)
 *
 * Each card wraps its chart in a ChartScope so only the active card's
 * toolbox portals into the rail — all others get null targets.
 */
export function DashboardOverview({
  charts, onOpenChart, activeCardId, onCardClick,
  toolboxTarget, summaryTarget,
}: Props) {
  const byId = Object.fromEntries(charts.map((c) => [c.id, c])) as Record<ChartId, ChartDefinition>

  const card = (id: ChartId, variant?: 'half' | 'full') => (
    <OverviewCard
      chart={byId[id]}
      onOpen={() => onOpenChart(id)}
      onCardClick={() => onCardClick(id)}
      isActive={activeCardId === id}
      toolboxTarget={toolboxTarget}
      summaryTarget={summaryTarget}
      variant={variant}
    />
  )

  return (
    <div className="dashboard-overview">

      {/* ── Section 1: Demand & Promotion ─────────────────────────── */}
      <section className="overview-section">
        <h3 className="overview-section__title">
          <span className="overview-section__num">01</span>
          Demand &amp; Promotion
        </h3>
        <div className="overview-pair">
          {card('task2')}
          {card('task1')}
        </div>
      </section>

      {/* ── Section 2: Pricing & Vacancy Operations ───────────────── */}
      <section className="overview-section">
        <h3 className="overview-section__title">
          <span className="overview-section__num">02</span>
          Pricing &amp; Vacancy Operations
        </h3>
        {card('task3', 'full')}
        {card('task4', 'full')}
      </section>

      {/* ── Section 3: Host Growth & Benchmarking ─────────────────── */}
      <section className="overview-section">
        <h3 className="overview-section__title">
          <span className="overview-section__num">03</span>
          Host Growth &amp; Benchmarking
        </h3>
        <div className="overview-pair">
          {card('task5')}
          {card('task6')}
        </div>
      </section>

    </div>
  )
}

type OverviewCardProps = {
  chart: ChartDefinition
  onOpen: () => void
  onCardClick: () => void
  isActive: boolean
  toolboxTarget: HTMLElement | null
  summaryTarget: HTMLElement | null
  variant?: 'half' | 'full'
}

function OverviewCard({
  chart, onOpen, onCardClick, isActive,
  toolboxTarget, summaryTarget, variant = 'half',
}: OverviewCardProps) {
  const taskNumber = chart.id.replace('task', '')
  const ChartComponent = chart.component

  return (
    <article
      className={`overview-card overview-card--${variant}${isActive ? ' overview-card--active' : ''}`}
      onClick={onCardClick}
      style={{ cursor: 'pointer' }}
      aria-pressed={isActive}
    >
      <header className="overview-card__header">
        <div>
          <span className="overview-card__eyebrow">Task {taskNumber}</span>
          <h4>{chart.title}</h4>
          <p className="overview-card__idiom">{chart.idiom}</p>
        </div>
        <button
          id={`overview-open-${chart.id}`}
          type="button"
          className="overview-card__open"
          onClick={(e) => { e.stopPropagation(); onOpen() }}
        >
          Open chart →
        </button>
      </header>

      <div className="overview-card__body">
        {/* ChartScope gates the portal targets: only the active card
            gets live toolboxTarget/summaryTarget so its filters appear
            in the rail. All other cards get null targets (suppressed). */}
        <ChartScope
          active={isActive}
          toolboxTarget={toolboxTarget}
          summaryTarget={summaryTarget}
        >
          <ChartComponent />
        </ChartScope>
      </div>
    </article>
  )
}
