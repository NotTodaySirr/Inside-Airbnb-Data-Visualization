import { useMemo, useState } from 'react'
import './App.css'
import type { ChartDefinition, ChartId } from './types/charts'
import { Task1CorrelationBars } from './visualizations/Task1CorrelationBars'
import { Task2StackedReviews } from './visualizations/Task2StackedReviews'
import { Task3VacancyArea } from './visualizations/Task3VacancyArea'
import { Task4VacancyBoxPlot } from './visualizations/Task4VacancyBoxPlot'
import { Task5BubbleMap } from './visualizations/Task5BubbleMap'
import { Task6HostKpiBars } from './visualizations/Task6HostKpiBars'

const charts: ChartDefinition[] = [
  { id: 'task1', title: 'Price-Rating Correlation by Neighbourhood and Room Type', taskText: 'Which neighbourhood-room type groups show the strongest positive or negative relationship between price and rating?', idiom: 'Diverging bar chart', dataUrl: '/data/derived/task1_price_rating_corr.csv', component: Task1CorrelationBars },
  { id: 'task2', title: 'Monthly Review Demand by Room Type', taskText: 'Compare review volume over time and identify seasonal shifts across room types.', idiom: 'Stacked bar chart', dataUrl: '/data/derived/task2_review_month_room_type.csv', component: Task2StackedReviews },
  { id: 'task3', title: 'Vacancy Trend by Host Group', taskText: 'Compare vacancy rates for individual versus multi-listing hosts with a room-type filter.', idiom: 'Area chart', dataUrl: '/data/derived/task3_vacancy_month_host_group.csv', component: Task3VacancyArea },
  { id: 'task4', title: 'Minimum Nights vs Vacancy Distribution', taskText: 'Inspect vacancy spread, medians, and listing-level outliers across stay-length policies.', idiom: 'Box plot', dataUrl: '/data/derived/task4_min_nights_vacancy_box.csv', component: Task4VacancyBoxPlot },
  { id: 'task5', title: 'Neighbourhood Opportunity Heatmap', taskText: 'Track occupancy and pricing trends across neighbourhoods. Identify high-opportunity areas for dynamic pricing intervention, segmented by host type and market conditions.', idiom: 'GeoJSON Choropleth Heatmap', dataUrl: '/data/derived/task5_neighbourhood_opportunity.csv', component: Task5BubbleMap },
  { id: 'task6', title: 'Host Performance KPI Comparison', taskText: 'Compare superhost and regular host performance across acceptance, instant booking, and rating KPIs.', idiom: 'Grouped bar chart', dataUrl: '/data/derived/task6_host_kpi.csv', component: Task6HostKpiBars },
]

function App() {
  const [activeId, setActiveId] = useState<ChartId>('task1')
  const activeChart = useMemo(() => charts.find((chart) => chart.id === activeId) ?? charts[0], [activeId])
  const ActiveComponent = activeChart.component

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <p className="eyebrow">Inside Airbnb - React + D3 Explorer</p>
        <h1>Six focused chart views, one premium exploration surface.</h1>
        <p className="hero-copy">Each view loads a small pre-aggregated CSV from <code>public/data/derived</code>. React owns interaction state; D3 powers CSV loading, scales, stacks, shapes, and chart math.</p>
      </section>

      <nav className="chart-tabs" aria-label="Chart selector">
        {charts.map((chart, index) => (
          <button id={`chart-tab-${chart.id}`} key={chart.id} className={chart.id === activeId ? 'active' : ''} onClick={() => setActiveId(chart.id)}>
            <span>Task {index + 1}</span>{chart.idiom}
          </button>
        ))}
      </nav>

      <section className="chart-card" aria-labelledby="active-chart-title">
        <div className="chart-heading">
          <div>
            <p className="eyebrow">{activeChart.idiom}</p>
            <h2 id="active-chart-title">{activeChart.title}</h2>
            <p>{activeChart.taskText}</p>
          </div>
          <code>{activeChart.dataUrl}</code>
        </div>
        <ActiveComponent />
      </section>
    </main>
  )
}

export default App
