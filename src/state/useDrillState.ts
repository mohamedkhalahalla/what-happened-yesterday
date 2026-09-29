/**
 * The drill-down as state: URL in, rows out.
 *
 * Three rules about history, and they are the whole reason this is a hook and
 * not a `useState`:
 *
 * - **Opening pushes.** A drill is somewhere you went, so Back should bring
 *   you out of it. That is free if opening adds an entry.
 * - **Changing a chip or a sort replaces.** Re-sorting a table is not
 *   navigation, and a reader who tried four sorts should not have to press
 *   Back four times to leave.
 * - **Closing consumes the entry it pushed.** `history.back()` when the panel
 *   was opened in-app, so the forward stack stays clean. On a direct load
 *   there is no entry to consume, so the parameter is stripped instead —
 *   going "back" from there would leave the app. That case also has no opener
 *   to return focus to, which is why `close` takes a fallback target.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { AGENTS, INTENTS } from '../data/dictionaries'
import type { Dataset } from '../data/types'
import type { EngineClient } from '../engine/client'
import type { SortDirection, SortKey, SortRanks } from '../engine/sort'
import { agentName, intentLabel } from '../i18n/dictionary'
import type { UiLang } from '../lib/format'
import {
  DRILL_PARAM,
  drillContradictsFilters,
  drillQuery,
  parseDrill,
  serializeDrill,
  withoutOutcome,
  type DrillOutcome,
  type DrillRequest,
} from './drill'
import {
  countOutcomes,
  EMPTY_COUNTS,
  selectOutcome,
  type OutcomeCounts,
} from '../components/drill/OutcomeChips'
import type { DataBounds } from './presets'
import type { FilterState } from './url'
import { pushSearch, replaceSearch, useUrlSearch } from './useFilterState'

const EMPTY_ROWS = new Uint32Array(0)

/**
 * What one round trip produced, tagged with the request it answers.
 *
 * Tagged rather than merely stored so "is this current?" is a comparison
 * instead of a second piece of state: `key !== fetchKey` *is* the loading
 * condition, and there is no way for a flag to disagree with the data.
 */
type Loaded = {
  key: string
  rows: Uint32Array
  counts: OutcomeCounts
  failed: boolean
}

export type DrillStateHandle = {
  request: DrillRequest | null
  /** True when a drill was present in the URL but unreadable. */
  invalid: boolean
  rows: Uint32Array
  counts: OutcomeCounts
  loading: boolean
  /** The worker could not answer. Rows are empty and say nothing about why. */
  failed: boolean
  contradicts: boolean
  sortKey: SortKey
  sortDirection: SortDirection
  openDrill: (request: DrillRequest) => void
  setOutcome: (outcome: DrillOutcome | undefined) => void
  setSort: (key: SortKey) => void
  /** `fallback` receives focus when there is no opener — a direct load. */
  close: (fallback?: HTMLElement | null) => void
}

/**
 * Display-order rank per code for the current language.
 *
 * The worker sorts by these rather than by dictionary code — see `sort.ts` for
 * why it cannot work them out for itself.
 */
function localizedRanks(lang: UiLang): SortRanks {
  const rank = (count: number, label: (code: number) => string): number[] => {
    const order = Array.from({ length: count }, (_, code) => code)
    order.sort((a, b) => label(a).localeCompare(label(b), lang === 'ar' ? 'ar' : 'en'))

    const ranks = new Array<number>(count)
    order.forEach((code, position) => {
      ranks[code] = position
    })
    return ranks
  }

  return {
    agents: rank(AGENTS.length, (code) => agentName(lang, code)),
    intents: rank(INTENTS.length, (code) => intentLabel(lang, code)),
  }
}

/** Replace just the drill parameter, leaving the filters untouched. */
function searchWith(drillValue: string | null): string {
  const params = new URLSearchParams(window.location.search)
  if (drillValue === null || drillValue === '') params.delete(DRILL_PARAM)
  else params.set(DRILL_PARAM, drillValue)

  const query = params.toString()
  return query === '' ? '' : `?${query}`
}

/**
 * Thrown to abandon a round trip whose answer is already out of date.
 *
 * A rejected promise is the honest shape for "stop here": the alternative is
 * a sentinel return value that every caller has to remember to check.
 */
class Superseded extends Error {}

export function useDrillState(
  client: EngineClient | null,
  dataset: Dataset | null,
  filters: FilterState,
  bounds: DataBounds,
  lang: UiLang,
): DrillStateHandle {
  const search = useUrlSearch()

  const parsed = useMemo(
    () => parseDrill(search, filters.range, bounds),
    [search, filters.range, bounds],
  )
  const request = parsed.request

  const [sortKey, setSortKey] = useState<SortKey>('time')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const [loaded, setLoaded] = useState<Loaded | null>(null)

  /** Whether this session opened the panel, or the URL arrived with it. */
  const openedInApp = useRef(false)
  /** What had focus when the panel opened, so closing can give it back. */
  const opener = useRef<HTMLElement | null>(null)

  const contradicts = request !== null && drillContradictsFilters(request, filters)
  const active = client !== null && dataset !== null && request !== null && !contradicts

  /*
   * Everything one fetch depends on, in one string. The request itself by
   * contents rather than identity — `parseDrill` returns a fresh object every
   * render — plus the sort, plus the language, because the localized ranks the
   * worker sorts agents and intents by change with it.
   */
  const fetchKey = active ? `${JSON.stringify(request)}|${sortKey}|${sortDirection}|${lang}` : null

  useEffect(() => {
    if (client === null || dataset === null || request === null || fetchKey === null) return

    let cancelled = false

    const run = async (): Promise<Loaded> => {
      /*
       * One drill, not two: the request *without* its outcome, which is what
       * the chips must count. The rows for the selected chip are a filter of
       * those, taken on the main thread — see `selectOutcome`. Two concurrent
       * drills would also fight over the client's latest-wins ticket and both
       * come back stale.
       */
      const base = drillQuery(withoutOutcome(request), filters)
      const baseResult = await client.drill(base.query, base.target)
      if (cancelled || baseResult.stale) throw new Superseded()

      const counts = countOutcomes(dataset, baseResult.rows)
      // Ownership of the selection passes to the worker on the next line.
      const selected = selectOutcome(dataset, baseResult.rows, request.constraints.outcome)

      const sorted = await client.sort(selected, sortKey, sortDirection, localizedRanks(lang))
      if (cancelled || sorted.stale) throw new Superseded()

      return { key: fetchKey, rows: sorted.rows, counts, failed: false }
    }

    void run().then(
      (result) => {
        if (!cancelled) setLoaded(result)
      },
      (cause: unknown) => {
        // A superseded request is not a failure; a newer one is already in
        // flight and will publish its own result.
        if (cancelled || cause instanceof Superseded) return
        setLoaded({ key: fetchKey, rows: EMPTY_ROWS, counts: EMPTY_COUNTS, failed: true })
      },
    )

    return () => {
      cancelled = true
    }
    // `filters` and `request` are both captured by value in `fetchKey`;
    // listing them would refetch on every render, since `parseDrill` and the
    // filter parser each return a fresh object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, dataset, fetchKey])

  /*
   * Derived, not stored. A `setRows(EMPTY)` in the effect for the not-yet-
   * loaded case would be a render that exists only to be thrown away, and one
   * more place for the rows and the request to disagree.
   */
  const current = loaded !== null && loaded.key === fetchKey ? loaded : null
  const rows = current?.rows ?? EMPTY_ROWS
  const counts = current?.counts ?? EMPTY_COUNTS

  const openDrill = useCallback(
    (next: DrillRequest) => {
      openedInApp.current = true
      opener.current = document.activeElement as HTMLElement | null
      pushSearch(searchWith(serializeDrill(next, filters.range)))
    },
    [filters.range],
  )

  const setOutcome = useCallback(
    (outcome: DrillOutcome | undefined) => {
      if (request === null) return
      const next: DrillRequest = {
        ...request,
        constraints: { ...request.constraints, outcome },
      }
      if (outcome === undefined) delete next.constraints.outcome

      // Replace: filtering a list is not navigation.
      replaceSearch(searchWith(serializeDrill(next, filters.range)))
    },
    [request, filters.range],
  )

  const setSort = useCallback(
    (key: SortKey) => {
      // Same column toggles direction; a new column starts newest/largest
      // first, which is what a reader wants from every column here.
      if (key === sortKey) {
        setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
        return
      }
      setSortKey(key)
      setSortDirection('desc')
    },
    [sortKey],
  )

  const close = useCallback((fallback?: HTMLElement | null) => {
    if (openedInApp.current) {
      openedInApp.current = false
      // Consume the entry that opening pushed, rather than stranding it.
      window.history.back()
    } else {
      replaceSearch(searchWith(null))
    }

    /*
     * Back to whatever opened it. The element has to still be in the document
     * — a widget removed while the panel was open would otherwise swallow
     * focus — and on a direct load there was never an opener at all, so the
     * caller's fallback (the page heading) takes over.
     *
     * A frame later, because the panel is still mounted during this call and
     * focusing something inside an element about to unmount loses it to body.
     */
    const target = opener.current
    opener.current = null
    const destination = target !== null && document.contains(target) ? target : (fallback ?? null)
    if (destination !== null) {
      window.requestAnimationFrame(() => destination.focus())
    }
  }, [])

  return {
    request,
    invalid: parsed.invalid,
    rows,
    counts,
    loading: active && current === null,
    failed: current?.failed ?? false,
    contradicts,
    sortKey,
    sortDirection,
    openDrill,
    setOutcome,
    setSort,
    close,
  }
}
