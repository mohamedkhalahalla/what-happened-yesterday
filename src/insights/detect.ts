/**
 * What the dashboard says before it is asked.
 *
 * Everything else on this page answers a question the reader brought with
 * them. These three detectors go the other way: they read the same aggregates
 * the widgets read and nominate what to look at first, ranked by how many
 * calls the problem costs.
 *
 * ## The rules these follow
 *
 * **Nothing here imports STORY.** The planted anomalies have to be found the
 * way a director would find them, from the numbers. A detector that knew where
 * to look would prove nothing at all.
 *
 * **Every finding carries its own evidence and its own drill.** A claim the
 * reader cannot check is worse than no claim: it asks for trust the dashboard
 * has not earned. So an insight states the numbers behind it and opens the
 * calls that produced them.
 *
 * **Impact is in calls, not in significance.** A director cannot act on a
 * z-score. "≈ 460 extra transfers a week" is a number they can put next to the
 * cost of doing something about it, and it is also the only honest way to rank
 * three findings of completely different kinds against each other.
 *
 * ## Why three kinds
 *
 * The two groups answer different questions and must not be mixed in one list.
 * An **ongoing** problem is costing calls every week and will keep doing so
 * until someone changes something. An **incident** already happened; the cost
 * is sunk, and the only question is whether it is still happening. Ranking a
 * Tuesday in August against a standing agent problem by the same number would
 * tell the reader to fix the past.
 */

import type { Aggregates } from '../engine/types'
import { medianOf, buildAgentRows } from '../widgets/agentsData'
import { buildIntentRows } from '../widgets/intentsData'
import { prepareDaily, type DailyPoint } from '../widgets/dailyTrendData'
import { compareRates, type Comparison } from '../lib/stats'
import {
  AGENT_OUTLIER_RATIO,
  INCIDENT_MIN_BASELINE_DAYS,
  INCIDENT_MIN_DAY_CALLS,
  INCIDENT_RESOLUTION_MIN_POINTS,
  INCIDENT_ROBUST_Z,
  INCIDENT_TOOL_ERROR_MIN_POINTS,
  MIN_AGENTS_FOR_OUTLIER,
  SEGMENT_MIN_POINTS,
  pointsToRatio,
} from '../lib/thresholds'
import { weekday, type DayRange } from '../lib/time/riyadh'
import type { DrillRequest } from '../state/drill'
import { rangeLengthOf, type DataBounds } from '../state/presets'

/** Days in a week, spelled out where it is a unit conversion and not a count. */
const DAYS_PER_WEEK = 7

export type InsightKind = 'agent' | 'intent' | 'incident'

/**
 * Which list a finding belongs in.
 *
 * `ongoing` is still costing calls; `incident` is over. See the note at the
 * top of this file for why they are never ranked against each other.
 */
export type InsightGroup = 'ongoing' | 'incident'

export type InsightImpact = {
  /**
   * Calls that failed beyond what this thing's own baseline would predict:
   * against the median agent, against the intent four weeks ago, against a
   * normal day of the same weekday.
   */
  extraFailedCalls: number
  /** Whether that number recurs weekly or happened once, on the day. */
  per: 'week' | 'day'
}

type InsightBase = {
  /** Stable across renders for the same finding, so React keys do not churn. */
  id: string
  group: InsightGroup
  impact: InsightImpact
  /** The calls behind the claim. */
  drill: DrillRequest
  /** Set on incidents: the day the evidence comes from. */
  day?: number
}

export type AgentInsight = InsightBase & {
  kind: 'agent'
  group: 'ongoing'
  params: { agent: number; ratio: number }
  evidence: {
    rate: number
    median: number
    calls: number
    transferred: number
    comparison: Comparison
  }
}

export type IntentInsight = InsightBase & {
  kind: 'intent'
  group: 'ongoing'
  params: { intent: number; drop: number }
  evidence: {
    earlyRate: number
    recentRate: number
    /** Calls a week in the recent window — what the drop is applied to. */
    recentCallsPerWeek: number
    comparison: Comparison
  }
}

export type IncidentInsight = InsightBase & {
  kind: 'incident'
  group: 'incident'
  day: number
  params: {
    /** Tool errors as a multiple of normal, when that is what flagged. */
    toolErrorRatio: number | null
    /** Resolution shortfall in ratio units, when that is what flagged. */
    resolutionDrop: number | null
  }
  evidence: {
    /** The whole run of days, which is one day unless adjacent ones merged. */
    range: DayRange
    calls: number
    toolErrorRate: number | null
    toolErrorBaseline: number | null
    resolutionRate: number | null
    resolutionBaseline: number | null
    /** Days since, when nothing like it has happened again. Null if it has. */
    quietDaysSince: number | null
  }
}

export type Insight = AgentInsight | IntentInsight | IncidentInsight

export type DetectOptions = {
  /** The dashboard's selected range: what the ongoing detectors look at. */
  range: DayRange
  /** The edges of the data, for the daily series the incidents run over. */
  bounds: DataBounds
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0
}

// --- a) outlier agents ------------------------------------------------------

/**
 * An agent transferring far more than the middle of the room.
 *
 * Two tests, and both are needed. The **ratio** to the median answers "is this
 * a lot?", which an absolute rate cannot: 47% is damning against a median of
 * 18% and unremarkable against a median of 45%. The **z-test against the other
 * agents pooled** answers "could this be luck?", which the ratio cannot: an
 * agent who took forty calls can sit at twice the median by chance alone.
 *
 * Pooled against everyone else rather than against the median agent, because
 * the comparison the reader is making is "him versus the rest", and the rest
 * is a much larger sample than any one colleague.
 */
function detectAgents(aggregates: Aggregates, options: DetectOptions): AgentInsight[] {
  const { rows, median } = buildAgentRows(aggregates)

  // "The median agent" needs a room to be the middle of.
  if (rows.length < MIN_AGENTS_FOR_OUTLIER || median <= 0) return []

  const totals = rows.reduce(
    (sum, row) => ({
      calls: sum.calls + row.calls,
      transferred: sum.transferred + row.transferred,
    }),
    { calls: 0, transferred: 0 },
  )

  const rangeDays = Math.max(1, rangeLengthOf(options.range))
  const insights: AgentInsight[] = []

  for (const row of rows) {
    if (row.transferRate < median * AGENT_OUTLIER_RATIO) continue

    const otherCalls = totals.calls - row.calls
    const otherTransferred = totals.transferred - row.transferred
    const comparison = compareRates(
      row.transferred,
      row.calls,
      otherTransferred,
      otherCalls,
      SEGMENT_MIN_POINTS,
    )
    if (comparison.verdict !== 'notable') continue

    /*
     * What the centre would save if he transferred like the middle of the
     * room, scaled to a week so it can be compared with a declining intent.
     * Not "what he would resolve": some of those calls genuinely need a human,
     * and claiming otherwise would oversell the fix.
     */
    const extraPerRange = (row.transferRate - median) * row.calls
    const extraFailedCalls = (extraPerRange * DAYS_PER_WEEK) / rangeDays

    insights.push({
      id: `agent:${row.code}`,
      kind: 'agent',
      group: 'ongoing',
      params: { agent: row.code, ratio: row.ratioToMedian },
      evidence: {
        rate: row.transferRate,
        median,
        calls: row.calls,
        transferred: row.transferred,
        comparison,
      },
      impact: { extraFailedCalls, per: 'week' },
      drill: {
        range: options.range,
        constraints: { agent: row.code, outcome: 'transferred' },
        source: 'agentComparison',
      },
    })
  }

  return insights
}

// --- b) declining intents ---------------------------------------------------

/**
 * An intent that has been getting worse all quarter.
 *
 * The test is the Intents table's own quarter trend — first four full weeks
 * against the last four — reused rather than reimplemented. Two definitions of
 * "declining" on one screen is a contradiction the reader has no way to
 * resolve, and the version here would be the one nobody had tested against the
 * dataset.
 *
 * Note that this deliberately ignores the selected range. A slow decline is
 * invisible inside one week; that is the entire reason the trend is measured
 * over the quarter. The drill still opens the selected range, because that is
 * the period the reader is looking at.
 */
function detectIntents(aggregates: Aggregates, options: DetectOptions): IntentInsight[] {
  const rows = buildIntentRows(aggregates, {
    weekStarts: aggregates.weekStarts,
    firstDay: options.bounds.firstDay,
    lastDay: options.bounds.lastDay,
  })

  const insights: IntentInsight[] = []

  for (const row of rows) {
    const trend = row.quarterTrend
    if (trend === null || !trend.declining) continue

    const earlyRate = ratio(trend.early.resolved, trend.early.calls)
    const recentRate = ratio(trend.recent.resolved, trend.recent.calls)
    // The windows are four weeks each, so this is already a weekly rate.
    const recentCallsPerWeek = trend.recent.calls / 4

    insights.push({
      id: `intent:${row.code}`,
      kind: 'intent',
      group: 'ongoing',
      params: { intent: row.code, drop: earlyRate - recentRate },
      evidence: { earlyRate, recentRate, recentCallsPerWeek, comparison: trend.comparison },
      // Calls that resolve today and would not have four weeks ago — the
      // decline's running cost, at the volume it is currently running at.
      impact: {
        extraFailedCalls: (earlyRate - recentRate) * recentCallsPerWeek,
        per: 'week',
      },
      drill: {
        range: options.range,
        constraints: { intent: row.code, outcome: 'unresolved' },
        source: 'intentTable',
      },
    })
  }

  return insights
}

// --- c) incident days -------------------------------------------------------

/** Middle absolute deviation from the median, scaled to compare with an SD. */
const MAD_TO_SD = 1.4826

export type RobustBaseline = {
  baseline: number
  /** MAD-derived spread. Zero when every comparable day was identical. */
  spread: number
}

/**
 * The middle and the spread of a set of comparable days.
 *
 * Median and MAD rather than mean and standard deviation, because the thing
 * being looked for is exactly the kind of value that would drag a mean toward
 * itself and inflate an SD — and a bad day that moves its own baseline is a
 * bad day that cannot be detected.
 */
export function robustBaseline(values: readonly number[]): RobustBaseline | null {
  if (values.length < INCIDENT_MIN_BASELINE_DAYS) return null

  const baseline = medianOf(values)
  const spread = MAD_TO_SD * medianOf(values.map((value) => Math.abs(value - baseline)))
  return { baseline, spread }
}

/**
 * How far from normal, in spreads.
 *
 * A zero spread means every comparable day was identical, which makes any
 * difference at all infinitely unusual by this measure — but only a difference
 * the materiality gate also accepts is ever acted on, so infinity is safe here
 * and honest about what the data says.
 */
export function robustZ(value: number, { baseline, spread }: RobustBaseline): number {
  if (spread > 0) return (value - baseline) / spread
  if (value === baseline) return 0
  return value > baseline ? Infinity : -Infinity
}

type DayJudgement = {
  point: DailyPoint
  toolFlagged: boolean
  resolutionFlagged: boolean
  toolBaseline: number | null
  resolutionBaseline: number | null
  toolZ: number
  resolutionZ: number
}

/**
 * Baselines from the **same weekday in the other weeks**.
 *
 * This business runs on a weekly rhythm: Friday is half the volume of a
 * Tuesday and resolves differently, so a Friday measured against "a normal
 * day" is a Friday flagged every week. Excluding the day itself matters for
 * the same reason the median does — a day is not allowed to vote on whether it
 * is normal.
 */
function judgeDays(points: readonly DailyPoint[]): DayJudgement[] {
  const judgements: DayJudgement[] = []

  for (const point of points) {
    // A day too quiet to mean anything is not an incident, whatever its rates.
    if (point.calls < INCIDENT_MIN_DAY_CALLS) continue

    const sameWeekday = points.filter(
      (other) =>
        other.dayIndex !== point.dayIndex && weekday(other.dayIndex) === weekday(point.dayIndex),
    )

    const toolValues = sameWeekday
      .map((other) => other.toolErrorRate)
      .filter((rate): rate is number => rate !== undefined)
    const resolutionValues = sameWeekday
      .map((other) => other.resolutionRate)
      .filter((rate): rate is number => rate !== undefined)

    const toolReference = robustBaseline(toolValues)
    const resolutionReference = robustBaseline(resolutionValues)

    const toolRate = point.toolErrorRate
    const resolutionRate = point.resolutionRate

    const toolZ =
      toolRate === undefined || toolReference === null ? 0 : robustZ(toolRate, toolReference)
    const resolutionZ =
      resolutionRate === undefined || resolutionReference === null
        ? 0
        : robustZ(resolutionRate, resolutionReference)

    /*
     * Both halves again: unusual *and* large. The z-test on its own certifies
     * a tenth of a point as extraordinary whenever the other weeks happened to
     * agree closely, which is how a detector ends up reporting the weather.
     */
    const toolFlagged =
      toolRate !== undefined &&
      toolReference !== null &&
      toolZ >= INCIDENT_ROBUST_Z &&
      toolRate - toolReference.baseline >= pointsToRatio(INCIDENT_TOOL_ERROR_MIN_POINTS)

    const resolutionFlagged =
      resolutionRate !== undefined &&
      resolutionReference !== null &&
      resolutionZ <= -INCIDENT_ROBUST_Z &&
      resolutionReference.baseline - resolutionRate >= pointsToRatio(INCIDENT_RESOLUTION_MIN_POINTS)

    if (!toolFlagged && !resolutionFlagged) continue

    judgements.push({
      point,
      toolFlagged,
      resolutionFlagged,
      toolBaseline: toolReference?.baseline ?? null,
      resolutionBaseline: resolutionReference?.baseline ?? null,
      toolZ,
      resolutionZ,
    })
  }

  return judgements
}

/**
 * Adjacent flagged days are one incident.
 *
 * A deploy that goes out on Tuesday afternoon and is rolled back on Wednesday
 * morning is one event. Listing it twice would double its apparent frequency
 * and make the "nothing like it since" line meaningless.
 */
function groupAdjacent(judgements: readonly DayJudgement[]): DayJudgement[][] {
  const groups: DayJudgement[][] = []

  for (const judgement of judgements) {
    const previous = groups[groups.length - 1]
    const last = previous?.[previous.length - 1]

    if (
      previous !== undefined &&
      last !== undefined &&
      judgement.point.dayIndex === last.point.dayIndex + 1
    ) {
      previous.push(judgement)
    } else {
      groups.push([judgement])
    }
  }

  return groups
}

function detectIncidents(aggregates: Aggregates, options: DetectOptions): IncidentInsight[] {
  const points = prepareDaily(aggregates.daily, options.bounds.firstDay)
  const flagged = judgeDays(points)
  const groups = groupAdjacent(flagged)

  const lastFlaggedDay = flagged[flagged.length - 1]?.point.dayIndex ?? null

  return groups.map((group) => {
    const first = group[0]!
    const last = group[group.length - 1]!
    const range: DayRange = { from: first.point.dayIndex, to: last.point.dayIndex }

    /*
     * The worst day speaks for the incident. Tool errors win the tie because
     * they are the cause when both fire: a broken backend is why the calls
     * stopped resolving, and naming the symptom would send the reader looking
     * in the wrong place.
     */
    const anyToolFlagged = group.some((day) => day.toolFlagged)
    const peak = group.reduce((worst, day) =>
      anyToolFlagged
        ? day.toolZ > worst.toolZ
          ? day
          : worst
        : day.resolutionZ < worst.resolutionZ
          ? day
          : worst,
    )

    // Every day of the incident counts, not just the worst one.
    const extraFailedCalls = group.reduce((total, day) => {
      const baseline = day.resolutionBaseline
      const rate = day.point.resolutionRate
      if (baseline === null || rate === undefined) return total
      return total + Math.max(0, baseline - rate) * day.point.calls
    }, 0)

    const toolRate = peak.point.toolErrorRate ?? null
    const resolutionRate = peak.point.resolutionRate ?? null

    return {
      id: `incident:${range.from}`,
      kind: 'incident',
      group: 'incident',
      day: peak.point.dayIndex,
      params: {
        toolErrorRatio:
          anyToolFlagged && toolRate !== null && peak.toolBaseline !== null && peak.toolBaseline > 0
            ? toolRate / peak.toolBaseline
            : null,
        resolutionDrop:
          peak.resolutionBaseline !== null && resolutionRate !== null
            ? peak.resolutionBaseline - resolutionRate
            : null,
      },
      evidence: {
        range,
        calls: peak.point.calls,
        toolErrorRate: toolRate,
        toolErrorBaseline: peak.toolBaseline,
        resolutionRate,
        resolutionBaseline: peak.resolutionBaseline,
        /*
         * "Nothing like it in the 32 days since" is the line that turns a
         * finding into a decision: a one-off that stopped needs a note in the
         * minutes, while one that recurred last week needs an engineer. Null
         * when a later day was also flagged — the run is not over.
         */
        quietDaysSince:
          lastFlaggedDay !== null && lastFlaggedDay > range.to
            ? null
            : options.bounds.lastDay - range.to,
      },
      impact: { extraFailedCalls, per: 'day' },
      drill: {
        range,
        // The calls that carried the failure, when the failure was tool errors.
        constraints: anyToolFlagged ? { hasToolErrors: true } : {},
        source: 'dailyTrend',
      },
    }
  })
}

// --- the whole pass ---------------------------------------------------------

/**
 * Everything worth saying about these aggregates, ranked.
 *
 * Ongoing problems first, by what they cost a week, because that is the order
 * a director should spend their Monday in. Incidents after, most recent first,
 * because the only live question about an incident is whether it is still
 * happening.
 */
export function detectInsights(aggregates: Aggregates | null, options: DetectOptions): Insight[] {
  if (aggregates === null) return []

  const ongoing: Insight[] = [
    ...detectAgents(aggregates, options),
    ...detectIntents(aggregates, options),
  ].sort((a, b) => b.impact.extraFailedCalls - a.impact.extraFailedCalls)

  const incidents = detectIncidents(aggregates, options).sort((a, b) => b.day - a.day)

  return [...ongoing, ...incidents]
}

/** The ongoing findings, in rank order. */
export function ongoingOf(insights: readonly Insight[]): Insight[] {
  return insights.filter((insight) => insight.group === 'ongoing')
}

/** The incidents, most recent first. */
export function incidentsOf(insights: readonly Insight[]): IncidentInsight[] {
  return insights.filter((insight): insight is IncidentInsight => insight.kind === 'incident')
}
