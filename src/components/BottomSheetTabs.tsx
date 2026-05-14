import type { ChartId } from '../types/charts'

export type DashboardTabId = 'overview' | ChartId

export type DashboardTab = {
  id: DashboardTabId
  label: string
  subtitle: string
}

type Props = {
  tabs: DashboardTab[]
  activeId: DashboardTabId
  onSelect: (id: DashboardTabId) => void
}

export function BottomSheetTabs({ tabs, activeId, onSelect }: Props) {
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const idx = tabs.findIndex((t) => t.id === activeId)
    if (idx < 0) return
    let nextIdx = idx
    if (e.key === 'ArrowRight') nextIdx = (idx + 1) % tabs.length
    else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + tabs.length) % tabs.length
    else if (e.key === 'Home') nextIdx = 0
    else if (e.key === 'End') nextIdx = tabs.length - 1
    else return
    e.preventDefault()
    onSelect(tabs[nextIdx].id)
  }

  return (
    <div className="dashboard-tabs" role="tablist" aria-label="Dashboard sheets" onKeyDown={handleKeyDown}>
      {tabs.map((tab) => {
        const active = tab.id === activeId
        return (
          <button
            key={tab.id}
            id={`dashboard-tab-${tab.id}`}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            className={`tab-btn${active ? ' active' : ''}${tab.id === 'overview' ? ' tab-btn--overview' : ''}`}
            onClick={() => onSelect(tab.id)}
          >
            <span className="tab-btn__label">{tab.label}</span>
            <span className="tab-btn__subtitle">{tab.subtitle}</span>
          </button>
        )
      })}
    </div>
  )
}
