/**
 * The browser URL as a React store, without a router.
 *
 * A router would bring a matcher, a link component and an outlet tree for a
 * single-page app that has one route. What is actually needed is a subscribe /
 * getSnapshot pair over `location.search`, which is what
 * `useSyncExternalStore` exists for — and it gets tearing and concurrent
 * rendering right, which a `useState` + `useEffect` version would not.
 *
 * `popstate` covers back/forward, but it does **not** fire for our own
 * `replaceState` / `pushState` calls, so those go through the helpers here,
 * which notify subscribers themselves.
 */

import { useCallback, useMemo, useSyncExternalStore } from 'react'

import { parse, serialize, type Correction, type FilterState } from './url'
import type { DataBounds } from './presets'

const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange)
  window.addEventListener('popstate', onStoreChange)
  return () => {
    listeners.delete(onStoreChange)
    window.removeEventListener('popstate', onStoreChange)
  }
}

function getSnapshot(): string {
  return window.location.search
}

/** No URL on the server; the default state is the honest answer there. */
function getServerSnapshot(): string {
  return ''
}

function applySearch(search: string, mode: 'replace' | 'push'): void {
  // pathname + hash preserved: the filter state owns the query string only.
  const url = `${window.location.pathname}${search}${window.location.hash}`
  if (mode === 'push') window.history.pushState(null, '', url)
  else window.history.replaceState(null, '', url)
  emit()
}

/**
 * Update the query string without adding a history entry.
 * Filter changes use this: twenty checkbox clicks should not cost twenty
 * presses of the back button to undo.
 */
export function replaceSearch(search: string): void {
  applySearch(search, 'replace')
}

/**
 * Update the query string *and* add a history entry.
 * For navigations a person would expect Back to undo — opening a drill-down,
 * which is the next thing to be built.
 */
export function pushSearch(search: string): void {
  applySearch(search, 'push')
}

/**
 * The live query string, as a React store.
 *
 * Exported so the drill state can subscribe to the same source the filters
 * use — two independent subscriptions to one URL would be two chances to
 * disagree about what it currently says.
 */
export function useUrlSearch(): string {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export type FilterStateHandle = {
  state: FilterState
  /** What the URL asked for but could not have. Empty on a clean link. */
  corrections: Correction[]
  /** Replace the whole state. */
  setState: (next: FilterState) => void
  /** Patch part of the state. */
  update: (patch: Partial<FilterState>) => void
}

/**
 * Read the filter state out of the URL and write changes back to it.
 * `bounds` is needed to resolve defaults and clamp dates, so this hook only
 * becomes useful once the dataset has loaded.
 */
export function useFilterState(bounds: DataBounds): FilterStateHandle {
  const search = useUrlSearch()

  const parsed = useMemo(() => parse(search, bounds), [search, bounds])

  const setState = useCallback(
    (next: FilterState) => {
      replaceSearch(serialize(next, bounds))
    },
    [bounds],
  )

  const update = useCallback(
    (patch: Partial<FilterState>) => {
      replaceSearch(serialize({ ...parsed.state, ...patch }, bounds))
    },
    [parsed.state, bounds],
  )

  return { state: parsed.state, corrections: parsed.corrections, setState, update }
}
