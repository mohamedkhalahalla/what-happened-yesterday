/**
 * The seed as state, and the dataset that follows from it.
 *
 * Regenerating is the one operation in this app that throws away everything
 * the engine holds, so it is the one place where "keep the old view until the
 * new one is ready" has to be deliberate. Blanking the dashboard for the
 * second it takes to build 200,000 calls would make a demo control look like
 * a crash.
 *
 * ## The dataset arrives as one thing
 *
 * `dataset`, `bounds`, the seed it was built from and the generation counter
 * are a single piece of state, set in one call. Four `useState`s would let a
 * render see three of them updated and one not, and "which quarter is this?"
 * would have four answers that are briefly different — which is the shape of
 * the bug this hook shipped: the seed had moved on while the numbers had not.
 *
 * `generation` is what the aggregate layer keys on. It counts datasets that
 * have actually **arrived**, never ones that were asked for: keying a refetch
 * on the requested seed is what left the dashboard showing the previous
 * quarter, because by the time the new dataset landed the key had already
 * changed and nothing re-ran.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { SEED } from '../data/config'
import type { Dataset } from '../data/types'
import type { EngineClient } from '../engine/client'
import { boundsOf, type DataBounds } from '../state/presets'
import { parseSeed, randomSeed, searchWithSeed } from './seed'
import { pushSearch, useUrlSearch } from './useFilterState'

export type SeedHandle = {
  /** What the URL asks for. */
  seed: number
  /**
   * What the worker actually built, read off the dataset itself. `null` before
   * the first one arrives. The footer shows this rather than the request.
   */
  usedSeed: number | null
  /** True when the URL named a seed that could not be read. */
  invalid: boolean
  dataset: Dataset | null
  bounds: DataBounds | null
  /**
   * Counts the datasets that have arrived. Anything derived from the data must
   * key on this rather than on {@link SeedHandle.seed}.
   */
  generation: number
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

  /** One dataset and everything that is true about it, set together. */
  type Loaded = {
    dataset: Dataset
    bounds: DataBounds
    /** Read back off the dataset, not remembered from the request. */
    seed: number
    generation: number
  }

  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)

  /*
   * Which request is current. A reader who presses Shuffle twice quickly
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
        const dataset = await client.init(seed)
        if (cancelled || mine !== ticket.current) return

        setLoaded((previous) => ({
          dataset,
          bounds: boundsOf(dataset),
          // The worker's own answer about what it built. If this ever differs
          // from `seed`, the footer shows the truth rather than the request.
          seed: dataset.seed,
          generation: (previous?.generation ?? 0) + 1,
        }))
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
  const generating = error === null && loaded?.seed !== seed

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
    usedSeed: loaded?.seed ?? null,
    invalid: parsed.invalid,
    dataset: loaded?.dataset ?? null,
    bounds: loaded?.bounds ?? null,
    generation: loaded?.generation ?? 0,
    generating,
    error,
    shuffle,
    reset,
  }
}
