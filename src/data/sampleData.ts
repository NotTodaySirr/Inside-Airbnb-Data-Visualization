export type CategoricalDatum = {
  category: string
  value: number
  group?: string
}

export const sampleCategoricalData: CategoricalDatum[] = [
  { category: 'Jan', value: 1200, group: 'Semester 1' },
  { category: 'Feb', value: 1900, group: 'Semester 1' },
  { category: 'Mar', value: 1500, group: 'Semester 1' },
  { category: 'Apr', value: 2300, group: 'Semester 1' },
  { category: 'May', value: 2800, group: 'Semester 2' },
  { category: 'Jun', value: 3400, group: 'Semester 2' },
  { category: 'Jul', value: 3100, group: 'Semester 2' },
  { category: 'Aug', value: 3900, group: 'Semester 2' },
]
