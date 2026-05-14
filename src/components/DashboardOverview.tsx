import type { ChartDefinition, ChartId } from '../types/charts'
import type { DashboardTabId } from './BottomSheetTabs'

type Props = {
  charts: ChartDefinition[]
  onOpenChart: (id: DashboardTabId) => void
}

/**
 * Overview tab: shows all six charts in a pyramid grid (T5 anchor on top,
 * T2/T3 pair, T1/T6 pair, T4 anchor on bottom). Each card is a sandboxed
 * mini-render of the actual chart component, with a header (Task X + title)
 * and an "Open chart →" button that navigates to that chart's tab.
 *
 * Charts in this overview honor only global filters; their per-chart toolbox
 * is suppressed (no portal targets are mounted by the shell when
 * activeId === 'overview').
 */
export function DashboardOverview({ charts, onOpenChart }: Props) {
  // Pyramid order: T5 (full) → T2 | T3 → T1 | T6 → T4 (full)
  const byId = Object.fromEntries(charts.map((c) => [c.id, c])) as Record<ChartId, ChartDefinition>

  return (
    <div className="dashboard-overview">
      <section className="overview-section">
        <h3 className="overview-section__title">Tactical · where &amp; when</h3>

        <OverviewCard chart={byId.task5} onOpen={() => onOpenChart('task5')} variant="full" />

        <div className="overview-pair">
          <OverviewCard chart={byId.task2} onOpen={() => onOpenChart('task2')} />
          <OverviewCard chart={byId.task3} onOpen={() => onOpenChart('task3')} />
        </div>
      </section>

      <section className="overview-section">
        <h3 className="overview-section__title">Operational · quality &amp; policy</h3>

        <div className="overview-pair">
          <OverviewCard chart={byId.task1} onOpen={() => onOpenChart('task1')} />
          <OverviewCard chart={byId.task6} onOpen={() => onOpenChart('task6')} />
        </div>

        <OverviewCard chart={byId.task4} onOpen={() => onOpenChart('task4')} variant="full" />
      </section>
    </div>
  )
}

type OverviewCardProps = {
  chart: ChartDefinition
  onOpen: () => void
  variant?: 'half' | 'full'
}

function OverviewCard({ chart, onOpen, variant = 'half' }: OverviewCardProps) {
  const taskNumber = chart.id.replace('task', '')
  const ChartComponent = chart.component

  return (
    <article className={`overview-card overview-card--${variant}`}>
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
          onClick={onOpen}
        >
          Open chart →
        </button>
      </header>

      <div className="overview-card__body">
        <ChartComponent />
      </div>
    </article>
  )
}
