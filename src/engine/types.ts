/**
 * The vocabulary the dashboard and the aggregation engine share.
 *
 * Two rules hold everywhere in here:
 *
 * 1. **Everything is serializable.** A {@link Query} crosses to a Web Worker
 *    and will later round-trip through the URL, and {@link Aggregates} comes
 *    back by structured clone. So: plain objects, plain arrays, numbers.
 * 2. **Counts only, never percentages.** The engine reports what it counted;
 *    turning 812/1000 into "81.2%" is a presentation decision (rounding,
 *    locale, what to show when the denominator is zero) and belongs in the UI.
 */

/** Inclusive span of absolute Riyadh day indices. */
export type DayRangeQuery = { from: number; to: number }

/**
 * Everything the user can ask for.
 *
 * `compare` is passed in rather than derived. The engine used to call
 * `previousPeriod(range)` itself, which hard-coded "the days immediately
 * before" into the layer least able to know whether that is the right
 * question. It is not: this business has a weekly rhythm, so the comparison
 * has to be weekday-aligned. That decision belongs to the state layer, which
 * also knows whether the reader asked for a comparison at all.
 *
 * `null` means no comparison — either switched off, or there is no history to
 * compare against. The engine then reports zeroed `previous` counts, which is
 * honest: nothing was counted, because nothing was asked for.
 *
 * An empty filter array means "no filter on this dimension", not "match
 * nothing" — that is what makes the default query cheap to express.
 */
export type Query = {
  range: DayRangeQuery
  /** The period to compare against, or `null` for no comparison. */
  compare: DayRangeQuery | null
  /** Codes into AGENTS; empty = all agents. */
  agents: number[]
  /** Codes into INTENTS; empty = all intents. */
  intents: number[]
  /** Codes into LANGUAGES; empty = all languages. */
  languages: number[]
}

/** The one tally the engine accumulates, everywhere. */
export type Counts = {
  calls: number
  resolved: number
  transferred: number
  abandoned: number
  /** Calls that hit at least one tool error (not the number of errors). */
  toolErrorCalls: number
  /** Total tool errors across those calls. */
  toolErrorsSum: number
}

/**
 * Per-intent view. `weekly` spans the whole dataset and ignores the selected
 * date range — it is the sparkline that shows a slow decline nobody would
 * notice inside a one-week window.
 */
export type IntentAggregate = {
  current: Counts
  previous: Counts
  weekly: Counts[]
}

/** Per-agent view, current period against the comparison period. */
export type AgentAggregate = {
  current: Counts
  previous: Counts
}

/** Handoff-reason totals. Index = HANDOFF_REASONS code; transferred calls only. */
export type ReasonTotals = {
  current: number[]
  previous: number[]
}

export type Aggregates = {
  current: Counts
  previous: Counts
  /**
   * One entry per data day across the whole dataset (length `ds.days`), with
   * the agent/intent/language filters applied but the date range ignored, so
   * the trend chart can show context around the selected window.
   */
  daily: Counts[]
  /** Index = intent code. */
  intents: IntentAggregate[]
  /** Index = agent code. */
  agents: AgentAggregate[]
  reasons: ReasonTotals
  /**
   * Current period only. 7 × 24 call counts indexed `weekday * 24 + hour`,
   * with weekday 0 = Sunday and hour in Riyadh time.
   */
  heatmap: number[]
  /** Absolute day index of each weekly bucket's Sunday. Parallel to `weekly`. */
  weekStarts: number[]
}

/**
 * Extra constraints layered on top of a {@link Query}, describing the one
 * cell, bar or point the user clicked. Everything except `period` is optional;
 * each field present narrows the result further.
 */
export type DrillTarget = {
  period: 'current' | 'previous'
  /** Absolute Riyadh day index. Must also fall inside `period`, or nothing matches. */
  day?: number
  intent?: number
  agent?: number
  outcome?: number
  handoff?: number
  /** 0 = Sunday … 6 = Saturday. */
  weekday?: number
  /** Riyadh hour, 0..23. */
  hour?: number
  hasToolErrors?: boolean
  /** True for resolved calls only, false for unresolved (transferred or abandoned). */
  resolved?: boolean
}
