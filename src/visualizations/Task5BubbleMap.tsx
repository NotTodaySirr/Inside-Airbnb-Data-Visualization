import * as d3 from 'd3'
import { useMemo, useState } from 'react'
import { ChartWorkspace, ToolboxControl, ToolboxSection } from '../components/ChartLayout'
import { useCsvData } from '../data/useCsvData'
import { useJsonData } from '../data/useJsonData'
import type { Task5NeighbourhoodOpportunityRow } from '../types/charts'
import { EmptyState, HoverCard } from './chartHelpers'
import type { HoverCardProps } from './chartHelpers'
import { chartMargins, wideChart } from './chartScales'

type NeighbourhoodFeature = GeoJSON.Feature<GeoJSON.Geometry, {
  neighbourhood?: string
  neighbourhood_group?: string
}>
type NeighbourhoodGeoJson = GeoJSON.FeatureCollection<GeoJSON.Geometry, NeighbourhoodFeature['properties']>
type HoverCardState = HoverCardProps

const ROOM_TYPES = ['All', 'Entire home/apt', 'Private room', 'Shared room', 'Hotel room']

function formatCurrency(v: number) { return v > 0 ? `$${v.toFixed(0)}` : '—' }
function formatPct(v: number) { return `${v.toFixed(1)}%` }
function formatNum(v: number) { return v.toLocaleString(undefined, { maximumFractionDigits: 1 }) }

export function Task5BubbleMap() {
  const oppState = useCsvData<Task5NeighbourhoodOpportunityRow>('/data/derived/task5_neighbourhood_opportunity.csv')
  const geoState = useJsonData<NeighbourhoodGeoJson>('/data/neighbourhoods.geojson')

  const [borough, setBorough] = useState('All')
  const [roomType, setRoomType] = useState('All')
  const [priceMin, setPriceMin] = useState(0)
  const [priceMax, setPriceMax] = useState(99999)
  const [selectedNeighbourhood, setSelectedNeighbourhood] = useState<string | null>(null)
  const [hoverCard, setHoverCard] = useState<HoverCardState | null>(null)

  // All hooks must run unconditionally before any early return
  const data = oppState.status === 'loaded' ? oppState.data : []
  const geoData = geoState.status === 'loaded' ? geoState.data : null

  const boroughs = useMemo(
    () => ['All', ...Array.from(new Set(data.map(d => d.borough).filter(Boolean))).sort()],
    [data]
  )
  const globalPriceMax = useMemo(
    () => Math.ceil(d3.max(data, d => d.avg_price) ?? 500),
    [data]
  )
  const filtered = useMemo(() => data.filter(d => {
    if (borough !== 'All' && d.borough !== borough) return false
    if (roomType !== 'All' && d.dominant_room_type !== roomType) return false
    if (d.avg_price < priceMin || (priceMax < 99999 && d.avg_price > priceMax)) return false
    return true
  }), [data, borough, roomType, priceMin, priceMax])

  const oppByName = useMemo(
    () => new Map(filtered.map(d => [d.neighbourhood_cleansed, d])),
    [filtered]
  )
  const [minScore, maxScore] = useMemo(() => {
    const scores = filtered.map(d => d.opportunity_score)
    return [d3.min(scores) ?? 0, d3.max(scores) ?? 1]
  }, [filtered])

  const colorScale = useMemo(
    () => d3.scaleSequential([minScore, maxScore], d3.interpolateYlOrRd),
    [minScore, maxScore]
  )
  const top10 = useMemo(
    () => [...filtered].sort((a, b) => d3.descending(a.opportunity_score, b.opportunity_score)).slice(0, 10),
    [filtered]
  )
  const { width, height } = wideChart
  const projection = useMemo(() => {
    if (!geoData) return null
    return d3.geoMercator().fitExtent(
      [[chartMargins.left, chartMargins.top], [width - chartMargins.right, height - chartMargins.bottom]],
      geoData as d3.GeoPermissibleObjects,
    )
  }, [geoData, width, height])

  const path = useMemo(
    () => projection ? d3.geoPath(projection) : null,
    [projection]
  )

  // Early returns AFTER all hooks
  if (oppState.status === 'loading' || geoState.status === 'loading') {
    return <div className="loading-state">Loading neighbourhood heatmap…</div>
  }
  if (oppState.status === 'error') return <EmptyState title="Could not load opportunity data" message={oppState.error} />
  if (geoState.status === 'error') return <EmptyState title="Could not load neighbourhood boundaries" message={geoState.error} />
  if (!geoData || !path) return <EmptyState title="Map unavailable" message="GeoJSON data could not be projected." />

  const resetFilters = () => {
    setBorough('All')
    setRoomType('All')
    setPriceMin(0)
    setPriceMax(99999)
    setSelectedNeighbourhood(null)
  }

  const activeSummary = [
    borough !== 'All' ? borough : 'All boroughs',
    roomType !== 'All' ? roomType : 'All room types',
    priceMax < 99999 ? `$${priceMin}–$${priceMax}` : null,
  ].filter(Boolean).join(' · ')

  const toolbox = (
    <>
      <ToolboxSection title="Geography">
        <ToolboxControl label="Borough">
          <select id="task5-borough" value={borough} onChange={e => { setBorough(e.target.value); setSelectedNeighbourhood(null) }}>
            {boroughs.map(b => <option key={b}>{b}</option>)}
          </select>
        </ToolboxControl>
      </ToolboxSection>

      <ToolboxSection title="Listing Type">
        <ToolboxControl label="Room type">
          <select id="task5-room-type" value={roomType} onChange={e => setRoomType(e.target.value)}>
            {ROOM_TYPES.map(r => <option key={r}>{r}</option>)}
          </select>
        </ToolboxControl>
      </ToolboxSection>

      <ToolboxSection title="Price Range">
        <ToolboxControl label={`Min $${priceMin}`}>
          <input
            id="task5-price-min"
            type="range" min={0} max={globalPriceMax} step={10}
            value={priceMin}
            onChange={e => setPriceMin(Math.min(Number(e.target.value), priceMax - 10))}
          />
        </ToolboxControl>
        <ToolboxControl label={`Max ${priceMax >= 99999 ? '∞' : `$${priceMax}`}`}>
          <input
            id="task5-price-max"
            type="range" min={0} max={globalPriceMax} step={10}
            value={Math.min(priceMax, globalPriceMax)}
            onChange={e => setPriceMax(Math.max(Number(e.target.value), priceMin + 10))}
          />
        </ToolboxControl>
      </ToolboxSection>

      <button className="toolbox-reset" type="button" onClick={resetFilters}>Reset filters</button>
    </>
  )

  return (
    <ChartWorkspace
      toolbox={toolbox}
      activeSummary={activeSummary}
      caption={`Opportunity score = normalised demand + price potential + availability − competition. Showing ${filtered.length} of ${data.length} neighbourhoods.`}
    >
      <div className="task-chart-shell">
        {/* Colour legend */}
        <div className="opportunity-legend" aria-label="Opportunity score colour scale">
          <span className="legend-label">Low opportunity</span>
          <div className="legend-gradient" />
          <span className="legend-label">High opportunity</span>
        </div>

        <div className="task-plot-wrap">
          <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Neighbourhood opportunity heatmap">
            <rect
              x={chartMargins.left} y={chartMargins.top}
              width={width - chartMargins.left - chartMargins.right}
              height={height - chartMargins.top - chartMargins.bottom}
              rx="28" className="map-panel"
            />
            {geoData.features.map((feature, index) => {
              const name = feature.properties?.neighbourhood ?? ''
              const row = oppByName.get(name)
              const isSelected = selectedNeighbourhood === name
              const isDimmed = selectedNeighbourhood !== null && !isSelected
              const fill = row ? colorScale(row.opportunity_score) : 'rgba(30,41,59,.55)'

              const hover = row ? {
                title: name,
                rows: [
                  { label: 'Borough', value: row.borough || '—' },
                  { label: 'Opportunity Score', value: formatNum(row.opportunity_score) },
                  { label: 'Avg Price', value: formatCurrency(row.avg_price) },
                  { label: 'Listing Count', value: formatNum(row.listing_count) },
                  { label: 'Avg Availability', value: formatPct(row.avg_availability_pct) },
                  { label: 'Avg Reviews LTM', value: formatNum(row.avg_reviews_ltm) },
                  { label: 'Total Reviews', value: formatNum(row.total_reviews) },
                  { label: 'Dominant Room Type', value: row.dominant_room_type },
                ],
              } : {
                title: name || 'Neighbourhood',
                rows: [{ label: 'Status', value: 'Outside current filter' }],
              }

              return (
                <path
                  key={`${name}-${index}`}
                  className={[
                    'neighbourhood-polygon',
                    isSelected ? 'active' : '',
                    isDimmed ? 'dimmed' : '',
                    !row ? 'no-data' : '',
                  ].filter(Boolean).join(' ')}
                  d={path(feature) ?? undefined}
                  fill={fill}
                  onClick={() => setSelectedNeighbourhood(isSelected ? null : name)}
                  onMouseEnter={e => {
                    const rect = (e.currentTarget.ownerSVGElement ?? e.currentTarget).getBoundingClientRect()
                    setHoverCard({ x: e.clientX - rect.left + 16, y: e.clientY - rect.top - 18, ...hover })
                  }}
                  onMouseMove={e => {
                    const rect = (e.currentTarget.ownerSVGElement ?? e.currentTarget).getBoundingClientRect()
                    setHoverCard(cur => cur ? { ...cur, x: e.clientX - rect.left + 16, y: e.clientY - rect.top - 18, ...hover } : null)
                  }}
                  onMouseLeave={() => setHoverCard(null)}
                />
              )
            })}
          </svg>
          {hoverCard ? <HoverCard {...hoverCard} /> : null}
        </div>

        {/* Top 10 opportunities table */}
        <div className="task5-opportunity-table" role="table" aria-label="Top neighbourhood opportunities">
          <div role="row" className="task5-opp-row header">
            <span>Neighbourhood</span>
            <span>Borough</span>
            <span>Score</span>
            <span>Avg Price</span>
            <span>Listings</span>
            <span>Availability</span>
            <span>Reviews LTM</span>
          </div>
          {top10.map(row => (
            <button
              id={`task5-opp-${row.neighbourhood_cleansed.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`}
              type="button"
              role="row"
              key={row.neighbourhood_cleansed}
              className={`task5-opp-row${selectedNeighbourhood === row.neighbourhood_cleansed ? ' active' : ''}`}
              onClick={() => setSelectedNeighbourhood(
                selectedNeighbourhood === row.neighbourhood_cleansed ? null : row.neighbourhood_cleansed
              )}
            >
              <span>{row.neighbourhood_cleansed}</span>
              <span>{row.borough || '—'}</span>
              <span>{formatNum(row.opportunity_score)}</span>
              <span>{formatCurrency(row.avg_price)}</span>
              <span>{formatNum(row.listing_count)}</span>
              <span>{formatPct(row.avg_availability_pct)}</span>
              <span>{formatNum(row.avg_reviews_ltm)}</span>
            </button>
          ))}
        </div>
      </div>
    </ChartWorkspace>
  )
}
