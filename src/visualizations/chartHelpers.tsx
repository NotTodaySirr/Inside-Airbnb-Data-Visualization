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
