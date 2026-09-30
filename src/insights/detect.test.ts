/**
 * Does it find what is there, and does it stay quiet about what is not?
 *
 * Both halves, because either one alone is trivially gamed. A detector that
 * returns every agent has perfect recall; one that returns nothing has perfect
 * precision. The pair of tests at the bottom of this file — RECALL on the
 * planted dataset, PRECISION on the same quarter generated without the
 * stories — is the only honest measure of whether the top of the dashboard is
 * worth reading.
 *
 * The unit tests above them use hand-built aggregates rather than the
 * generator, so each rule can be provoked on its own: three agents where one
 * transfers twice as often, an intent that slides over eight weeks, one
 * Tuesday with a broken backend. Real data cannot isolate a rule like that.
 *
 * Nothing here imports STORY except to name the days and ids it expects, which
 * is what a ground-truth file is for; the detectors themselves never see it.
 */

import { describe, expect, it, vi } from 'vitest'
import { STORY } from '../data/config'
import { AGENTS, INTENTS } from '../data/dictionaries'
import { generateDataset } from '../data/generate'
import { aggregate } from '../engine/aggregate'
import type { Aggregates, Counts } from '../engine/types'
import { dayIndexToISO, isoToDayIndex, weekday } from '../lib/time/riyadh'
import { boundsOf, comparisonRange, defaultRange, type DataBounds } from '../state/presets'
import { detectInsights, incidentsOf, ongoingOf, type Insight } from './detect'

/*
 * Generous timeouts throughout this file.
 *
 * Every test here builds at least one 200,000-row quarter, which is a couple
 * of hundred milliseconds on a quiet machine and several seconds on one busy
 * running a browser. Vitest's five-second default is a budget for a unit
 * test; these are datasets. A suite that goes red because something else was
 * compiling is a suite people learn to re-run rather than read.
 */
const DATASET_TIMEOUT_MS = 120_000
vi.setConfig({ testTimeout: DATASET_TIMEOUT_MS, hookTimeout: DATASET_TIMEOUT_MS })

// --- building aggregates by hand --------------------------------------------

const ZERO: Counts = {
  calls: 0,
  resolved: 0,
  transferred: 0,
  abandoned: 0,
  toolErrorCalls: 0,
  toolErrorsSum: 0,
}

function counts(partial: Partial<Counts>): Counts {
  return { ...ZERO, ...partial }
}

/** `calls` split into resolved and transferred, with no abandonment. */
function transferring(calls: number, transferRate: number): Counts {
  const transferred = Math.round(calls * transferRate)
  return counts({ calls, transferred, resolved: calls - transferred })
}

/** `calls` at a resolution rate, the rest transferred. */
function resolving(calls: number, resolutionRate: number, toolErrorRate = 0): Counts {
  const resolved = Math.round(calls * resolutionRate)
  return counts({
    calls,
    resolved,
    transferred: calls - resolved,
    toolErrorCalls: Math.round(calls * toolErrorRate),
    toolErrorsSum: Math.round(calls * toolErrorRate),
  })
}

/** A Sunday, so hand-built weeks line up with the engine's weekly buckets. */
const FIRST_DAY = isoToDayIndex('2026-06-28')

type AggregatesPatch = {
  agents?: { current: Counts; previous: Counts }[]
  intents?: { current: Counts; previous: Counts; weekly: Counts[] }[]
  daily?: Counts[]
}

/**
 * The smallest thing the detectors will accept, with one dimension filled in.
 *
 * Everything not named is zeroed rather than omitted, so a test that provokes
 * the agent rule cannot accidentally also trip the intent rule on leftovers.
 */
function makeAggregates(patch: AggregatesPatch): Aggregates {
  const daily = patch.daily ?? []
  const weeklyLength = Math.max(0, ...(patch.intents ?? []).map((intent) => intent.weekly.length))

  /*
   * Enough whole weeks to cover whichever series the test filled in. The
   * quarter trend reads `weekStarts` to decide which buckets are whole weeks,
   * so a weekly series without matching week starts is a series the detector
   * correctly refuses to draw a trend from.
   */
  const weeks = Math.max(Math.ceil(daily.length / 7), weeklyLength)
  const weekStarts = Array.from({ length: weeks }, (_, week) => FIRST_DAY + week * 7)

  return {
    current: ZERO,
    previous: ZERO,
    daily,
    intents:
      patch.intents ??
      INTENTS.map(() => ({ current: ZERO, previous: ZERO, weekly: [] as Counts[] })),
    agents: patch.agents ?? AGENTS.map(() => ({ current: ZERO, previous: ZERO })),
    reasons: { current: [0, 0, 0, 0], previous: [0, 0, 0, 0] },
    heatmap: new Array<number>(7 * 24).fill(0),
    weekStarts,
  }
}

function boundsFor(days: number): DataBounds {
  return boundsOf({ firstDay: FIRST_DAY, days })
}

/** A week's worth of selected range, which is what the agent rule scales to. */
const WEEK = { from: FIRST_DAY, to: FIRST_DAY + 6 }

// --- a) outlier agents ------------------------------------------------------

describe('outlier agents', () => {
  it('flags the one transferring far more than the median of the room', () => {
    const agents = AGENTS.map((_, code) => {
      // Three active agents; the rest took no calls and are not "in view".
      if (code === 0) return { current: transferring(2000, 0.45), previous: ZERO }
      if (code === 1) return { current: transferring(2000, 0.15), previous: ZERO }
      if (code === 2) return { current: transferring(2000, 0.16), previous: ZERO }
      return { current: ZERO, previous: ZERO }
    })

    const insights = detectInsights(makeAggregates({ agents }), {
      range: WEEK,
      bounds: boundsFor(7),
    })

    expect(insights).toHaveLength(1)
    const [insight] = insights
    expect(insight!.kind).toBe('agent')
    if (insight!.kind !== 'agent') return

    expect(insight!.params.agent).toBe(0)
    // 45% against a median of 16%.
    expect(insight!.params.ratio).toBeCloseTo(0.45 / 0.16, 2)
    expect(insight!.evidence.median).toBeCloseTo(0.16, 3)

    // (0.45 - 0.16) × 2000 calls, already a week long.
    expect(insight!.impact.extraFailedCalls).toBeCloseTo(580, 0)
    expect(insight!.impact.per).toBe('week')

    expect(insight!.drill.constraints).toEqual({ agent: 0, outcome: 'transferred' })
    expect(insight!.drill.range).toEqual(WEEK)
  })

  it('scales the impact to a week when the range is longer', () => {
    const agents = AGENTS.map((_, code) => ({
      current: code === 0 ? transferring(8000, 0.45) : code < 3 ? transferring(8000, 0.16) : ZERO,
      previous: ZERO,
    }))

    const fourWeeks = { from: FIRST_DAY, to: FIRST_DAY + 27 }
    const [insight] = detectInsights(makeAggregates({ agents }), {
      range: fourWeeks,
      bounds: boundsFor(28),
    })

    // (0.45 - 0.16) × 8000 over 28 days is a quarter of that a week.
    expect(insight!.impact.extraFailedCalls).toBeCloseTo((0.29 * 8000) / 4, 0)
  })

  it('says nothing when fewer than three agents are in view', () => {
    const agents = AGENTS.map((_, code) => ({
      current: code === 0 ? transferring(2000, 0.45) : code === 1 ? transferring(2000, 0.15) : ZERO,
      previous: ZERO,
    }))

    // Two agents have a median exactly between them, so one is always "above
    // the median" — a finding that would be reported every single week.
    expect(
      detectInsights(makeAggregates({ agents }), { range: WEEK, bounds: boundsFor(7) }),
    ).toEqual([])
  })

  it('does not flag a big ratio built on a small difference', () => {
    // 3.5% against a median of 2% is 1.75×, which clears the ratio gate, and
    // on 20,000 calls the z-test clears too. It is one and a half points.
    const agents = AGENTS.map((_, code) => ({
      current:
        code === 0 ? transferring(20_000, 0.035) : code < 3 ? transferring(20_000, 0.02) : ZERO,
      previous: ZERO,
    }))

    const insights = detectInsights(makeAggregates({ agents }), {
      range: WEEK,
      bounds: boundsFor(7),
    })

    expect(insights).toEqual([])
  })

  it('does not flag a ratio built on too few calls to judge', () => {
    // Same 45% against 16%, but on twenty calls rather than two thousand.
    // The z-test declines to interpret a sample that small, and "we cannot
    // tell" must not be reported as "this agent is the problem".
    const agents = AGENTS.map((_, code) => ({
      current: code === 0 ? transferring(20, 0.45) : code < 3 ? transferring(20, 0.16) : ZERO,
      previous: ZERO,
    }))

    expect(
      detectInsights(makeAggregates({ agents }), { range: WEEK, bounds: boundsFor(7) }),
    ).toEqual([])
  })
})

// --- b) declining intents ---------------------------------------------------

/** Eight full weeks of one intent, sliding from `early` to `recent`. */
function decliningIntent(early: number, recent: number, callsPerWeek = 700) {
  const weekly = [
    ...Array.from({ length: 4 }, () => resolving(callsPerWeek, early)),
    ...Array.from({ length: 4 }, () => resolving(callsPerWeek, recent)),
  ]
  const current = weekly[7]!
  return { current, previous: weekly[6]!, weekly }
}

describe('declining intents', () => {
  it('flags an intent that is materially worse than it was four weeks in', () => {
    const intents = INTENTS.map((_, code) =>
      code === 3
        ? decliningIntent(0.7, 0.5)
        : { current: ZERO, previous: ZERO, weekly: [] as Counts[] },
    )

    const insights = detectInsights(makeAggregates({ intents }), {
      range: WEEK,
      bounds: boundsFor(56),
    })

    expect(insights).toHaveLength(1)
    const [insight] = insights
    if (insight!.kind !== 'intent') throw new Error('expected an intent insight')

    expect(insight!.params.intent).toBe(3)
    expect(insight!.params.drop).toBeCloseTo(0.2, 2)
    expect(insight!.evidence.recentCallsPerWeek).toBe(700)
    // Twenty points off seven hundred calls a week.
    expect(insight!.impact.extraFailedCalls).toBeCloseTo(140, 0)
    expect(insight!.drill.constraints).toEqual({ intent: 3, outcome: 'unresolved' })
  })

  it('ignores a drop too small to act on', () => {
    // Two points, on volume high enough for the z-test to certify it.
    const intents = INTENTS.map((_, code) =>
      code === 3
        ? decliningIntent(0.72, 0.7, 20_000)
        : { current: ZERO, previous: ZERO, weekly: [] as Counts[] },
    )

    expect(
      detectInsights(makeAggregates({ intents }), { range: WEEK, bounds: boundsFor(56) }),
    ).toEqual([])
  })

  it('ignores an intent that improved', () => {
    const intents = INTENTS.map((_, code) =>
      code === 3
        ? decliningIntent(0.5, 0.7)
        : { current: ZERO, previous: ZERO, weekly: [] as Counts[] },
    )

    expect(
      detectInsights(makeAggregates({ intents }), { range: WEEK, bounds: boundsFor(56) }),
    ).toEqual([])
  })
})

// --- c) incident days -------------------------------------------------------

const QUARTER_DAYS = 63

/**
 * Nine weeks of ordinary days, with weekday rhythm built in.
 *
 * The rhythm is the point: Fridays are quiet and resolve differently, so a
 * detector comparing a Friday against "a normal day" would flag every Friday.
 * These tests would not catch that without a weekly shape to trip over.
 */
function ordinaryQuarter(): Counts[] {
  return Array.from({ length: QUARTER_DAYS }, (_, offset) => {
    const dow = weekday(FIRST_DAY + offset)
    const isWeekend = dow >= 5
    return resolving(isWeekend ? 900 : 2200, isWeekend ? 0.62 : 0.72, 0.06)
  })
}

/** The offset of the nth occurrence of a weekday, for aiming a bad day. */
function offsetOfWeekday(dow: number, occurrence: number): number {
  let seen = 0
  for (let offset = 0; offset < QUARTER_DAYS; offset++) {
    if (weekday(FIRST_DAY + offset) !== dow) continue
    if (seen === occurrence) return offset
    seen++
  }
  throw new Error(`no occurrence ${occurrence} of weekday ${dow}`)
}

describe('incident days', () => {
  it('flags a day whose tool errors are unlike the same weekday in every other week', () => {
    const daily = ordinaryQuarter()
    const badOffset = offsetOfWeekday(2, 4) // the fifth Tuesday
    daily[badOffset] = resolving(2200, 0.65, 0.29)

    const insights = detectInsights(makeAggregates({ daily }), {
      range: WEEK,
      bounds: boundsFor(QUARTER_DAYS),
    })

    expect(insights).toHaveLength(1)
    const [incident] = incidentsOf(insights)
    expect(incident!.day).toBe(FIRST_DAY + badOffset)
    expect(incident!.evidence.toolErrorBaseline).toBeCloseTo(0.06, 3)
    expect(incident!.params.toolErrorRatio).toBeCloseTo(0.29 / 0.06, 1)

    // Seven points of resolution below a 0.72 baseline, on 2,200 calls.
    expect(incident!.impact.extraFailedCalls).toBeCloseTo(0.07 * 2200, 0)
    expect(incident!.impact.per).toBe('day')

    // Tool errors were the flag, so the drill opens the calls that hit them.
    expect(incident!.drill.constraints).toEqual({ hasToolErrors: true })
    expect(incident!.drill.range).toEqual({
      from: FIRST_DAY + badOffset,
      to: FIRST_DAY + badOffset,
    })
  })

  it('uses the same weekday as the baseline, not the days around it', () => {
    /*
     * Every Friday resolves twenty points below every workday. Measured
     * against the week around it, a Friday is a catastrophe; measured against
     * other Fridays it is a Friday.
     */
    const daily = ordinaryQuarter()
    expect(
      detectInsights(makeAggregates({ daily }), { range: WEEK, bounds: boundsFor(QUARTER_DAYS) }),
    ).toEqual([])
  })

  it('merges adjacent bad days into one incident', () => {
    const daily = ordinaryQuarter()
    const first = offsetOfWeekday(2, 4)
    daily[first] = resolving(2200, 0.65, 0.29)
    daily[first + 1] = resolving(2200, 0.66, 0.28)

    const incidents = incidentsOf(
      detectInsights(makeAggregates({ daily }), {
        range: WEEK,
        bounds: boundsFor(QUARTER_DAYS),
      }),
    )

    expect(incidents).toHaveLength(1)
    expect(incidents[0]!.evidence.range).toEqual({
      from: FIRST_DAY + first,
      to: FIRST_DAY + first + 1,
    })
    // Both days cost calls, and both are counted.
    expect(incidents[0]!.impact.extraFailedCalls).toBeGreaterThan(0.11 * 2200)
  })

  it('skips a day with too few calls to mean anything', () => {
    const daily = ordinaryQuarter()
    const badOffset = offsetOfWeekday(2, 4)
    // The same catastrophic rates on a day nobody called.
    daily[badOffset] = resolving(120, 0.2, 0.6)

    expect(
      detectInsights(makeAggregates({ daily }), { range: WEEK, bounds: boundsFor(QUARTER_DAYS) }),
    ).toEqual([])
  })

  it('says how long it has been quiet since, and only when it has', () => {
    const daily = ordinaryQuarter()
    // The 5th and 7th Tuesdays: both far enough from the ends of the data to
    // have four comparable Tuesdays on each side. See the edge test below.
    const early = offsetOfWeekday(2, 4)
    const late = offsetOfWeekday(2, 6)
    daily[early] = resolving(2200, 0.65, 0.29)
    daily[late] = resolving(2200, 0.65, 0.29)

    const incidents = incidentsOf(
      detectInsights(makeAggregates({ daily }), {
        range: WEEK,
        bounds: boundsFor(QUARTER_DAYS),
      }),
    )

    // Most recent first.
    expect(incidents.map((incident) => incident.day)).toEqual([FIRST_DAY + late, FIRST_DAY + early])
    // The later one has nothing after it; the earlier one does.
    expect(incidents[0]!.evidence.quietDaysSince).toBe(QUARTER_DAYS - 1 - late)
    expect(incidents[1]!.evidence.quietDaysSince).toBeNull()
  })

  it('judges every day in the quarter, including the first and the last', () => {
    /*
     * The blind spot this replaced: baselines used to come from a window of
     * neighbouring weeks, taken symmetrically so the quarter's upward drift
     * cancelled. Symmetry is impossible at the ends of the data, so the first
     * and last fortnight went unjudged — including the last week, which is
     * the view this dashboard opens on and the period its whole question is
     * about. A detector blind to yesterday is blind where it matters most.
     *
     * The drift is now fitted and removed instead, so one rule reaches every
     * day. The same collapse is planted at three positions and found at all
     * three.
     */
    const positions = [
      ['the first week', offsetOfWeekday(2, 0)],
      ['the middle', offsetOfWeekday(2, 4)],
      ['the last week', offsetOfWeekday(2, 8)],
    ] as const

    for (const [where, offset] of positions) {
      const daily = ordinaryQuarter()
      daily[offset] = resolving(2200, 0.55, 0.06)

      const incidents = incidentsOf(
        detectInsights(makeAggregates({ daily }), {
          range: WEEK,
          bounds: boundsFor(QUARTER_DAYS),
        }),
      )

      expect(
        incidents.map((incident) => incident.day),
        where,
      ).toEqual([FIRST_DAY + offset])
    }
  })

  it('finds an incident planted in the first week, at offset 7', () => {
    /*
     * The other end of the same blind spot. The generator cannot plant here —
     * its deploy window starts at offset 14 — so this is a fixture, which is
     * also the only way to name an exact offset.
     */
    const daily = ordinaryQuarter()
    daily[7] = resolving(2200, 0.62, 0.3)

    const incidents = incidentsOf(
      detectInsights(makeAggregates({ daily }), {
        range: WEEK,
        bounds: boundsFor(QUARTER_DAYS),
      }),
    )

    expect(incidents.map((incident) => incident.day)).toEqual([FIRST_DAY + 7])
    expect(incidents[0]!.params.toolErrorRatio).toBeGreaterThan(4)
  })

  it('finds a collapse on the very last day of the data', () => {
    // "What happened yesterday" is the product's question, and yesterday is
    // always the last day of the dataset.
    const daily = ordinaryQuarter()
    const lastDay = QUARTER_DAYS - 1
    daily[lastDay] = resolving(900, 0.42, 0.06)

    const incidents = incidentsOf(
      detectInsights(makeAggregates({ daily }), {
        range: WEEK,
        bounds: boundsFor(QUARTER_DAYS),
      }),
    )

    expect(incidents.map((incident) => incident.day)).toEqual([FIRST_DAY + lastDay])
  })

  it('takes the quarter drift out before comparing anything', () => {
    /*
     * A quarter that drifts upward by four points end to end, with nothing
     * wrong in it. Compared against a raw quarter-wide median, every day in
     * the first weeks is "below normal" and every day in the last weeks is
     * above it. Against the fitted trend, no day is remarkable.
     */
    const daily = Array.from({ length: QUARTER_DAYS }, (_, offset) => {
      const dow = weekday(FIRST_DAY + offset)
      const isWeekend = dow >= 5
      const drift = 0.04 * (offset / (QUARTER_DAYS - 1))
      return resolving(isWeekend ? 900 : 2200, (isWeekend ? 0.6 : 0.7) + drift, 0.06)
    })

    expect(
      detectInsights(makeAggregates({ daily }), { range: WEEK, bounds: boundsFor(QUARTER_DAYS) }),
    ).toEqual([])
  })

  it('flags a collapse in resolution even when tool errors look normal', () => {
    const daily = ordinaryQuarter()
    const badOffset = offsetOfWeekday(2, 4)
    daily[badOffset] = resolving(2200, 0.55, 0.06)

    const [incident] = incidentsOf(
      detectInsights(makeAggregates({ daily }), {
        range: WEEK,
        bounds: boundsFor(QUARTER_DAYS),
      }),
    )

    expect(incident!.params.toolErrorRatio).toBeNull()
    expect(incident!.params.resolutionDrop).toBeCloseTo(0.17, 2)
    // Nothing to say about tool errors, so the drill does not narrow to them.
    expect(incident!.drill.constraints).toEqual({})
  })
})

// --- recall and precision, on the real generator ----------------------------

function runAggregate(
  ds: ReturnType<typeof generateDataset>,
  range: { from: number; to: number },
): Aggregates {
  return aggregate(ds, {
    range,
    compare: comparisonRange(range),
    agents: [],
    intents: [],
    languages: [],
  })
}

/** One line per finding, for the record. */
function describeInsight(insight: Insight): string {
  const impact = `${Math.round(insight.impact.extraFailedCalls)} calls per ${insight.impact.per}`

  if (insight.kind === 'agent') {
    return `${AGENTS[insight.params.agent]!.id}: ${(insight.evidence.rate * 100).toFixed(1)}% vs ${(
      insight.evidence.median * 100
    ).toFixed(1)}% median (${insight.params.ratio.toFixed(2)}x) — ${impact}`
  }
  if (insight.kind === 'intent') {
    return `${INTENTS[insight.params.intent]!.id}: ${(insight.evidence.earlyRate * 100).toFixed(
      1,
    )}% -> ${(insight.evidence.recentRate * 100).toFixed(1)}% (${(
      insight.params.drop * 100
    ).toFixed(1)} pts) — ${impact}`
  }
  return `${dayIndexToISO(insight.day)}: tool errors ${(
    (insight.evidence.toolErrorRate ?? 0) * 100
  ).toFixed(1)}% vs ${((insight.evidence.toolErrorBaseline ?? 0) * 100).toFixed(1)}% normal (${
    insight.params.toolErrorRatio?.toFixed(1) ?? '-'
  }x), resolution ${((insight.evidence.resolutionRate ?? 0) * 100).toFixed(1)}% vs ${(
    (insight.evidence.resolutionBaseline ?? 0) * 100
  ).toFixed(1)}% — ${impact}`
}

describe('RECALL: the planted quarter', () => {
  const ds = generateDataset()
  const bounds = boundsOf(ds)
  const range = defaultRange(bounds)
  const insights = detectInsights(runAggregate(ds, range), { range, bounds })

  it('ranks Majed above roaming, and nothing else is ongoing', () => {
    const ongoing = ongoingOf(insights)

    expect(
      ongoing.map((insight) =>
        insight.kind === 'agent'
          ? AGENTS[insight.params.agent]!.id
          : insight.kind === 'intent'
            ? INTENTS[insight.params.intent]!.id
            : 'incident',
      ),
    ).toEqual([STORY.overTransferringAgent.agentId, STORY.degradingIntent.intentId])

    // The order is the claim: the agent costs the centre four times what the
    // roaming decline does, which is why he is first.
    expect(ongoing[0]!.impact.extraFailedCalls).toBeGreaterThan(ongoing[1]!.impact.extraFailedCalls)

    console.log('RECALL ongoing:\n  ' + ongoing.map(describeInsight).join('\n  '))
  })

  it('finds the deploy day, and only that day', () => {
    const incidents = incidentsOf(insights)

    expect(incidents.map((incident) => dayIndexToISO(incident.day))).toEqual([
      STORY.badDeploy.dateISO,
    ])
    expect(incidents[0]!.params.toolErrorRatio).toBeGreaterThan(4)
    expect(incidents[0]!.drill.constraints).toEqual({ hasToolErrors: true })

    console.log('RECALL incidents:\n  ' + incidents.map(describeInsight).join('\n  '))
  })
})

describe('PRECISION: the same quarter with nothing wrong in it', () => {
  const ds = generateDataset(undefined, { anomalies: false })
  const bounds = boundsOf(ds)

  it('says nothing about last week', () => {
    const range = defaultRange(bounds)
    const insights = detectInsights(runAggregate(ds, range), { range, bounds })

    expect(insights.map(describeInsight)).toEqual([])
  })

  it('says nothing about the whole quarter either', () => {
    // The wider window is the harder test: ninety days of calls will resolve
    // a tenth of a point to statistical certainty, so anything that survives
    // here survived materiality rather than luck.
    const range = { from: bounds.firstDay, to: bounds.lastDay }
    const insights = detectInsights(runAggregate(ds, range), { range, bounds })

    expect(insights.map(describeInsight)).toEqual([])
  })
})
