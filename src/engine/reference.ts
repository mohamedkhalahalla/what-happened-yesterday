/**
 * A slow, obviously-correct twin of the aggregation engine. **Test-only.**
 *
 * `aggregate.ts` is fast because it is clever: bit masks, precomputed day
 * metadata, one fused pass, integers everywhere. Clever code needs an oracle,
 * so this module computes the same answers the dumbest way available —
 * materialise every row as a `Call` object, re-derive its Riyadh day and hour
 * from the ISO string, look everything up by string, and count with plain
 * loops. If the two disagree, the fast one is wrong.
 *
 * Deriving the day and hour from `call.startedAt` rather than reading the
 * `dayIdx` / `hour` columns is the point: it checks the generator's columns
 * too, not just the engine's arithmetic.
 *
 * Nothing under `src/` outside tests may import this (an ESLint rule enforces
 * it) — it is 100× slower and exists purely to be disagreed with.
 */

import {
  previousPeriod,
  riyadhDayIndex,
  riyadhHour,
  startOfWeek,
  weekday,
} from '../lib/time/riyadh'
import { AGENTS, HANDOFF_REASONS, INTENTS, LANGUAGES, OUTCOMES } from '../data/dictionaries'
import { getCall } from '../data/getCall'
import { NO_HANDOFF, type Call, type Dataset } from '../data/types'
import type { Aggregates, Counts, DrillTarget, Query } from './types'

/** One materialised row, with every code re-derived from the `Call` object. */
type ReferenceRow = {
  index: number
  call: Call
  dayIndex: number
  hour: number
  agent: number
  intent: number
  language: number
  outcome: number
  handoff: number
}

/**
 * Materialising 200k `Call` objects takes about a second, and the differential
 * tests do it for ~25 queries. The rows are derived purely from `ds`, so
 * caching them per dataset changes nothing about the answers.
 */
const rowCache = new WeakMap<Dataset, ReferenceRow[]>()

function materialise(ds: Dataset): ReferenceRow[] {
  const cached = rowCache.get(ds)
  if (cached) return cached

  const rows: ReferenceRow[] = []
  for (let i = 0; i < ds.n; i++) {
    const call = getCall(ds, i)
    // Back to epoch seconds from the ISO string, then through riyadh.ts.
    const epochSec = Date.parse(call.startedAt) / 1000

    rows.push({
      index: i,
      call,
      dayIndex: riyadhDayIndex(epochSec),
      hour: riyadhHour(epochSec),
      agent: AGENTS.findIndex((a) => a.id === call.agentId),
      intent: INTENTS.findIndex((it) => it.id === call.intent),
      language: LANGUAGES.indexOf(call.language),
      outcome: OUTCOMES.indexOf(call.outcome),
      handoff:
        call.handoffReason === undefined ? NO_HANDOFF : HANDOFF_REASONS.indexOf(call.handoffReason),
    })
  }

  rowCache.set(ds, rows)
  return rows
}

function emptyCounts(): Counts {
  return {
    calls: 0,
    resolved: 0,
    transferred: 0,
    abandoned: 0,
    toolErrorCalls: 0,
    toolErrorsSum: 0,
  }
}

function tally(counts: Counts, row: ReferenceRow): void {
  counts.calls++
  if (row.call.outcome === 'resolved') counts.resolved++
  if (row.call.outcome === 'transferred') counts.transferred++
  if (row.call.outcome === 'abandoned') counts.abandoned++
  if (row.call.toolErrors >= 1) {
    counts.toolErrorCalls++
    counts.toolErrorsSum += row.call.toolErrors
  }
}

/** Does this row survive the query's filters? Empty array = no filter. */
function passesFilters(row: ReferenceRow, q: Query): boolean {
  if (q.agents.length > 0 && !q.agents.includes(row.agent)) return false
  if (q.intents.length > 0 && !q.intents.includes(row.intent)) return false
  if (q.languages.length > 0 && !q.languages.includes(row.language)) return false
  return true
}

function inRange(dayIndex: number, range: { from: number; to: number }): boolean {
  return dayIndex >= range.from && dayIndex <= range.to
}

/** The same {@link Aggregates} as `aggregate()`, computed the slow obvious way. */
export function reference(ds: Dataset, q: Query): Aggregates {
  const rows = materialise(ds)
  const current = q.range
  const previous = previousPeriod(current)

  const firstWeekStart = startOfWeek(ds.firstDay)
  const lastDay = ds.firstDay + ds.days - 1
  const weekCount = Math.floor((lastDay - firstWeekStart) / 7) + 1
  const weekStarts: number[] = []
  for (let w = 0; w < weekCount; w++) weekStarts.push(firstWeekStart + w * 7)

  const out: Aggregates = {
    current: emptyCounts(),
    previous: emptyCounts(),
    daily: [],
    intents: [],
    agents: [],
    reasons: {
      current: HANDOFF_REASONS.map(() => 0),
      previous: HANDOFF_REASONS.map(() => 0),
    },
    heatmap: [],
    weekStarts,
  }
  for (let d = 0; d < ds.days; d++) out.daily.push(emptyCounts())
  for (let k = 0; k < INTENTS.length; k++) {
    const weekly: Counts[] = []
    for (let w = 0; w < weekCount; w++) weekly.push(emptyCounts())
    out.intents.push({ current: emptyCounts(), previous: emptyCounts(), weekly })
  }
  for (let a = 0; a < AGENTS.length; a++) {
    out.agents.push({ current: emptyCounts(), previous: emptyCounts() })
  }
  for (let cell = 0; cell < 7 * 24; cell++) out.heatmap.push(0)

  for (const row of rows) {
    if (!passesFilters(row, q)) continue

    const dayOffset = row.dayIndex - ds.firstDay
    const weekBucket = Math.floor((row.dayIndex - firstWeekStart) / 7)

    tally(out.daily[dayOffset]!, row)
    tally(out.intents[row.intent]!.weekly[weekBucket]!, row)

    const isCurrent = inRange(row.dayIndex, current)
    const isPrevious = !isCurrent && inRange(row.dayIndex, previous)
    if (!isCurrent && !isPrevious) continue

    if (isCurrent) {
      tally(out.current, row)
      tally(out.intents[row.intent]!.current, row)
      tally(out.agents[row.agent]!.current, row)
      if (row.call.outcome === 'transferred' && row.handoff !== NO_HANDOFF) {
        out.reasons.current[row.handoff]!++
      }
      out.heatmap[weekday(row.dayIndex) * 24 + row.hour]!++
    } else {
      tally(out.previous, row)
      tally(out.intents[row.intent]!.previous, row)
      tally(out.agents[row.agent]!.previous, row)
      if (row.call.outcome === 'transferred' && row.handoff !== NO_HANDOFF) {
        out.reasons.previous[row.handoff]!++
      }
    }
  }

  return out
}

/** The same row indices as `drill()`, found by filtering materialised rows. */
export function referenceDrill(ds: Dataset, q: Query, t: DrillTarget): number[] {
  const rows = materialise(ds)
  const period = t.period === 'current' ? q.range : previousPeriod(q.range)

  return rows
    .filter((row) => {
      if (!passesFilters(row, q)) return false
      if (!inRange(row.dayIndex, period)) return false
      if (t.day !== undefined && row.dayIndex !== t.day) return false
      if (t.agent !== undefined && row.agent !== t.agent) return false
      if (t.intent !== undefined && row.intent !== t.intent) return false
      if (t.outcome !== undefined && row.outcome !== t.outcome) return false
      if (t.handoff !== undefined && row.handoff !== t.handoff) return false
      if (t.hour !== undefined && row.hour !== t.hour) return false
      if (t.weekday !== undefined && weekday(row.dayIndex) !== t.weekday) return false
      if (t.hasToolErrors !== undefined && row.call.toolErrors >= 1 !== t.hasToolErrors) {
        return false
      }
      return true
    })
    .map((row) => row.index)
}
