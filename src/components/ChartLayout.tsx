import type { ReactNode } from 'react'

type ChartLayoutProps = {
  title: string
  description: string
  children: ReactNode
}

export function ChartLayout({
  title,
  description,
  children,
}: ChartLayoutProps) {
  return (
    <section className="chart-card" aria-labelledby="chart-title">
      <div className="chart-card__header">
        <p className="eyebrow">Sample chart</p>
        <h2 id="chart-title">{title}</h2>
        <p>{description}</p>
      </div>
      {children}
    </section>
  )
}
