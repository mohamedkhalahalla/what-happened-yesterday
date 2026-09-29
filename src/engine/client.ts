/**
 * Main-thread handle on the engine worker, with latest-wins semantics.
 *
 * Dragging a date range fires a query per frame. Without ordering guarantees
 * the UI flickers between stale and fresh numbers whenever an earlier query
 * happens to finish later. So every call takes a ticket, and a response whose
 * ticket has since been superseded resolves to `{ stale: true }` instead of a
 * result — the caller simply ignores it and keeps what it has.
 *
 * `aggregate` and `drill` keep separate tickets: a drill-down finishing does
 * not invalidate the KPI numbers on screen, and vice versa.
 *
 * ## Latest-wins has to span `init`
 *
 * Tickets alone were not enough, and the gap shipped a bug. Replacing the
 * dataset is also a kind of "newer request": a query issued a moment before
 * `init` is answered from the quarter that is being thrown away, and by its own
 * ticket it is the newest query there is — so it was accepted, and the
 * dashboard showed one quarter's numbers under another quarter's URL.
 *
 * So every call also records the **generation** of the dataset it was issued
 * against, and a response whose generation has since been replaced is stale
 * whatever its ticket says. Note that a query posted *after* `init` is safe
 * without any of this: the worker processes messages in order, so it is
 * answered from the new dataset.
 */

import * as Comlink from 'comlink'

import type { Dataset } from '../data/types'
import type { EngineApi } from './engine.worker'
import type { SortDirection, SortKey, SortRanks } from './sort'
import type { Aggregates, DrillTarget, Query } from './types'

/** Returned in place of a result when a newer request has already been made. */
export type Stale = { stale: true }

export type AggregateResult =
  | Stale
  | {
      stale: false
      result: Aggregates
      /** Time spent aggregating inside the worker. */
      workerMs: number
      /** Wall-clock time from the call to the response, postMessage included. */
      roundTripMs: number
    }

export type DrillResult =
  | Stale
  | {
      stale: false
      rows: Uint32Array
      workerMs: number
      roundTripMs: number
    }

export type SortResult = DrillResult

export function isStale(result: { stale: boolean }): result is Stale {
  return result.stale
}

export class EngineClient {
  private readonly worker: Worker
  private readonly api: Comlink.Remote<EngineApi>

  // One ticket counter per request kind; only the newest ticket is honoured.
  private latestAggregate = 0
  private latestDrill = 0
  private latestSort = 0

  /**
   * Which dataset the worker holds, counting from the first `init`.
   *
   * Incremented when a new one is *requested*, not when it arrives: the point
   * is to invalidate everything already in flight against the old one.
   */
  private generation = 0

  constructor() {
    this.worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' })
    this.api = Comlink.wrap<EngineApi>(this.worker)
  }

  /**
   * Build a dataset in the worker and get the main thread's own copy of it.
   *
   * Every call bumps the generation, which strands every query already in
   * flight — see the note at the top of this file. Callers still need their
   * own guard for two inits racing each other; this one is about everything
   * else the worker was in the middle of.
   */
  async init(seed?: number): Promise<Dataset> {
    this.generation++
    return await this.api.init(seed)
  }

  async aggregate(query: Query): Promise<AggregateResult> {
    const ticket = ++this.latestAggregate
    const generation = this.generation
    const startedAt = performance.now()

    const { result, ms } = await this.api.aggregate(query)
    const roundTripMs = performance.now() - startedAt

    if (ticket !== this.latestAggregate || generation !== this.generation) return { stale: true }
    return { stale: false, result, workerMs: ms, roundTripMs }
  }

  async drill(query: Query, target: DrillTarget): Promise<DrillResult> {
    const ticket = ++this.latestDrill
    const generation = this.generation
    const startedAt = performance.now()

    const { rows, ms } = await this.api.drill(query, target)
    const roundTripMs = performance.now() - startedAt

    if (ticket !== this.latestDrill || generation !== this.generation) return { stale: true }
    return { stale: false, rows, workerMs: ms, roundTripMs }
  }

  /**
   * Reorder a row list in the worker.
   *
   * `rows` is transferred, so it is detached here the moment this is called —
   * callers hold the result, never the input.
   */
  async sort(
    rows: Uint32Array,
    key: SortKey,
    direction: SortDirection,
    ranks: SortRanks,
  ): Promise<SortResult> {
    const ticket = ++this.latestSort
    const generation = this.generation
    const startedAt = performance.now()

    const response = await this.api.sort(
      Comlink.transfer(rows, [rows.buffer]),
      key,
      direction,
      ranks,
    )
    const roundTripMs = performance.now() - startedAt

    if (ticket !== this.latestSort || generation !== this.generation) return { stale: true }
    return { stale: false, rows: response.rows, workerMs: response.ms, roundTripMs }
  }

  /** Tear the worker down. In-flight calls never resolve after this. */
  dispose(): void {
    this.worker.terminate()
  }
}
