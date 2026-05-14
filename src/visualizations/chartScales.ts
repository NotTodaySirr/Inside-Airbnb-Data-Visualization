import * as d3 from 'd3'

export const chartMargins = { top: 28, right: 28, bottom: 74, left: 92 }
export const wideChart = { width: 980, height: 560 }

export const formatNumber = d3.format(',')
export const formatPercent = d3.format('.0%')
export const formatDecimal = d3.format('.2f')

export const roomTypeColor = d3.scaleOrdinal<string, string>()
  .range(['#7c3aed', '#06b6d4', '#f97316', '#22c55e', '#ec4899'])

export const hostGroupColor = d3.scaleOrdinal<string, string>()
  .domain(['Individual host', 'Multi-listing host', 'Superhost', 'Regular host'])
  .range(['#14b8a6', '#f59e0b', '#8b5cf6', '#64748b'])

export const superhostColor = d3.scaleOrdinal<string, string>()
  .domain(['Superhost', 'Regular host'])
  .range(['#facc15', '#38bdf8'])

export const correlationColor = d3.scaleDiverging<string>()
  .domain([-1, 0, 1])
  .interpolator(d3.interpolateRdBu)

export function uniqueValues<T>(rows: T[], accessor: (row: T) => string): string[] {
  return Array.from(new Set(rows.map(accessor).filter(Boolean))).sort()
}
