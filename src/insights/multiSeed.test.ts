/**
 * The detectors against twelve different quarters.
 *
 * `detect.test.ts` asks whether the rules work on the dataset they were
 * written beside. That is the question with the flattering answer: the
 * thresholds, the dataset and the tests were all tuned in the same room, and
 * nothing about one dataset can tell you whether a rule generalises or whether
 * it was fitted.
 *
 * So the seed moves the anomalies — a different agent, a different intent, a
 * different working day — and the same three rules have to find them again,
 * twelve times, without being told where to look.
 *
 * This file is the recall half only: every planted thing must be found, and
 * nothing else may be reported alongside it. How often the detectors speak up
 * about a quarter with nothing in it is a *rate*, and rates are measured in
 * `falseAlarm.test.ts` rather than asserted twelve times here.
 *
 * ## Membership, not order
 *
 * Recall here is "exactly these, no more and no fewer". The *ranking* is
 * checked on the default seed only, where the impacts are known numbers. Which
 * of two planted problems costs more calls depends on the volumes the seed
 * happened to draw, so asserting an order across seeds would be asserting
 * something the plan does not determine.
 *
 * ## If this fails
 *
 * The failure message prints the seed, the plan and what was actually found,
 * because "detector missed something on seed 1337" is unactionable and "seed
 * 1337 planted a decline in store_locator, which has 180 calls a quarter" is a
 * bug report. Do not reach for the thresholds first: a threshold moved to make
 * a test pass is a threshold fitted to twelve datasets instead of one.
 */

import { describe, expect, it } from 'vitest'

import { SEED } from '../data/config'
import { AGENTS, INTENTS } from '../data/dictionaries'
import { generateDataset } from '../data/generate'
import { storyFor, type StoryPlan } from '../data/story'
import { aggregate } from '../engine/aggregate'
import type { Aggregates } from '../engine/types'
import { dayIndexToISO } from '../lib/time/riyadh'
import { boundsOf, comparisonRange, defaultRange, type DataBounds } from '../state/presets'
import { detectInsights, incidentsOf, ongoingOf, type Insight } from './detect'

/**
 * The seeds, written down so a failure is reproducible.
 *
 * Fixed rather than random: a suite that draws its own seeds fails on
 * somebody's laptop for a reason nobody can reproduce, and a flaky test about
 * statistical detection is a test that gets deleted. The list spans the 32-bit
 * range, including both ends, because the URL will accept any of it.
 */
const SEEDS = [
  SEED, // the default: the quarter everything else is pinned against
  1,
  7,
  42,
  1337,
  77777,
  20250101,
  20260101,
  123456789,
  999999937,
  2147483647,
  4294967295,
] as const

type Found = {
  agents: string[]
  intents: string[]
  incidentDays: string[]
}

function foundIn(insights: readonly Insight[]): Found {
  const ongoing = ongoingOf(insights)

  return {
    agents: ongoing
      .filter((insight): insight is Extract<Insight, { kind: 'agent' }> => insight.kind === 'agent')
      .map((insight) => AGENTS[insight.params.agent]!.id),
    intents: ongoing
      .filter(
        (insight): insight is Extract<Insight, { kind: 'intent' }> => insight.kind === 'intent',
      )
      .map((insight) => INTENTS[insight.params.intent]!.id),
    incidentDays: incidentsOf(insights).map((incident) => dayIndexToISO(incident.day)),
  }
}

/** Everything a failure needs to be actionable, in one string. */
function report(seed: number, plan: StoryPlan, found: Found, insights: readonly Insight[]): string {
  const planned = [
    `agent=${AGENTS[plan.agent]!.id}`,
    `intent=${INTENTS[plan.intent]!.id}`,
    `(weight ${INTENTS[plan.intent]!.weight}, ${plan.intentStartResolve} -> ${plan.intentEndResolve})`,
    `deploy=${dayIndexToISO(plan.deployDay)}`,
  ].join(' ')

  const numbers = insights.map((insight) => {
    const impact = `${Math.round(insight.impact.extraFailedCalls)}/${insight.impact.per}`
    if (insight.kind === 'agent') {
      return `agent ${AGENTS[insight.params.agent]!.id} ${(insight.evidence.rate * 100).toFixed(
        1,
      )}% vs ${(insight.evidence.median * 100).toFixed(1)}% median (${insight.params.ratio.toFixed(
        2,
      )}x) ${impact}`
    }
    if (insight.kind === 'intent') {
      return `intent ${INTENTS[insight.params.intent]!.id} ${(
        insight.evidence.earlyRate * 100
      ).toFixed(1)}% -> ${(insight.evidence.recentRate * 100).toFixed(1)}% ${impact}`
    }
    return `incident ${dayIndexToISO(insight.day)} toolRatio=${
      insight.params.toolErrorRatio?.toFixed(2) ?? 'none'
    } ${impact}`
  })

  return [
    `seed ${seed}`,
    `  planned:  ${planned}`,
    `  found:    agents=[${found.agents.join(', ')}] intents=[${found.intents.join(
      ', ',
    )}] incidents=[${found.incidentDays.join(', ')}]`,
    `  insights:${numbers.length === 0 ? ' none' : '\n    ' + numbers.join('\n    ')}`,
  ].join('\n')
}

function aggregateFor(
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

type Run = {
  plan: StoryPlan
  bounds: DataBounds
  insights: Insight[]
  found: Found
}

/** One seed, planted, seen through the default "last week" view. */
function runPlanted(seed: number): Run {
  const ds = generateDataset(seed)
  const bounds = boundsOf(ds)
  const range = defaultRange(bounds)
  const insights = detectInsights(aggregateFor(ds, range), { range, bounds })

  return { plan: storyFor(seed), bounds, insights, found: foundIn(insights) }
}

describe('RECALL across seeds', () => {
  it.each(SEEDS)('finds the planted agent, intent and day for seed %i', (seed) => {
    const { plan, insights, found } = runPlanted(seed)
    const why = report(seed, plan, found, insights)

    expect(found.agents, why).toEqual([AGENTS[plan.agent]!.id])
    expect(found.intents, why).toEqual([INTENTS[plan.intent]!.id])
    expect(found.incidentDays, why).toEqual([dayIndexToISO(plan.deployDay)])
  })

  it('does not find the same three things every time', () => {
    // Twelve seeds that all planted Majed would be one test run twelve times.
    const runs = SEEDS.map((seed) => runPlanted(seed).found)

    expect(new Set(runs.map((found) => found.agents[0])).size).toBeGreaterThan(1)
    expect(new Set(runs.map((found) => found.intents[0])).size).toBeGreaterThan(1)
    expect(new Set(runs.map((found) => found.incidentDays[0])).size).toBeGreaterThan(1)
  })
})

/*
 * Precision is measured, not asserted, and it lives in `falseAlarm.test.ts`.
 *
 * "Zero false positives on twelve seeds" was the claim here until it was
 * pointed out that twelve is a small sample for a rate and zero is the answer
 * a detector gives right up until the day it does not. The budget — one false
 * incident per ten clean quarters, currently running at one in fifty — is a
 * number somebody can plan around. `npm run test:detectors` measures it.
 */
