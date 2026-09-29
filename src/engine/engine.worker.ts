/**
 * The engine, moved off the main thread.
 *
 * The dataset lives here and only here. Aggregating 200k rows takes a few
 * milliseconds, but the director will drag a date slider, and a few
 * milliseconds per frame on the UI thread is a dropped frame per frame. So the
 * worker owns the data and the main thread only ever receives small results.
 *
 * Comlink handles the message plumbing: whatever an exposed method returns is
 * structured-cloned back to the caller, unless it is explicitly transferred.
 */

import * as Comlink from 'comlink'

import { generateDataset } from '../data/generate'
import type { Dataset } from '../data/types'
import { aggregate, drill } from './aggregate'
import { sortRows, type SortDirection, type SortKey, type SortRanks } from './sort'
import type { Aggregates, DrillTarget, Query } from './types'

/** Result of a worker call, with the time the worker itself spent on it. */
export type Timed<T> = T & { ms: number }

/** Set by {@link init}; every other method needs it. */
let dataset: Dataset | null = null

function requireDataset(): Dataset {
  if (dataset === null) {
    throw new Error('Engine worker used before init(); call init() first.')
  }
  return dataset
}

const api = {
  /**
   * Generate the dataset inside the worker and keep it here.
   *
   * The return value is structured-cloned on its way out, so the main thread
   * gets its own copy of every typed array while the worker keeps the original
   * — deliberately *not* transferred, which would leave the worker with
   * detached buffers. The copy is what the main thread renders table rows from.
   */
  init(seed?: number): Dataset {
    dataset = generateDataset(seed)
    return dataset
  },

  aggregate(query: Query): Timed<{ result: Aggregates }> {
    const ds = requireDataset()
    const startedAt = performance.now()
    const result = aggregate(ds, query)
    return { result, ms: performance.now() - startedAt }
  },

  drill(query: Query, target: DrillTarget): Timed<{ rows: Uint32Array }> {
    const ds = requireDataset()
    const startedAt = performance.now()
    const rows = drill(ds, query, target)
    const ms = performance.now() - startedAt

    // Row lists can be six figures long; hand the buffer over instead of
    // copying it. Safe because `drill` allocates a fresh array every call.
    return Comlink.transfer({ rows, ms }, [rows.buffer])
  },

  /**
   * Reorder a row list. The caller supplies localized ranks for the code
   * columns — see sort.ts for why the worker cannot work them out itself.
   *
   * `rows` arrives transferred, so the caller must not touch it afterwards;
   * the sorted array is transferred back.
   */
  sort(
    rows: Uint32Array,
    key: SortKey,
    direction: SortDirection,
    ranks: SortRanks,
  ): Timed<{ rows: Uint32Array }> {
    const ds = requireDataset()
    const startedAt = performance.now()
    const sorted = sortRows(ds, rows, key, direction, ranks)

    return Comlink.transfer({ rows: sorted, ms: performance.now() - startedAt }, [sorted.buffer])
  },
}

/** The shape `client.ts` wraps with `Comlink.wrap<EngineApi>`. */
export type EngineApi = typeof api

Comlink.expose(api)
