import { useEffect, useRef, useState } from 'react'
import {
  axisBottom,
  axisLeft,
  max,
  scaleBand,
  scaleLinear,
  scaleOrdinal,
  schemeTableau10,
  select,
} from 'd3'
import type { CategoricalDatum } from '../data/sampleData'

type BarChartProps = {
  data: CategoricalDatum[]
  xLabel: string
  yLabel: string
  colorLabel?: string
  width?: number
  height?: number
}

type HoveredBar = {
  category: string
  value: number
  group?: string
  x: number
  y: number
}

const margin = {
  top: 24,
  right: 24,
  bottom: 44,
  left: 64,
}

export function BarChart({
  data,
  xLabel,
  yLabel,
  colorLabel = 'Group',
  width = 860,
  height = 420,
}: BarChartProps) {
  const xAxisRef = useRef<SVGGElement>(null)
  const yAxisRef = useRef<SVGGElement>(null)
  const [hoveredBar, setHoveredBar] = useState<HoveredBar | null>(null)

  const innerWidth = width - margin.left - margin.right
  const innerHeight = height - margin.top - margin.bottom

  const xScale = scaleBand<string>()
    .domain(data.map((datum) => datum.category))
    .range([0, innerWidth])
    .padding(0.22)

  const yScale = scaleLinear()
    .domain([0, max(data, (datum) => datum.value) ?? 0])
    .nice()
    .range([innerHeight, 0])

  const groups = Array.from(
    new Set(data.map((datum) => datum.group).filter(Boolean)),
  ) as string[]

  const colorScale = scaleOrdinal<string>()
    .domain(groups)
    .range(schemeTableau10)

  useEffect(() => {
    if (!xAxisRef.current) return

    select(xAxisRef.current).call(axisBottom(xScale).tickSizeOuter(0))
  }, [xScale])

  useEffect(() => {
    if (!yAxisRef.current) return

    select(yAxisRef.current).call(
      axisLeft(yScale)
        .ticks(5)
        .tickFormat((value) => Number(value).toLocaleString()),
    )
  }, [yScale])

  return (
    <>
      {groups.length > 0 ? (
        <ul className="chart-legend" aria-label={`${colorLabel} legend`}>
          {groups.map((group) => (
            <li key={group}>
              <span style={{ background: colorScale(group) }} />
              {group}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="chart-frame">
        <svg
          className="bar-chart"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`Bar chart comparing ${yLabel.toLowerCase()} by ${xLabel.toLowerCase()}.`}
        >
          <g transform={`translate(${margin.left}, ${margin.top})`}>
            <g className="grid-lines" aria-hidden="true">
              {yScale.ticks(5).map((tick) => (
                <line
                  key={tick}
                  x1={0}
                  x2={innerWidth}
                  y1={yScale(tick)}
                  y2={yScale(tick)}
                />
              ))}
            </g>

            {data.map((datum, index) => {
              const x = xScale(datum.category) ?? 0
              const y = yScale(datum.value)
              const barHeight = innerHeight - y
              const barWidth = xScale.bandwidth()
              const fill = datum.group ? colorScale(datum.group) : undefined

              return (
                <rect
                  className="bar-chart__bar"
                  key={`${datum.category}-${datum.group ?? 'ungrouped'}-${index}`}
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  rx={10}
                  style={fill ? { fill } : undefined}
                  onMouseEnter={() =>
                    setHoveredBar({
                      category: datum.category,
                      value: datum.value,
                      group: datum.group,
                      x: x + barWidth / 2,
                      y,
                    })
                  }
                  onMouseLeave={() => setHoveredBar(null)}
                />
              )
            })}

            {hoveredBar ? (
              <g
                className="chart-tooltip"
                transform={`translate(${hoveredBar.x}, ${hoveredBar.y - 16})`}
              >
                <text textAnchor="middle">
                  {hoveredBar.category}: {hoveredBar.value.toLocaleString()}
                  {hoveredBar.group ? ` (${hoveredBar.group})` : ''}
                </text>
              </g>
            ) : null}

            <text
              className="axis-label"
              x={innerWidth / 2}
              y={innerHeight + 40}
              textAnchor="middle"
            >
              {xLabel}
            </text>
            <text
              className="axis-label"
              x={-innerHeight / 2}
              y={-46}
              textAnchor="middle"
              transform="rotate(-90)"
            >
              {yLabel}
            </text>

            <g
              className="chart-axis"
              ref={xAxisRef}
              transform={`translate(0, ${innerHeight})`}
            />
            <g className="chart-axis" ref={yAxisRef} />
          </g>
        </svg>
      </div>
    </>
  )
}
