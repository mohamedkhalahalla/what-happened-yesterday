/**
 * The URL *is* the filter state. This module owns that schema.
 *
 * Two commitments:
 *
 * 1. **Explicit dates, never a preset name.** A link saying `preset=lastWeek`
 *    means something different next Monday. A link saying
 *    `from=2026-09-20&to=2026-09-26` means the same thing forever, which is
 *    the whole point of sending someone a link to what you are looking at.
 * 2. **Parsing never throws.** A URL is the least trustworthy input there is:
 *    hand-edited, truncated by chat apps, built by an older version of this
 *    app. Every malformed part is corrected to something valid and recorded in
 *    a {@link Correction} list, so the UI can say so once rather than either
 *    crashing or silently showing the wrong period.
 *
 * The UI language is deliberately *not* in the URL: it is a property of the
 * reader, not of the view. Sending a colleague a link should show them their
 * dashboard in their language, not force them into yours.
 */

import { dayIndexToISO, isoToDayIndex } from '../lib/time/riyadh'
import type { DayRangeQuery } from '../engine/types'
import { codeFor, idFor, type Dimension } from './codes'
import { defaultRange, type DataBounds } from './presets'

/** Everything the URL can say. Maps directly onto an engine `Query` plus compare. */
export type FilterState = {
  range: DayRangeQuery
  /** Engine codes. Empty = no filter on this dimension. */
  agents: number[]
  intents: number[]
  languages: number[]
  /** Whether to show the period-over-period comparison at all. */
  compare: boolean
}

/** Something the URL said that could not be honoured, and what was done. */
export type Correction =
  | { kind: 'invalidDate'; param: 'from' | 'to'; value: string }
  | { kind: 'incompleteRange' }
  | { kind: 'rangeSwapped' }
  | { kind: 'clampedToData'; param: 'from' | 'to' }
  | { kind: 'rangeOutsideData' }
  | { kind: 'unknownId'; param: UrlListParam; value: string }
  | { kind: 'duplicateId'; param: UrlListParam; value: string }
  | { kind: 'invalidCompare'; value: string }
  /*
   * Raised by `parseDrill`, not by `parse` — but it belongs in the same union
   * so the one notice covers the whole query string. A reader does not care
   * which parser rejected which parameter; they care that the link they were
   * sent did not fully survive.
   */
  | { kind: 'invalidDrill' }
  /** Same again for the demo seed: raised by `parseSeed`, shown once, here. */
  | { kind: 'invalidSeed'; value: string }

export type UrlListParam = 'agents' | 'intents' | 'language'

export type ParseResult = {
  state: FilterState
  corrections: Correction[]
}

/**
 * Parameter order in the emitted query string. Fixed so that two people who
 * built the same filters by different routes get byte-identical links.
 */
const PARAM_ORDER: readonly string[] = ['from', 'to', 'agents', 'intents', 'language', 'compare']

/** The list param name for each dimension. `language` is singular by choice. */
const LIST_PARAM: Record<Dimension, UrlListParam> = {
  agents: 'agents',
  intents: 'intents',
  languages: 'language',
}

export function defaultFilterState(bounds: DataBounds): FilterState {
  return {
    range: defaultRange(bounds),
    agents: [],
    intents: [],
    languages: [],
    compare: true,
  }
}

/** `isoToDayIndex` that reports failure instead of throwing. */
function parseIsoDay(value: string): number | null {
  try {
    return isoToDayIndex(value)
  } catch {
    return null
  }
}

/**
 * Turn one comma-separated id list into engine codes.
 * Unknown ids are dropped and duplicates collapsed, each with a correction.
 */
function parseIdList(
  dimension: Dimension,
  raw: string | null,
  corrections: Correction[],
): number[] {
  if (raw === null) return []

  const param = LIST_PARAM[dimension]
  const codes: number[] = []
  const seen = new Set<number>()

  for (const piece of raw.split(',')) {
    const id = piece.trim()
    // An empty segment (`agents=` or a trailing comma) is simply nothing.
    if (id === '') continue

    const code = codeFor(dimension, id)
    if (code === null) {
      corrections.push({ kind: 'unknownId', param, value: id })
      continue
    }
    if (seen.has(code)) {
      corrections.push({ kind: 'duplicateId', param, value: id })
      continue
    }
    seen.add(code)
    codes.push(code)
  }

  // Sorted so the same selection always serializes identically.
  return codes.sort((a, b) => a - b)
}

/**
 * Read a range from the URL, correcting whatever is wrong with it.
 * Falls back to the default range whenever the pair cannot be salvaged.
 */
function parseRange(
  params: URLSearchParams,
  bounds: DataBounds,
  corrections: Correction[],
): DayRangeQuery {
  const rawFrom = params.get('from')
  const rawTo = params.get('to')

  if (rawFrom === null && rawTo === null) return defaultRange(bounds)

  if (rawFrom === null || rawTo === null) {
    // Half a range is not a range; guessing the other end would silently show
    // a period nobody asked for.
    corrections.push({ kind: 'incompleteRange' })
    return defaultRange(bounds)
  }

  const parsedFrom = parseIsoDay(rawFrom)
  const parsedTo = parseIsoDay(rawTo)

  if (parsedFrom === null) corrections.push({ kind: 'invalidDate', param: 'from', value: rawFrom })
  if (parsedTo === null) corrections.push({ kind: 'invalidDate', param: 'to', value: rawTo })
  if (parsedFrom === null || parsedTo === null) return defaultRange(bounds)

  let from = parsedFrom
  let to = parsedTo
  if (from > to) {
    corrections.push({ kind: 'rangeSwapped' })
    ;[from, to] = [to, from]
  }

  // Entirely outside the data: clamping would produce a single edge day, which
  // looks like a real answer to a question nobody asked.
  if (to < bounds.firstDay || from > bounds.lastDay) {
    corrections.push({ kind: 'rangeOutsideData' })
    return defaultRange(bounds)
  }

  if (from < bounds.firstDay) {
    corrections.push({ kind: 'clampedToData', param: 'from' })
    from = bounds.firstDay
  }
  if (to > bounds.lastDay) {
    corrections.push({ kind: 'clampedToData', param: 'to' })
    to = bounds.lastDay
  }

  return { from, to }
}

function parseCompare(params: URLSearchParams, corrections: Correction[]): boolean {
  const raw = params.get('compare')
  if (raw === null) return true
  if (raw === '0') return false
  if (raw === '1') return true

  corrections.push({ kind: 'invalidCompare', value: raw })
  return true
}

/**
 * Read a full filter state out of a query string.
 * Always succeeds; anything it could not honour is listed in `corrections`.
 */
export function parse(search: string, bounds: DataBounds): ParseResult {
  const params = new URLSearchParams(search)
  const corrections: Correction[] = []

  return {
    state: {
      range: parseRange(params, bounds, corrections),
      agents: parseIdList('agents', params.get('agents'), corrections),
      intents: parseIdList('intents', params.get('intents'), corrections),
      languages: parseIdList('languages', params.get('language'), corrections),
      compare: parseCompare(params, corrections),
    },
    corrections,
  }
}

function idList(dimension: Dimension, codes: readonly number[]): string {
  return codes
    .map((code) => idFor(dimension, code))
    .filter((id): id is string => id !== null)
    .join(',')
}

/**
 * Write a filter state back to a query string.
 *
 * Defaults are omitted, so the everyday view has a clean URL and a link with
 * parameters in it is a link that genuinely says something. The range is
 * emitted as a pair or not at all — a lone `from` would recombine with the
 * default `to` on the way back in.
 */
export function serialize(state: FilterState, bounds: DataBounds): string {
  const params = new URLSearchParams()
  const fallback = defaultRange(bounds)

  if (state.range.from !== fallback.from || state.range.to !== fallback.to) {
    params.set('from', dayIndexToISO(state.range.from))
    params.set('to', dayIndexToISO(state.range.to))
  }
  if (state.agents.length > 0) params.set('agents', idList('agents', state.agents))
  if (state.intents.length > 0) params.set('intents', idList('intents', state.intents))
  if (state.languages.length > 0) params.set('language', idList('languages', state.languages))
  if (!state.compare) params.set('compare', '0')

  // URLSearchParams preserves insertion order, but going through PARAM_ORDER
  // makes the guarantee explicit rather than incidental.
  const ordered = new URLSearchParams()
  for (const key of PARAM_ORDER) {
    const value = params.get(key)
    if (value !== null) ordered.set(key, value)
  }

  const query = ordered.toString()
  return query === '' ? '' : `?${query}`
}

/**
 * Apply a serialized filter state to an existing query string.
 *
 * `serialize` builds the filter parameters from nothing, which is what makes
 * two people's links byte-identical — but the query string also carries
 * parameters this module does not own: the drill-down, and which synthetic
 * quarter is being shown. Rebuilding from scratch would silently drop them,
 * so changing one filter would close an open drill or throw the reader back
 * to the default data.
 *
 * Filters keep their fixed order and foreign parameters follow in the order
 * they arrived, so the result is still deterministic.
 */
export function withFilterParams(search: string, filterQuery: string): string {
  const owned = new Set(PARAM_ORDER)
  const merged = new URLSearchParams(filterQuery)

  for (const [key, value] of new URLSearchParams(search)) {
    if (!owned.has(key)) merged.set(key, value)
  }

  const query = merged.toString()
  return query === '' ? '' : `?${query}`
}

/** True when the state is the default view, i.e. serializes to nothing. */
export function isDefaultState(state: FilterState, bounds: DataBounds): boolean {
  return serialize(state, bounds) === ''
}
