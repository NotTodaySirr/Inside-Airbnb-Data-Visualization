import * as d3 from 'd3'
import { useState } from 'react'
import { ChartWorkspace, ToolboxControl, ToolboxSection } from '../components/ChartLayout'
import { useCsvData } from '../data/useCsvData'
import { useJsonData } from '../data/useJsonData'
import type { Task5NeighbourhoodGapRow, Task5TopTierLocationRow } from '../types/charts'
import { EmptyState, HoverCard, Legend } from './chartHelpers'
import type { HoverCardProps } from './chartHelpers'
import { chartMargins, formatNumber, formatPercent, superhostColor, wideChart } from './chartScales'

type NeighbourhoodFeature = GeoJSON.Feature<GeoJSON.Geometry, {
  neighbourhood?: string
  neighbourhood_group?: string
}>
type NeighbourhoodGeoJson = GeoJSON.FeatureCollection<GeoJSON.Geometry, NeighbourhoodFeature['properties']>
type HoverCardState = HoverCardProps

export function Task5BubbleMap() {
  const listingState = useCsvData<Task5TopTierLocationRow>('/data/derived/task5_top_tier_locations.csv')
  const gapState = useCsvData<Task5NeighbourhoodGapRow>('/data/derived/task5_neighbourhood_gap.csv')
  const geoState = useJsonData<NeighbourhoodGeoJson>('/data/neighbourhoods.geojson')
  const [neighbourhood, setNeighbourhood] = useState('All')
  const [showSuperhosts, setShowSuperhosts] = useState(true)
  const [showRegularHosts, setShowRegularHosts] = useState(true)
  const [hoverCard, setHoverCard] = useState<HoverCardState | null>(null)

  if (listingState.status === 'loading' || gapState.status === 'loading' || geoState.status === 'loading') {
    return <div className="loading-state">Loading bubble map...</div>
  }
  if (listingState.status === 'error') return <EmptyState title="Could not load Task 5 bubbles" message={listingState.error} />
  if (gapState.status === 'error') return <EmptyState title="Could not load Task 5 neighbourhood gaps" message={gapState.error} />
  if (geoState.status === 'error') return <EmptyState title="Could not load neighbourhood boundaries" message={geoState.error} />

  const withCoords = listingState.data.filter(d => d.latitude != null && d.longitude != null && Number.isFinite(d.latitude) && Number.isFinite(d.longitude))
  const neighbourhoodOptions = gapState.data
    .filter(d => d.total_top_tier_listings > 0)
    .map(d => d.neighbourhood_cleansed)
    .sort()
  const hostMarkerSummary = [
    showSuperhosts ? 'Superhosts' : null,
    showRegularHosts ? 'Regular hosts' : null,
  ].filter(Boolean).join(' + ') || 'No host markers'
  const activeSummary = `${neighbourhood} - ${hostMarkerSummary}`

  const resetFilters = () => {
    setNeighbourhood('All')
    setShowSuperhosts(true)
    setShowRegularHosts(true)
  }

  const toolbox = (
    <>
      <ToolboxSection title="Data Filters">
        <ToolboxControl label="Neighbourhood">
          <select id="task5-neighbourhood" value={neighbourhood} onChange={e => setNeighbourhood(e.target.value)}>
            <option>All</option>
            {neighbourhoodOptions.map(n => <option key={n}>{n}</option>)}
          </select>
        </ToolboxControl>
      </ToolboxSection>

      <ToolboxSection title="Display">
        <label className="toolbox-check">
          <input type="checkbox" checked={showSuperhosts} onChange={(e) => setShowSuperhosts(e.target.checked)} />
          <span>Show Superhosts</span>
        </label>
        <label className="toolbox-check">
          <input type="checkbox" checked={showRegularHosts} onChange={(e) => setShowRegularHosts(e.target.checked)} />
          <span>Show regular hosts</span>
        </label>
      </ToolboxSection>

      <button className="toolbox-reset" type="button" onClick={resetFilters}>Reset filters</button>
    </>
  )

  if (!withCoords.length) {
    return (
      <ChartWorkspace toolbox={toolbox} activeSummary={activeSummary} caption="No mapped listings have usable latitude and longitude fields.">
        <EmptyState title="Coordinates missing" message="Task 5 needs latitude and longitude in listings_cleaned.csv. The derived file was created, but all coordinate fields are empty." />
      </ChartWorkspace>
    )
  }

  const { width, height } = wideChart
  const gapByNeighbourhood = new Map(gapState.data.map(d => [d.neighbourhood_cleansed, d]))
  const filteredListings = withCoords
    .filter(d => neighbourhood === 'All' || d.neighbourhood_cleansed === neighbourhood)
    .filter(d => (d.host_is_superhost && showSuperhosts) || (!d.host_is_superhost && showRegularHosts))
  const maxGap = d3.max(gapState.data, d => d.gap_score) ?? 0
  const gapColor = d3.scaleSequential([0, Math.max(maxGap, 1)], d3.interpolateYlOrRd)
  const r = d3.scaleSqrt([0, d3.max(withCoords, d => d.number_of_reviews_ltm) ?? 1], [3.5, 22])
  const projection = d3.geoMercator().fitExtent(
    [[chartMargins.left, chartMargins.top], [width - chartMargins.right, height - chartMargins.bottom]],
    geoState.data as d3.GeoPermissibleObjects,
  )
  const path = d3.geoPath(projection)
  const topTargets = [...gapState.data]
    .filter(d => d.total_top_tier_listings > 0)
    .sort((a, b) => d3.descending(a.gap_score, b.gap_score) || d3.descending(a.top_tier_regular_count, b.top_tier_regular_count))
    .slice(0, 8)

  return (
    <ChartWorkspace
      toolbox={toolbox}
      activeSummary={activeSummary}
      caption={`Showing top-tier listing locations and neighbourhood gap scores for ${neighbourhood === 'All' ? 'all neighbourhoods' : neighbourhood}. Larger bubbles represent more recent reviews.`}
    >
      <div className="task-chart-shell">
        <Legend items={['Superhost', 'Regular host']} color={superhostColor} />
        <div className="gap-legend" aria-label="Gap score legend">
          <span>Low opportunity</span><i /><span>High opportunity</span>
        </div>
        <div className="task-plot-wrap">
          <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Bubble map of top-tier Superhost acquisition gaps">
            <rect x={chartMargins.left} y={chartMargins.top} width={width - chartMargins.left - chartMargins.right} height={height - chartMargins.top - chartMargins.bottom} rx="28" className="map-panel" />
            {geoState.data.features.map((feature, index) => {
              const name = feature.properties?.neighbourhood ?? ''
              const gap = gapByNeighbourhood.get(name)
              const isActive = neighbourhood !== 'All' && name === neighbourhood
              const isDimmed = neighbourhood !== 'All' && name !== neighbourhood
              const fill = gap && gap.gap_score > 0 ? gapColor(gap.gap_score) : 'rgba(30,41,59,.72)'
              const hover = gap ? {
                title: name,
                rows: [
                  { label: 'Top-tier Superhosts', value: formatNumber(gap.top_tier_superhost_count) },
                  { label: 'High-review regular hosts', value: formatNumber(gap.top_tier_regular_count) },
                  { label: 'Superhost share', value: formatPercent(gap.superhost_share) },
                  { label: 'Gap score', value: formatNumber(gap.gap_score) },
                ],
              } : {
                title: name || 'Neighbourhood',
                rows: [{ label: 'Status', value: 'No top-tier listing gap row available' }],
              }

              return (
                <path
                  key={`${name}-${index}`}
                  className={`neighbourhood-boundary${isActive ? ' active' : ''}${isDimmed ? ' dimmed' : ''}`}
                  d={path(feature) ?? undefined}
                  fill={fill}
                  onMouseEnter={e => {
                    const rect = (e.currentTarget.ownerSVGElement ?? e.currentTarget).getBoundingClientRect()
                    setHoverCard({ x: e.clientX - rect.left + 16, y: e.clientY - rect.top - 18, ...hover })
                  }}
                  onMouseMove={e => {
                    const rect = (e.currentTarget.ownerSVGElement ?? e.currentTarget).getBoundingClientRect()
                    setHoverCard(current => current ? { ...current, x: e.clientX - rect.left + 16, y: e.clientY - rect.top - 18, ...hover } : null)
                  }}
                  onMouseLeave={() => setHoverCard(null)}
                />
              )
            })}
            {filteredListings.map(d => {
              const label = d.host_is_superhost ? 'Superhost' : 'Regular host'
              const point = projection([d.longitude!, d.latitude!])
              if (!point) return null
              const hover = {
                title: `Listing ${d.listing_id}`,
                rows: [
                  { label: 'Neighbourhood', value: d.neighbourhood_cleansed },
                  { label: 'LTM reviews', value: formatNumber(d.number_of_reviews_ltm) },
                  { label: 'Host type', value: label },
                ],
              }

              return (
                <circle
                  key={d.listing_id}
                  cx={point[0]}
                  cy={point[1]}
                  r={r(d.number_of_reviews_ltm)}
                  fill={superhostColor(label)}
                  opacity=".74"
                  stroke="white"
                  strokeWidth="1.4"
                  onMouseEnter={e => {
                    const rect = (e.currentTarget.ownerSVGElement ?? e.currentTarget).getBoundingClientRect()
                    setHoverCard({ x: e.clientX - rect.left + 16, y: e.clientY - rect.top - 18, ...hover })
                  }}
                  onMouseMove={e => {
                    const rect = (e.currentTarget.ownerSVGElement ?? e.currentTarget).getBoundingClientRect()
                    setHoverCard(current => current ? { ...current, x: e.clientX - rect.left + 16, y: e.clientY - rect.top - 18, ...hover } : null)
                  }}
                  onMouseLeave={() => setHoverCard(null)}
                />
              )
            })}
          </svg>
          {hoverCard ? <HoverCard {...hoverCard} /> : null}
        </div>
        <div className="task5-target-table" role="table" aria-label="Top Superhost acquisition target neighbourhoods">
          <div role="row" className="task5-target-row header">
            <span>Neighbourhood</span><span>High-review regular hosts</span><span>Top-tier Superhosts</span><span>Superhost share</span><span>Gap score</span>
          </div>
          {topTargets.map(row => (
            <button
              id={`task5-target-${row.neighbourhood_cleansed.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`}
              type="button"
              role="row"
              key={row.neighbourhood_cleansed}
              className={`task5-target-row${neighbourhood === row.neighbourhood_cleansed ? ' active' : ''}`}
              onClick={() => setNeighbourhood(row.neighbourhood_cleansed)}
            >
              <span>{row.neighbourhood_cleansed}</span>
              <span>{formatNumber(row.top_tier_regular_count)}</span>
              <span>{formatNumber(row.top_tier_superhost_count)}</span>
              <span>{formatPercent(row.superhost_share)}</span>
              <span>{formatNumber(row.gap_score)}</span>
            </button>
          ))}
        </div>
      </div>
    </ChartWorkspace>
  )
}
