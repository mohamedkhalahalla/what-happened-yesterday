/**
 * The seed as state, and the dataset that follows from it.
 *
 * Regenerating is the one operation in this app that throws away everything
 * the engine holds, so it is the one place where "keep the old view until the
 * new one is ready" has to be deliberate. Blanking the dashboard for the
 * second it takes to build 200,000 calls would make a demo control look like
 * a crash.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { SEED } from '../data/config'
import type { Dataset } from '../data/types'
import type { EngineClient } from '../engine/client'
import { boundsOf, type DataBounds } from '../state/presets'
import { parseSeed, randomSeed, searchWithSeed } from './seed'
import { pushSearch, useUrlSearch } from './useFilterState'

export type SeedHandle = {
  seed: number
  /** True when the URL named a seed that could not be read. */
  invalid: boolean
  dataset: Dataset | null
  bounds: DataBounds | null
  /** True while a new quarter is being generated. The old one is still shown. */
  generating: boolean
  error: string | null
  /** A random quarter. Pushes history, so Back returns to the previous data. */
  shuffle: () => void
  /** The quarter the app ships with. */
  reset: () => void
}

export function useSeed(client: EngineClient | null): SeedHandle {
  const search = useUrlSearch()
  const parsed = parseSeed(search)
  const seed = parsed.seed

  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [bounds, setBounds] = useState<DataBounds | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** The seed the dataset on screen was built from. */
  const [loadedSeed, setLoadedSeed] = useState<number | null>(null)

  /*
   * Which generation is current. A reader who presses Shuffle twice quickly
   * starts two builds, and the first to finish is not necessarily the one
   * they asked for last — without a ticket the earlier quarter can land on
   * top of the later one and the URL would then be lying about the data.
   */
  const ticket = useRef(0)

  useEffect(() => {
    if (client === null) return

    const mine = ++ticket.current
    let cancelled = false

    void (async () => {
      try {
        const loaded = await client.init(seed)
        if (cancelled || mine !== ticket.current) return

        setDataset(loaded)
        setBounds(boundsOf(loaded))
        setLoadedSeed(seed)
        setError(null)
      } catch (cause) {
        if (cancelled || mine !== ticket.current) return
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [client, seed])

  /*
   * Derived rather than stored: "the data on screen is not the data the URL
   * asks for" is exactly what being mid-generation means, and a flag would be
   * a second way to say it that could disagree.
   */
  const generating = error === null && loadedSeed !== seed

  const shuffle = useCallback(() => {
    // Pushed, not replaced: a shuffle is somewhere you went, and Back should
    // bring the previous quarter — and its numbers — back.
    pushSearch(searchWithSeed(window.location.search, randomSeed()))
  }, [])

  const reset = useCallback(() => {
    // Writing the default seed removes the parameter, which is what reset
    // means: the URL goes back to saying nothing about the data.
    pushSearch(searchWithSeed(window.location.search, SEED))
  }, [])

  return {
    seed,
    invalid: parsed.invalid,
    dataset,
    bounds,
    generating,
    error,
    shuffle,
    reset,
  }
}
