import * as d3 from 'd3'
import { useCallback, useMemo, useRef, useState } from 'react'
import { ChartWorkspace, ToolboxControl, ToolboxSection } from '../components/ChartLayout'
import { useCsvData } from '../data/useCsvData'
import { useJsonData } from '../data/useJsonData'
import type { Task5SpatialListingRow, Task5SuperhostGapRow } from '../types/charts'
import { EmptyState, HoverCard, Legend } from './chartHelpers'
import type { HoverCardProps } from './chartHelpers'
import { chartMargins, wideChart } from './chartScales'

// ─── GeoJSON types ────────────────────────────────────────────────────────────
type NeighbourhoodFeature = GeoJSON.Feature<GeoJSON.Geometry, {
  neighbourhood?: string
  neighbourhood_group?: string
}>
type NeighbourhoodGeoJson = GeoJSON.FeatureCollection<GeoJSON.Geometry, NeighbourhoodFeature['properties']>

// ─── constants ────────────────────────────────────────────────────────────────
const ROOM_TYPES = ['All', 'Entire home/apt', 'Private room', 'Shared room', 'Hotel room']
const SUPERHOST_COLOR = '#f59e0b'   // warm amber for density
const CANDIDATE_COLOR = '#22d3ee'   // cyan for acquisition candidates
const LEGEND_ITEMS = ['Superhost density', 'Acquisition candidate']


function legendColor(item: string) {
  return item === 'Superhost density' ? SUPERHOST_COLOR : CANDIDATE_COLOR
}

function fmt$(v: number | null | undefined) {
  if (v == null || isNaN(v)) return '—'
  return `$${v.toFixed(0)}`
}
function fmtNum(v: number) { return v.toLocaleString(undefined, { maximumFractionDigits: 1 }) }
function fmtPct(v: number) { return `${(v * 100).toFixed(1)}%` }

// ─── component ────────────────────────────────────────────────────────────────
export function Task5SuperhostHeatmap() {
  const csvState = useCsvData<Task5SpatialListingRow>('/data/derived/task5_spatial_listings.csv')
  const geoState = useJsonData<NeighbourhoodGeoJson>('/data/neighbourhoods.geojson')

  const [borough, setBorough] = useState('All')
  const [roomType, setRoomType] = useState('All')
  const [percentile, setPercentile] = useState(90)
  const [selectedNeighbourhood, setSelectedNeighbourhood] = useState<string | null>(null)
  const [hoverCard, setHoverCard] = useState<HoverCardProps | null>(null)
  const [transform, setTransform] = useState<d3.ZoomTransform>(d3.zoomIdentity)

  // refs for d3-zoom
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const svgNodeRef = useRef<SVGSVGElement | null>(null)

  // Callback ref: fires when the SVG element actually mounts (after data loads).
  // This is the correct pattern when the element is conditionally rendered.
  const svgRef = useCallback((node: SVGSVGElement | null) => {
    if (svgNodeRef.current && zoomRef.current) {
      // cleanup previous
      d3.select(svgNodeRef.current).on('.zoom', null)
    }
    svgNodeRef.current = node
    if (!node) return
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 12])
      .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        setTransform(event.transform)
      })
    zoomRef.current = zoom
    d3.select(node).call(zoom)
  }, [])

  // ── all hooks before early returns ──────────────────────────────────────────
  const allRows = csvState.status === 'loaded' ? csvState.data : []
  const geoData = geoState.status === 'loaded' ? geoState.data : null

  const boroughs = useMemo(
    () => ['All', ...Array.from(new Set(allRows.map(d => d.borough).filter(Boolean))).sort()],
    [allRows]
  )

  // Apply borough + room type filters
  const filtered = useMemo(() => allRows.filter(d => {
    if (borough !== 'All' && d.borough !== borough) return false
    if (roomType !== 'All' && d.room_type !== roomType) return false
    return true
  }), [allRows, borough, roomType])

  // Compute percentile threshold client-side
  const threshold = useMemo(() => {
    if (!filtered.length) return 0
    const sorted = filtered.map(d => d.number_of_reviews_ltm).sort(d3.ascending)
    return d3.quantileSorted(sorted, percentile / 100) ?? 0
  }, [filtered, percentile])

  const topTier = useMemo(
    () => filtered.filter(d => d.number_of_reviews_ltm >= threshold),
    [filtered, threshold]
  )
  const superhostPoints = useMemo(
    () => topTier.filter(d => d.host_is_superhost),
    [topTier]
  )
  const candidatePoints = useMemo(
    () => topTier.filter(d => !d.host_is_superhost),
    [topTier]
  )

  // ── projection ──────────────────────────────────────────────────────────────
  const { width, height } = wideChart
  const projection = useMemo(() => {
    if (!geoData) return null
    return d3.geoMercator().fitExtent(
      [[chartMargins.left, chartMargins.top], [width - chartMargins.right, height - chartMargins.bottom]],
      geoData as d3.GeoPermissibleObjects
    )
  }, [geoData, width, height])

  const path = useMemo(
    () => projection ? d3.geoPath(projection) : null,
    [projection]
  )

  // ── density contours ────────────────────────────────────────────────────────
  const contours = useMemo(() => {
    if (!projection || !superhostPoints.length) return []
    const projected = superhostPoints
      .map(d => {
        const pt = projection([d.longitude, d.latitude])
        return pt ? { x: pt[0], y: pt[1], w: d.number_of_reviews_ltm } : null
      })
      .filter((d): d is { x: number; y: number; w: number } => d !== null)

    if (projected.length < 3) return []

    const densityFn = d3.contourDensity<{ x: number; y: number; w: number }>()
      .x(d => d.x)
      .y(d => d.y)
      .weight(d => d.w)
      .size([width, height])
      .bandwidth(28)
      .thresholds(10)

    return densityFn(projected)
  }, [projection, superhostPoints, width, height])

  const contourColorScale = useMemo(() => {
    const maxVal = d3.max(contours, c => c.value) ?? 1
    return d3.scaleSequential([0, maxVal], d3.interpolateYlOrRd)
  }, [contours])

  // ── candidate point radius scale ────────────────────────────────────────────
  const radiusScale = useMemo(() => {
    const maxR = d3.max(candidatePoints, d => d.number_of_reviews_ltm) ?? threshold
    return d3.scaleSqrt().domain([threshold, Math.max(maxR, threshold + 1)]).range([3, 8]).clamp(true)
  }, [candidatePoints, threshold])

  // ── gap table (client-side) ─────────────────────────────────────────────────
  const gapRows = useMemo((): Task5SuperhostGapRow[] => {
    const byNeighbourhood = d3.group(topTier, d => d.neighbourhood_cleansed)
    const rows: Task5SuperhostGapRow[] = []
    byNeighbourhood.forEach((listings, neighbourhood) => {
      const superhosts = listings.filter(d => d.host_is_superhost).length
      const candidates = listings.filter(d => !d.host_is_superhost).length
      const total = listings.length
      const superhostShare = total > 0 ? superhosts / total : 0
      const gapScore = candidates * (1 - superhostShare)
      const avgReviews = d3.mean(listings, d => d.number_of_reviews_ltm) ?? 0
      rows.push({
        neighbourhood_cleansed: neighbourhood,
        campaign_candidates: candidates,
        top_tier_superhosts: superhosts,
        superhost_share: superhostShare,
        avg_reviews_ltm: avgReviews,
        gap_score: gapScore,
      })
    })
    return rows.sort((a, b) => d3.descending(a.gap_score, b.gap_score)).slice(0, 10)
  }, [topTier])

  // ── early returns after all hooks ───────────────────────────────────────────
  if (csvState.status === 'loading' || geoState.status === 'loading') {
    return <div className="loading-state">Loading Superhost spatial density map…</div>
  }
  if (csvState.status === 'error') return <EmptyState title="Could not load spatial listings" message={csvState.error} />
  if (geoState.status === 'error') return <EmptyState title="Could not load neighbourhood boundaries" message={geoState.error} />
  if (!geoData || !path || !projection) return <EmptyState title="Map unavailable" message="GeoJSON data could not be projected." />

  // ── helpers ─────────────────────────────────────────────────────────────────
  const resetFilters = () => {
    setBorough('All')
    setRoomType('All')
    setPercentile(90)
    setSelectedNeighbourhood(null)
  }

  const resetZoom = () => {
    if (!svgNodeRef.current || !zoomRef.current) return
    d3.select(svgNodeRef.current)
      .transition().duration(400)
      .call(zoomRef.current.transform, d3.zoomIdentity)
  }

  const stepZoom = (factor: number) => {
    if (!svgNodeRef.current || !zoomRef.current) return
    d3.select(svgNodeRef.current)
      .transition().duration(250)
      .call(zoomRef.current.scaleBy, factor)
  }

  const activeSummary = [
    borough !== 'All' ? borough : 'All boroughs',
    roomType !== 'All' ? roomType : 'All room types',
    `P${percentile} (≥ ${threshold.toFixed(0)} reviews LTM)`,
    `${superhostPoints.length} Superhosts`,
    `${candidatePoints.length} candidates`,
  ].join(' · ')

  // ── toolbox ─────────────────────────────────────────────────────────────────
  const toolbox = (
    <>
      <ToolboxSection title="Geography">
        <ToolboxControl label="Borough">
          <select
            id="task5-borough"
            value={borough}
            onChange={e => { setBorough(e.target.value); setSelectedNeighbourhood(null) }}
          >
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

      <ToolboxSection title="Review Threshold">
        <ToolboxControl label={`Percentile: P${percentile} (≥ ${threshold.toFixed(0)} reviews LTM)`}>
          <input
            id="task5-percentile"
            type="range" min={80} max={99} step={1}
            value={percentile}
            onChange={e => setPercentile(Number(e.target.value))}
          />
        </ToolboxControl>
      </ToolboxSection>

      <button className="toolbox-reset" type="button" onClick={resetFilters}>Reset filters</button>
    </>
  )

  // ── render ───────────────────────────────────────────────────────────────────
  return (
    <ChartWorkspace
      toolbox={toolbox}
      activeSummary={activeSummary}
      caption={`Density contours show where top-tier Superhost listings cluster (weighted by reviews LTM). Cyan points are high-review non-Superhost listings — acquisition campaign targets. Top-tier = ≥ P${percentile} (${threshold.toFixed(0)} reviews LTM) among active listings.`}
    >
      <div className="task-chart-shell">
        <Legend items={LEGEND_ITEMS} color={legendColor} />

        <div className="task-plot-wrap" style={{ position: 'relative' }}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label="Superhost spatial density heatmap"
            style={{ cursor: transform.k > 1 ? 'grab' : 'default' }}
          >
            {/* ── map background panel ── */}
            <rect
              x={chartMargins.left} y={chartMargins.top}
              width={width - chartMargins.left - chartMargins.right}
              height={height - chartMargins.top - chartMargins.bottom}
              rx="28" className="map-panel"
            />

            {/* ── zoomable group ── */}
            <g transform={transform.toString()}>

            {/* ── faint neighbourhood polygon outlines (spatial reference) ── */}
            {geoData.features.map((feature, i) => {
              const name = feature.properties?.neighbourhood ?? ''
              const isSelected = selectedNeighbourhood === name
              return (
                <path
                  key={`poly-${i}`}
                  d={path(feature) ?? undefined}
                  fill="none"
                  stroke={isSelected ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.12)'}
                  strokeWidth={isSelected ? 1.5 : 0.6}
                  className="neighbourhood-polygon no-data"
                />
              )
            })}

            {/* ── Superhost density contours ── */}
            {contours.map((contour, i) => (
              <path
                key={`contour-${i}`}
                d={d3.geoPath()(contour) ?? undefined}
                fill={contourColorScale(contour.value)}
                fillOpacity={0.22 + (i / Math.max(contours.length - 1, 1)) * 0.28}
                stroke={contourColorScale(contour.value)}
                strokeOpacity={0.45}
                strokeWidth={0.8}
                style={{ pointerEvents: 'none' }}
              />
            ))}

            {/* ── Acquisition candidate points ── */}
            {candidatePoints.map(d => {
              const pt = projection([d.longitude, d.latitude])
              if (!pt) return null
              const isHighlighted = selectedNeighbourhood === d.neighbourhood_cleansed
              const isDimmed = selectedNeighbourhood !== null && !isHighlighted
              const r = radiusScale(d.number_of_reviews_ltm)

              return (
                <circle
                  key={d.listing_id}
                  cx={pt[0]}
                  cy={pt[1]}
                  r={isHighlighted ? r + 2 : r}
                  fill={CANDIDATE_COLOR}
                  fillOpacity={isDimmed ? 0.15 : isHighlighted ? 0.95 : 0.65}
                  stroke={isHighlighted ? '#fff' : CANDIDATE_COLOR}
                  strokeWidth={isHighlighted ? 1.2 : 0.4}
                  strokeOpacity={isDimmed ? 0.1 : 0.8}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={e => {
                    setHoverCard({
                      x: e.clientX + 16,
                      y: e.clientY - 18,
                      title: d.name || `Listing ${d.listing_id}`,
                      rows: [
                        { label: 'Neighbourhood', value: d.neighbourhood_cleansed },
                        { label: 'Borough', value: d.borough },
                        { label: 'Room type', value: d.room_type },
                        { label: 'Reviews LTM', value: fmtNum(d.number_of_reviews_ltm) },
                        { label: 'Rating', value: d.review_scores_rating != null ? fmtNum(d.review_scores_rating) : '—' },
                        { label: 'Price', value: fmt$(d.price) },
                        { label: 'Host status', value: d.host_group },
                      ],
                    })
                  }}
                  onMouseMove={e => {
                    setHoverCard(cur => cur
                      ? { ...cur, x: e.clientX + 16, y: e.clientY - 18 }
                      : null
                    )
                  }}
                  onMouseLeave={() => setHoverCard(null)}
                />
              )
            })}
            </g>{/* end zoomable group */}
          </svg>

          {/* ── zoom controls overlay ── */}
          <div style={{
            position: 'absolute', top: 12, right: 12,
            display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            {[{ label: '+', factor: 1.5 }, { label: '−', factor: 1 / 1.5 }].map(({ label, factor }) => (
              <button
                key={label}
                type="button"
                onClick={() => stepZoom(factor)}
                style={{
                  width: 28, height: 28,
                  borderRadius: 8,
                  border: '1px solid rgba(125,211,252,.4)',
                  background: 'rgba(15,23,42,.82)',
                  color: '#e2e8f0',
                  fontSize: '1rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                  backdropFilter: 'blur(8px)',
                  lineHeight: 1,
                }}
                aria-label={label === '+' ? 'Zoom in' : 'Zoom out'}
              >
                {label}
              </button>
            ))}
            {transform.k > 1.05 && (
              <button
                type="button"
                onClick={resetZoom}
                style={{
                  width: 28, height: 28,
                  borderRadius: 8,
                  border: '1px solid rgba(251,191,36,.4)',
                  background: 'rgba(15,23,42,.82)',
                  color: '#fbbf24',
                  fontSize: '0.6rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                  backdropFilter: 'blur(8px)',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
                aria-label="Reset zoom"
              >
                RST
              </button>
            )}
          </div>

          {hoverCard && <HoverCard {...hoverCard} />}
        </div>

        {/* ── Neighbourhood gap table ── */}
        {gapRows.length > 0 && (
          <div className="task5-opportunity-table" role="table" aria-label="Superhost acquisition gap by neighbourhood">
            <div role="row" className="task5-opp-row header">
              <span>Neighbourhood</span>
              <span>Candidates</span>
              <span>Superhosts</span>
              <span>SH share</span>
              <span>Avg reviews LTM</span>
              <span>Gap score</span>
            </div>
            {gapRows.map(row => (
              <button
                id={`task5-gap-${row.neighbourhood_cleansed.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`}
                type="button"
                role="row"
                key={row.neighbourhood_cleansed}
                className={`task5-opp-row${selectedNeighbourhood === row.neighbourhood_cleansed ? ' active' : ''}`}
                onClick={() => setSelectedNeighbourhood(
                  selectedNeighbourhood === row.neighbourhood_cleansed ? null : row.neighbourhood_cleansed
                )}
              >
                <span>{row.neighbourhood_cleansed}</span>
                <span>{row.campaign_candidates}</span>
                <span>{row.top_tier_superhosts}</span>
                <span>{fmtPct(row.superhost_share)}</span>
                <span>{fmtNum(row.avg_reviews_ltm)}</span>
                <span>{fmtNum(row.gap_score)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </ChartWorkspace>
  )
}
