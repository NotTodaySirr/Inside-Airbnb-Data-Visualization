import type { ReactNode } from 'react'

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

export function ChartWorkspace({
  children,
  toolbox,
  caption,
  activeSummary,
}: ChartWorkspaceProps) {
  return (
    <>
      <div className="chart-workspace">
        <div className="chart-workspace__main">{children}</div>
        <aside className="chart-toolbox" aria-label="Chart controls">
          {activeSummary ? <ActiveFilterSummary summary={activeSummary} /> : null}
          {toolbox}
        </aside>
      </div>
      <p className="chart-caption">{caption}</p>
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
