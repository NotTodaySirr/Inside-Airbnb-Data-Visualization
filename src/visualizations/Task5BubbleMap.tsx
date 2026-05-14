import * as d3 from 'd3'
import { useState } from 'react'
import { useCsvData } from '../data/useCsvData'
import type { Task5TopTierLocationRow } from '../types/charts'
import { EmptyState, Legend } from './chartHelpers'
import { chartMargins, formatNumber, superhostColor, uniqueValues, wideChart } from './chartScales'

export function Task5BubbleMap() {
  const state = useCsvData<Task5TopTierLocationRow>('/data/derived/task5_top_tier_locations.csv')
  const [neighbourhood, setNeighbourhood] = useState('All')
  const [tip, setTip] = useState('')
  if (state.status === 'loading') return <div className="loading-state">Loading top-tier locations...</div>
  if (state.status === 'error') return <EmptyState title="Could not load Task 5" message={state.error} />
  const withCoords = state.data.filter(d => d.latitude != null && d.longitude != null && Number.isFinite(d.latitude) && Number.isFinite(d.longitude))
  if (!withCoords.length) return <EmptyState title="Coordinates missing" message="Task 5 needs latitude and longitude in listings_cleaned.csv. The derived file was created, but all coordinate fields are empty." />
  const neighbourhoods = uniqueValues(withCoords, d => d.neighbourhood_cleansed)
  const data = neighbourhood === 'All' ? withCoords : withCoords.filter(d=>d.neighbourhood_cleansed===neighbourhood)
  if (!data.length) return <EmptyState title="No listings in this neighbourhood" message="Choose another neighbourhood filter." />
  const { width, height } = wideChart
  const x = d3.scaleLinear(d3.extent(withCoords, d=>d.longitude) as [number, number], [chartMargins.left, width-chartMargins.right])
  const y = d3.scaleLinear(d3.extent(withCoords, d=>d.latitude) as [number, number], [height-chartMargins.bottom, chartMargins.top])
  const r = d3.scaleSqrt([0, d3.max(withCoords, d=>d.number_of_reviews_ltm) ?? 1], [4, 24])
  return <div><label className="filter-control">Neighbourhood <select id="task5-neighbourhood" value={neighbourhood} onChange={e=>setNeighbourhood(e.target.value)}><option>All</option>{neighbourhoods.map(n=><option key={n}>{n}</option>)}</select></label><Legend items={['Superhost','Regular host']} color={superhostColor}/><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Bubble map of top-tier listings">
    <rect x={chartMargins.left} y={chartMargins.top} width={width-chartMargins.left-chartMargins.right} height={height-chartMargins.top-chartMargins.bottom} rx="28" className="map-panel"/>
    {data.map(d=>{const label=d.host_is_superhost?'Superhost':'Regular host'; return <circle key={d.listing_id} cx={x(d.longitude!)} cy={y(d.latitude!)} r={r(d.number_of_reviews_ltm)} fill={superhostColor(label)} opacity=".62" stroke="white" strokeWidth="1.5" onMouseEnter={()=>setTip(`${d.neighbourhood_cleansed} · listing ${d.listing_id}: ${formatNumber(d.number_of_reviews_ltm)} LTM reviews, ${label}`)} onMouseLeave={()=>setTip('')}/>})}
  </svg><div className="tooltip-bar">{tip || 'Top 10% listings by last-twelve-month reviews. Bubble size encodes review volume.'}</div></div>
}
