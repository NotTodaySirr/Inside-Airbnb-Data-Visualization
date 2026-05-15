import './App.css'
import { DashboardShell } from './components/DashboardShell'
import type { ChartDefinition } from './types/charts'
import { Task1CorrelationBars } from './visualizations/Task1CorrelationBars'
import { Task2StackedReviews } from './visualizations/Task2StackedReviews'
import { Task3CalendarHeatmap } from './visualizations/Task3CalendarHeatmap'
import { Task4VacancyBoxPlot } from './visualizations/Task4VacancyBoxPlot'
import { Task5SuperhostHeatmap } from './visualizations/Task5SuperhostHeatmap'
import { Task6HostProfileChart } from './visualizations/Task6HostProfileChart'

const charts: ChartDefinition[] = [
  {
    id: 'task1',
    title: 'Price-Rating Correlation by Neighbourhood and Room Type',
    taskText:
      'Which neighbourhood-room type groups show the strongest positive or negative relationship between price and rating?',
    idiom: 'Diverging bar chart',
    dataUrl: '/data/derived/task1_price_rating_corr.csv',
    component: Task1CorrelationBars,
  },
  {
    id: 'task2',
    title: 'Seasonal Review Demand & Listing Promotions',
    taskText:
      'Identify which months drive peak review activity, what room types and neighbourhoods lead demand, and which listings to promote during high-engagement periods.',
    idiom: 'Stacked bar chart + drilldown',
    dataUrl: '/data/derived/task2_bar_summary.csv',
    component: Task2StackedReviews,
  },
  {
    id: 'task3',
    title: 'Daily Availability & Price Calendar',
    taskText:
      'Track daily availability across the next 365 days with each cell split into Individual (top) and Commercial (bottom) hosts. Gold outlines flag days with high availability and high price for pricing review. Hover any day for both groups\' median price and occupancy.',
    idiom: 'Split-cell calendar heatmap',
    dataUrl: '/data/derived/task3_daily_host_group_summary.csv',
    component: Task3CalendarHeatmap,
  },
  {
    id: 'task4',
    title: 'Minimum-Night Policy & Price Rigidity vs Vacancy',
    taskText:
      'For single-property hosts, see whether stricter minimum-night policies and a high fixed listing price coincide with elevated vacancy. Highlighted dots flag listings on 30+ night minimums with high fixed prices and 80%+ vacancy.',
    idiom: 'Box plot',
    dataUrl: '/data/derived/task4_min_nights_vacancy_box.csv',
    component: Task4VacancyBoxPlot,
  },
  {
    id: 'task5',
    title: 'Top-tier Superhost Spatial Density',
    taskText:
      'See where top-tier Superhost listings cluster spatially and where high-review non-Superhost listings reveal geographic gaps for targeted Superhost acquisition campaigns.',
    idiom: 'Spatial density heatmap',
    dataUrl: '/data/derived/task5_spatial_listings.csv',
    component: Task5SuperhostHeatmap,
  },
  {
    id: 'task6',
    title: 'Host Benchmark Profile',
    taskText:
      'Compare Superhost, Regular host, and new-host target profiles across quality, operations, trust, demand, occupancy, identity, risk, and booking settings.',
    idiom: 'Profile chart',
    dataUrl: '/data/derived/task6_host_profile.csv',
    component: Task6HostProfileChart,
  },
]

function App() {
  return <DashboardShell charts={charts} defaultTab="overview" />
}

export default App
