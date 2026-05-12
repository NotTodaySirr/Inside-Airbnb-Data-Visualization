import { useEffect, useState } from 'react'
import './App.css'
import { ChartLayout } from './components/ChartLayout'
import { VisualizationDesign } from './components/VisualizationDesign'
import { loadChartData } from './data/loadChartData'
import { sampleCategoricalData } from './data/sampleData'
import type { CategoricalDatum } from './data/sampleData'
import { BarChart } from './visualizations/BarChart'

function App() {
  const [data, setData] = useState<CategoricalDatum[]>(sampleCategoricalData)
  const [source, setSource] = useState<'csv' | 'sample'>('sample')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let ignore = false

    async function loadData() {
      const result = await loadChartData()

      if (!ignore) {
        setData(result.data)
        setSource(result.source)
        setIsLoading(false)
      }
    }

    loadData()

    return () => {
      ignore = true
    }
  }, [])

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <p className="eyebrow">Data Visualization Lab</p>
        <h1>React controls the interface. D3 powers the chart math.</h1>
        <p className="hero-copy">
          This starter keeps the UI declarative with React while using D3 for
          scales, axes, and data-to-pixel calculations.
        </p>
      </section>

      <ChartLayout
        title={source === 'csv' ? 'Cleaned Dataset Overview' : 'Sample Dataset Preview'}
        description={
          source === 'csv'
            ? 'Loaded from public/data/chart-data.csv.'
            : 'Showing sample data. Add public/data/chart-data.csv to visualize your cleaned dataset.'
        }
      >
        {isLoading ? (
          <div className="loading-state">Loading data...</div>
        ) : (
          <BarChart
            data={data}
            xLabel="Category"
            yLabel="Value"
            colorLabel="Group"
          />
        )}
      </ChartLayout>

      <VisualizationDesign source={source} />
    </main>
  )
}

export default App
