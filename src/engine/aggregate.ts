/**
 * The aggregation engine: one pass over the columns answers the whole
 * dashboard.
 *
 * The shape of the work is deliberate. Filters become `Uint8Array` lookup
 * masks and day metadata is precomputed into small per-day arrays *before* the
 * loop, so the inner loop over 200k rows does array reads and adds — no
 * string comparison, no `Set.has`, no date maths, no allocation.
 *
 * Everything here is pure: same dataset and query in, same counts out. It
 * knows nothing about workers, and nothing about the planted anomalies in
 * `src/data/config.ts` — the whole point is that it finds them the way the
 * director would.
 */

import { startOfWeek, weekday } from '../lib/time/riyadh'
import { AGENTS, HANDOFF_REASONS, INTENTS, LANGUAGES, OUTCOMES } from '../data/dictionaries'
import { NO_HANDOFF, type Dataset } from '../data/types'
import type {
  AgentAggregate,
  Aggregates,
  Counts,
  DayRangeQuery,
  DrillTarget,
  IntentAggregate,
  Query,
} from './types'

const RESOLVED = OUTCOMES.indexOf('resolved')
const TRANSFERRED = OUTCOMES.indexOf('transferred')

const HOURS_PER_DAY = 24
const HEATMAP_SIZE = 7 * HOURS_PER_DAY

// Values of the per-day `period` lookup built in `classifyDays`.
const PERIOD_NONE = 0
const PERIOD_CURRENT = 1
const PERIOD_PREVIOUS = 2

/** A fresh zeroed tally. */
export function emptyCounts(): Counts {
  return {
    calls: 0,
    resolved: 0,
    transferred: 0,
    abandoned: 0,
    toolErrorCalls: 0,
    toolErrorsSum: 0,
  }
}

/**
 * Fold row `i` into `counts`. Called several times per row (once for the day
 * bucket, once for the intent's week, once for the period totals…), which is
 * why it stays this small.
 */
function addRow(counts: Counts, ds: Dataset, i: number): void {
  counts.calls++

  const outcome = ds.outcome[i]!
  if (outcome === RESOLVED) counts.resolved++
  else if (outcome === TRANSFERRED) counts.transferred++
  else counts.abandoned++

  const toolErrors = ds.toolErrors[i]!
  if (toolErrors > 0) {
    counts.toolErrorCalls++
    counts.toolErrorsSum += toolErrors
  }
}

/**
 * A one-byte-per-code lookup: `mask[code]` is 1 when the code passes.
 * An empty selection means "no filter", so every code passes.
 */
function buildMask(selected: readonly number[], size: number): Uint8Array {
  const mask = new Uint8Array(size)
  if (selected.length === 0) {
    mask.fill(1)
    return mask
  }
  for (const code of selected) {
    if (code >= 0 && code < size) mask[code] = 1
  }
  return mask
}

/** Per-day metadata, computed once per `aggregate` call rather than per row. */
type DayMeta = {
  /** PERIOD_NONE / PERIOD_CURRENT / PERIOD_PREVIOUS, by day offset. */
  period: Uint8Array
  /** Riyadh weekday (0 = Sunday), by day offset. */
  weekday: Uint8Array
  /** Weekly bucket index, by day offset. */
  week: Uint16Array
  /** Absolute day index of each bucket's Sunday. */
  weekStarts: number[]
}

/**
 * Bucket every data day into a Sunday-start week and mark which period it
 * belongs to. Weeks span the whole dataset, so the first bucket is partial
 * whenever the data does not itself begin on a Sunday.
 */
function classifyDays(ds: Dataset, current: DayRangeQuery, previous: DayRangeQuery): DayMeta {
  const firstWeekStart = startOfWeek(ds.firstDay)
  const weekCount = Math.floor((ds.firstDay + ds.days - 1 - firstWeekStart) / 7) + 1

  const meta: DayMeta = {
    period: new Uint8Array(ds.days),
    weekday: new Uint8Array(ds.days),
    week: new Uint16Array(ds.days),
    weekStarts: Array.from({ length: weekCount }, (_, w) => firstWeekStart + w * 7),
  }

  for (let offset = 0; offset < ds.days; offset++) {
    const dayIndex = ds.firstDay + offset
    meta.weekday[offset] = weekday(dayIndex)
    meta.week[offset] = Math.floor((dayIndex - firstWeekStart) / 7)

    if (dayIndex >= current.from && dayIndex <= current.to) meta.period[offset] = PERIOD_CURRENT
    else if (dayIndex >= previous.from && dayIndex <= previous.to)
      meta.period[offset] = PERIOD_PREVIOUS
    else meta.period[offset] = PERIOD_NONE
  }
  return meta
}

/** Allocate the whole result up front, so the loop only ever increments. */
function emptyAggregates(ds: Dataset, weekCount: number, weekStarts: number[]): Aggregates {
  return {
    current: emptyCounts(),
    previous: emptyCounts(),
    daily: Array.from({ length: ds.days }, emptyCounts),
    intents: Array.from({ length: INTENTS.length }, (): IntentAggregate => ({
      current: emptyCounts(),
      previous: emptyCounts(),
      weekly: Array.from({ length: weekCount }, emptyCounts),
    })),
    agents: Array.from({ length: AGENTS.length }, (): AgentAggregate => ({
      current: emptyCounts(),
      previous: emptyCounts(),
    })),
    reasons: {
      current: new Array<number>(HANDOFF_REASONS.length).fill(0),
      previous: new Array<number>(HANDOFF_REASONS.length).fill(0),
    },
    heatmap: new Array<number>(HEATMAP_SIZE).fill(0),
    weekStarts,
  }
}

/**
 * Everything the dashboard needs, from one pass over the dataset.
 *
 * The comparison period arrives in the query. When it is `null` the previous
 * buckets simply stay zero — see the note on {@link Query.compare}.
 */
export function aggregate(ds: Dataset, q: Query): Aggregates {
  const current = q.range
  // An empty range that cannot match any day, so the classifier marks nothing
  // as PERIOD_PREVIOUS without needing a special case in the hot loop.
  const previous = q.compare ?? { from: 1, to: 0 }

  const agentMask = buildMask(q.agents, AGENTS.length)
  const intentMask = buildMask(q.intents, INTENTS.length)
  const languageMask = buildMask(q.languages, LANGUAGES.length)

  const days = classifyDays(ds, current, previous)
  const out = emptyAggregates(ds, days.weekStarts.length, days.weekStarts)

  for (let i = 0; i < ds.n; i++) {
    const agent = ds.agent[i]!
    if (agentMask[agent] === 0) continue
    const intent = ds.intent[i]!
    if (intentMask[intent] === 0) continue
    if (languageMask[ds.language[i]!] === 0) continue

    const offset = ds.dayIdx[i]! - ds.firstDay
    const intentAgg = out.intents[intent]!

    // Full-history series: filtered, but deliberately blind to the date range.
    addRow(out.daily[offset]!, ds, i)
    addRow(intentAgg.weekly[days.week[offset]!]!, ds, i)

    const period = days.period[offset]!
    if (period === PERIOD_NONE) continue

    const isCurrent = period === PERIOD_CURRENT
    addRow(isCurrent ? out.current : out.previous, ds, i)
    addRow(isCurrent ? intentAgg.current : intentAgg.previous, ds, i)
    addRow(isCurrent ? out.agents[agent]!.current : out.agents[agent]!.previous, ds, i)

    if (ds.outcome[i] === TRANSFERRED) {
      const handoff = ds.handoff[i]!
      if (handoff !== NO_HANDOFF) {
        const reasons = isCurrent ? out.reasons.current : out.reasons.previous
        reasons[handoff]!++
      }
    }

    // The heatmap is a "what does this period look like" view, so only current.
    if (isCurrent) {
      out.heatmap[days.weekday[offset]! * HOURS_PER_DAY + ds.hour[i]!]!++
    }
  }

  return out
}

/** The day span a drill-down looks at, already clipped to the dataset. */
function drillDayRange(ds: Dataset, q: Query, t: DrillTarget): { from: number; to: number } {
  const period = t.period === 'current' ? q.range : (q.compare ?? { from: 1, to: 0 })
  const lastDay = ds.firstDay + ds.days - 1

  // A specific day only matches if it is inside the period to begin with.
  const from = t.day === undefined ? period.from : Math.max(period.from, t.day)
  const to = t.day === undefined ? period.to : Math.min(period.to, t.day)

  return { from: Math.max(from, ds.firstDay), to: Math.min(to, lastDay) }
}

/**
 * The row indices behind one clicked bar, cell or point.
 *
 * Returned in ascending `startedAt` order, which comes for free: the dataset
 * is sorted, and `dayStartRow` lets us scan only the days in question instead
 * of all 200k rows.
 */
export function drill(ds: Dataset, q: Query, t: DrillTarget): Uint32Array {
  const agentMask = buildMask(q.agents, AGENTS.length)
  const intentMask = buildMask(q.intents, INTENTS.length)
  const languageMask = buildMask(q.languages, LANGUAGES.length)

  const { from, to } = drillDayRange(ds, q, t)
  if (from > to) return new Uint32Array(0)

  const startRow = ds.dayStartRow[from - ds.firstDay]!
  const endRow = ds.dayStartRow[to - ds.firstDay + 1]!

  const matches: number[] = []
  for (let i = startRow; i < endRow; i++) {
    const agent = ds.agent[i]!
    if (agentMask[agent] === 0) continue
    const intent = ds.intent[i]!
    if (intentMask[intent] === 0) continue
    if (languageMask[ds.language[i]!] === 0) continue

    if (t.agent !== undefined && agent !== t.agent) continue
    if (t.intent !== undefined && intent !== t.intent) continue
    if (t.outcome !== undefined && ds.outcome[i] !== t.outcome) continue
    if (t.handoff !== undefined && ds.handoff[i] !== t.handoff) continue
    if (t.hour !== undefined && ds.hour[i] !== t.hour) continue
    if (t.weekday !== undefined && weekday(ds.dayIdx[i]!) !== t.weekday) continue
    if (t.hasToolErrors !== undefined && ds.toolErrors[i]! > 0 !== t.hasToolErrors) continue
    if (t.resolved !== undefined && (ds.outcome[i] === RESOLVED) !== t.resolved) continue

    matches.push(i)
  }

  return Uint32Array.from(matches)
}
