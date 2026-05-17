import type { GlobalFilters } from '../components/GlobalFiltersContext'

type FilterableRow = {
  borough?: string | null
  room_type?: string | null
}

export function rowMatchesGlobalFilters(row: FilterableRow, filters: GlobalFilters): boolean {
  if (filters.borough !== 'All' && row.borough != null && row.borough !== filters.borough) {
    return false
  }
  if (filters.roomType !== 'All' && row.room_type != null && row.room_type !== filters.roomType) {
    return false
  }
  return true
}

export function globalFilterLabel(filters: GlobalFilters): string {
  const borough = filters.borough === 'All' ? 'All boroughs' : filters.borough
  const roomType = filters.roomType === 'All' ? 'All room types' : filters.roomType
  return `${borough} - ${roomType}`
}
