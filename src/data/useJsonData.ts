import { useEffect, useState } from 'react'
import * as d3 from 'd3'
import type { LoadState } from '../types/charts'

export function useJsonData<T>(url: string): LoadState<T> {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    d3.json(url)
      .then((data) => {
        if (!cancelled) setState({ status: 'loaded', data: data as T })
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({ status: 'error', error: error instanceof Error ? error.message : 'Unable to load JSON data' })
        }
      })

    return () => {
      cancelled = true
    }
  }, [url])

  return state
}
