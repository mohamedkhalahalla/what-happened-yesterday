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

  constructor() {
    this.worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' })
    this.api = Comlink.wrap<EngineApi>(this.worker)
  }

  /**
   * Build the dataset in the worker and get the main thread's own copy of it.
   * Not latest-wins: it is called once, and everything else depends on it.
   */
  async init(seed?: number): Promise<Dataset> {
    return await this.api.init(seed)
  }

  async aggregate(query: Query): Promise<AggregateResult> {
    const ticket = ++this.latestAggregate
    const startedAt = performance.now()

    const { result, ms } = await this.api.aggregate(query)
    const roundTripMs = performance.now() - startedAt

    if (ticket !== this.latestAggregate) return { stale: true }
    return { stale: false, result, workerMs: ms, roundTripMs }
  }

  async drill(query: Query, target: DrillTarget): Promise<DrillResult> {
    const ticket = ++this.latestDrill
    const startedAt = performance.now()

    const { rows, ms } = await this.api.drill(query, target)
    const roundTripMs = performance.now() - startedAt

    if (ticket !== this.latestDrill) return { stale: true }
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
    const startedAt = performance.now()

    const response = await this.api.sort(
      Comlink.transfer(rows, [rows.buffer]),
      key,
      direction,
      ranks,
    )
    const roundTripMs = performance.now() - startedAt

    if (ticket !== this.latestSort) return { stale: true }
    return { stale: false, rows: response.rows, workerMs: response.ms, roundTripMs }
  }

  /** Tear the worker down. In-flight calls never resolve after this. */
  dispose(): void {
    this.worker.terminate()
  }
}
