import { createContext, useContext, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Portal targets owned by the dashboard shell. Charts use {@link ToolboxSlot}
 * and {@link SummarySlot} to render their per-chart toolbox + active-summary
 * into the shared right-rail. When a target is null (e.g. on the Dashboard
 * overview tab where no single chart is "active"), the slots render nothing.
 */
export type ChartSlotsContextValue = {
  toolboxTarget: HTMLElement | null
  summaryTarget: HTMLElement | null
}

const ChartSlotsContext = createContext<ChartSlotsContextValue>({
  toolboxTarget: null,
  summaryTarget: null,
})

export function ChartSlotsProvider({
  toolboxTarget,
  summaryTarget,
  children,
}: {
  toolboxTarget: HTMLElement | null
  summaryTarget: HTMLElement | null
  children: ReactNode
}) {
  return (
    <ChartSlotsContext.Provider value={{ toolboxTarget, summaryTarget }}>
      {children}
    </ChartSlotsContext.Provider>
  )
}

export function ToolboxSlot({ children }: { children: ReactNode }) {
  const { toolboxTarget } = useContext(ChartSlotsContext)
  if (!toolboxTarget || children == null) return null
  return createPortal(<>{children}</>, toolboxTarget)
}

export function SummarySlot({ children }: { children: ReactNode }) {
  const { summaryTarget } = useContext(ChartSlotsContext)
  if (!summaryTarget || children == null) return null
  return createPortal(<>{children}</>, summaryTarget)
}
