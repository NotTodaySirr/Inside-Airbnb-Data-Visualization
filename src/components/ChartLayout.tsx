import type { ReactNode } from 'react'
import { SummarySlot, ToolboxSlot } from './ChartSlots'

type ChartWorkspaceProps = {
  children: ReactNode
  toolbox: ReactNode
  caption: string
  activeSummary?: string
}

type ToolboxSectionProps = {
  title: string
  children: ReactNode
}

type ToolboxControlProps = {
  label: string
  children: ReactNode
}

/**
 * Renders the chart's main canvas inline, while portaling its per-chart
 * toolbox + active-summary into the shared dashboard FilterRail via
 * ChartSlots. This keeps each chart agnostic of the shell layout.
 */
export function ChartWorkspace({
  children,
  toolbox,
  caption,
  activeSummary,
}: ChartWorkspaceProps) {
  return (
    <>
      <div className="chart-canvas-body">{children}</div>
      <p className="chart-caption">{caption}</p>
      {activeSummary ? (
        <SummarySlot>
          <ActiveFilterSummary summary={activeSummary} />
        </SummarySlot>
      ) : null}
      {toolbox ? <ToolboxSlot>{toolbox}</ToolboxSlot> : null}
    </>
  )
}

export function ToolboxSection({ title, children }: ToolboxSectionProps) {
  return (
    <section className="toolbox-section">
      <h3>{title}</h3>
      <div className="toolbox-section__body">{children}</div>
    </section>
  )
}

export function ToolboxControl({ label, children }: ToolboxControlProps) {
  return (
    <label className="toolbox-control">
      <span>{label}</span>
      {children}
    </label>
  )
}

export function ActiveFilterSummary({ summary }: { summary: string }) {
  return (
    <div className="active-filter-summary">
      <span>Active filters</span>
      <strong>{summary}</strong>
    </div>
  )
}
