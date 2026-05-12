type VisualizationDesignProps = {
  source: 'csv' | 'sample'
}

export function VisualizationDesign({ source }: VisualizationDesignProps) {
  return (
    <section className="design-card" aria-labelledby="design-title">
      <div>
        <p className="eyebrow">Visualization design</p>
        <h2 id="design-title">Idiom, mark, channel, and color</h2>
      </div>

      <dl className="design-grid">
        <div>
          <dt>Idiom</dt>
          <dd>
            Vertical bar chart for comparing one numeric value across ordered or
            named categories.
          </dd>
        </div>
        <div>
          <dt>Mark</dt>
          <dd>
            Rectangular bars. Each bar is one row from{' '}
            {source === 'csv' ? 'your cleaned CSV' : 'the fallback sample data'}.
          </dd>
        </div>
        <div>
          <dt>Channels</dt>
          <dd>
            Horizontal position encodes category. Vertical length and y-position
            encode the numeric value.
          </dd>
        </div>
        <div>
          <dt>Color</dt>
          <dd>
            Color encodes the optional group/type/region column. If no group
            exists, bars use one consistent color to avoid inventing meaning.
          </dd>
        </div>
      </dl>
    </section>
  )
}
