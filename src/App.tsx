import { useEffect, useState } from 'react'

import { isoToDayIndex } from './lib/time/riyadh'
import { EngineClient } from './engine/client'
import type { Aggregates } from './engine/types'

/** The last full week in the dataset: Sunday 2026-09-20 to Saturday 2026-09-26. */
const LAST_FULL_WEEK = {
  from: isoToDayIndex('2026-09-20'),
  to: isoToDayIndex('2026-09-26'),
}

type Probe = {
  current: Aggregates['current']
  previous: Aggregates['previous']
  workerMs: number
  roundTripMs: number
}

/**
 * Temporary scaffolding: proves the worker round-trip end to end and shows the
 * two timings. The real dashboard replaces all of this in the next step.
 */
export default function App() {
  const [probe, setProbe] = useState<Probe | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const client = new EngineClient()
    let cancelled = false

    void (async () => {
      try {
        await client.init()
        const response = await client.aggregate({
          range: LAST_FULL_WEEK,
          agents: [],
          intents: [],
          languages: [],
        })
        if (cancelled || response.stale) return

        setProbe({
          current: response.result.current,
          previous: response.result.previous,
          workerMs: response.workerMs,
          roundTripMs: response.roundTripMs,
        })
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
      }
    })()

    return () => {
      cancelled = true
      client.dispose()
    }
  }, [])

  return (
    <>
      <h1>ماذا حدث أمس؟</h1>
      {error !== null && <pre dir="ltr">{error}</pre>}
      {probe === null && error === null && <pre dir="ltr">loading…</pre>}
      {probe !== null && (
        <pre dir="ltr">
          {[
            '2026-09-20 .. 2026-09-26 (no filters)',
            '',
            `worker ms      ${probe.workerMs.toFixed(2)}`,
            `round-trip ms  ${probe.roundTripMs.toFixed(2)}`,
            '',
            'current   ' + JSON.stringify(probe.current, null, 2),
            'previous  ' + JSON.stringify(probe.previous, null, 2),
          ].join('\n')}
        </pre>
      )}
    </>
  )
}
