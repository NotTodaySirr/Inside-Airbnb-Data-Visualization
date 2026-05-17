/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

/**
 * Global filters shared across every chart in the dashboard.
 * Today only Borough + Room type are wired as global. Adding more filters
 * here is the contract every chart should consume going forward.
 */
export type GlobalFilters = {
  borough: string   // 'All' | borough name
  roomType: string  // 'All' | room type
}

export const DEFAULT_GLOBAL_FILTERS: GlobalFilters = {
  borough: 'All',
  roomType: 'All',
}

const STORAGE_KEY = 'dv-lab.globalFilters'

type GlobalFiltersContextValue = {
  filters: GlobalFilters
  setFilter: <K extends keyof GlobalFilters>(key: K, value: GlobalFilters[K]) => void
  resetGlobal: () => void
}

const GlobalFiltersContext = createContext<GlobalFiltersContextValue | null>(null)

function readFromStorage(): GlobalFilters {
  if (typeof window === 'undefined') return DEFAULT_GLOBAL_FILTERS
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_GLOBAL_FILTERS
    const parsed = JSON.parse(raw) as Partial<GlobalFilters>
    return { ...DEFAULT_GLOBAL_FILTERS, ...parsed }
  } catch {
    return DEFAULT_GLOBAL_FILTERS
  }
}

export function GlobalFiltersProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<GlobalFilters>(readFromStorage)

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filters))
    } catch {
      // Ignore storage errors (private browsing, quota, etc.)
    }
  }, [filters])

  const setFilter = useCallback(
    <K extends keyof GlobalFilters>(key: K, value: GlobalFilters[K]) => {
      setFilters((cur) => ({ ...cur, [key]: value }))
    },
    [],
  )

  const resetGlobal = useCallback(() => setFilters(DEFAULT_GLOBAL_FILTERS), [])

  const value = useMemo(() => ({ filters, setFilter, resetGlobal }), [filters, setFilter, resetGlobal])

  return <GlobalFiltersContext.Provider value={value}>{children}</GlobalFiltersContext.Provider>
}

export function useGlobalFilters(): GlobalFilters {
  const ctx = useContext(GlobalFiltersContext)
  if (!ctx) {
    // When used outside a provider (e.g., a chart rendered standalone in tests),
    // return defaults so the chart still renders.
    return DEFAULT_GLOBAL_FILTERS
  }
  return ctx.filters
}

export function useGlobalFiltersActions() {
  const ctx = useContext(GlobalFiltersContext)
  if (!ctx) {
    return {
      setFilter: () => undefined,
      resetGlobal: () => undefined,
    } as Pick<GlobalFiltersContextValue, 'setFilter' | 'resetGlobal'>
  }
  return { setFilter: ctx.setFilter, resetGlobal: ctx.resetGlobal }
}
