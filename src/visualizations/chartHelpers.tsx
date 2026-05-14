import { createPortal } from 'react-dom'

export type HoverCardRow = {
  label: string
  value: string
}

export type HoverCardProps = {
  x: number
  y: number
  title: string
  rows: HoverCardRow[]
}

export function HoverCard({ x, y, title, rows }: HoverCardProps) {
  return createPortal(
    <div className="hover-card" style={{ position: 'fixed', left: x, top: y, zIndex: 9999 }}>
      <strong>{title}</strong>
      {rows.map((row) => (
        <span key={row.label}><b>{row.label}:</b> {row.value}</span>
      ))}
    </div>,
    document.body
  )
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="empty-state" role="status">
      <strong>{title}</strong>
      <span>{message}</span>
    </div>
  )
}

export function Legend({ items, color }: { items: string[]; color: (value: string) => string }) {
  return (
    <div className="legend" aria-label="Chart legend">
      {items.map((item) => (
        <span className="legend-item" key={item}>
          <i style={{ background: color(item) }} /> {item}
        </span>
      ))}
    </div>
  )
}
