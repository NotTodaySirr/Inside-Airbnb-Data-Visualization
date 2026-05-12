import { csv } from 'd3'
import { sampleCategoricalData } from './sampleData'
import type { CategoricalDatum } from './sampleData'

const DATA_URL = '/data/chart-data.csv'

const categoryColumns = ['category', 'label', 'name', 'month']
const valueColumns = ['value', 'count', 'total', 'visitors']
const groupColumns = ['group', 'type', 'region']

function getFirstMatchingValue(
  row: Record<string, string>,
  candidates: string[],
) {
  const normalizedRow = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key.toLowerCase(), value]),
  )

  for (const candidate of candidates) {
    const value = normalizedRow[candidate]

    if (value) {
      return value
    }
  }

  return ''
}

export async function loadChartData(): Promise<{
  data: CategoricalDatum[]
  source: 'csv' | 'sample'
}> {
  try {
    const rows = await csv(DATA_URL)
    const parsedData = rows
      .map((row): CategoricalDatum | null => {
        const category = getFirstMatchingValue(row, categoryColumns)
        const rawValue = getFirstMatchingValue(row, valueColumns)
        const group = getFirstMatchingValue(row, groupColumns)
        const value = Number(rawValue)

        if (!category || Number.isNaN(value)) {
          return null
        }

        const datum: CategoricalDatum = {
          category,
          value,
        }

        if (group) {
          datum.group = group
        }

        return datum
      })
      .filter((datum): datum is CategoricalDatum => datum !== null)

    if (parsedData.length === 0) {
      return { data: sampleCategoricalData, source: 'sample' }
    }

    return { data: parsedData, source: 'csv' }
  } catch {
    return { data: sampleCategoricalData, source: 'sample' }
  }
}
