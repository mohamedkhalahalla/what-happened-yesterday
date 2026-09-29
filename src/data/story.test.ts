/**
 * The plan is the thing the detectors are not allowed to know.
 *
 * Two claims: the default seed still describes the quarter everything else in
 * this repo is pinned against, and every other seed produces a plan that is
 * both varied and plantable — an agent who exists, an intent with enough calls
 * to show a decline, and a working day with ordinary weeks on either side.
 *
 * This file is allowed to read STORY. It is the ground truth, and checking the
 * default plan against it is the whole point.
 */

import { describe, expect, it } from 'vitest'

import { ANCHOR_TODAY_ISO, DAYS, SEED, STORY } from './config'
import { AGENTS, INTENTS, agentIndex, intentIndex } from './dictionaries'
import { isoToDayIndex, weekday } from '../lib/time/riyadh'
import { storyFor } from './story'

const FIRST_DAY = isoToDayIndex(ANCHOR_TODAY_ISO) - DAYS
const LAST_DAY = FIRST_DAY + DAYS - 1

/** A spread of seeds, including both ends of the 32-bit range. */
const SEEDS = [
  0, 1, 2, 3, 7, 42, 1337, 20250101, 20260101, 77777, 123456789, 999999937, 2147483647, 4294967295,
]

describe('the default seed', () => {
  it('returns exactly the planted story, not a derived one', () => {
    const plan = storyFor(SEED)

    expect(plan.agent).toBe(agentIndex(STORY.overTransferringAgent.agentId))
    expect(plan.intent).toBe(intentIndex(STORY.degradingIntent.intentId))
    expect(plan.deployDay).toBe(isoToDayIndex(STORY.badDeploy.dateISO))
    expect(plan.deployHours).toEqual({
      from: STORY.badDeploy.fromHour,
      to: STORY.badDeploy.toHour,
    })
    expect(plan.intentStartResolve).toBe(STORY.degradingIntent.startResolve)
    expect(plan.intentEndResolve).toBe(STORY.degradingIntent.endResolve)
  })

  it('does not merely happen to match the general rule', () => {
    // Roaming's own rule would end it at 0.82 - 0.35 = 0.47. The story says
    // 0.45, and the story wins — which is why the default is a special case
    // rather than a lucky one.
    const plan = storyFor(SEED)
    expect(plan.intentEndResolve).not.toBeCloseTo(plan.intentStartResolve - 0.35, 5)
  })
})

describe('any other seed', () => {
  it.each(SEEDS)('produces a plantable plan for seed %i', (seed) => {
    const plan = storyFor(seed)

    expect(AGENTS[plan.agent]).toBeDefined()
    expect(INTENTS[plan.intent]).toBeDefined()

    // A working day, with room on both sides for the weekday baseline.
    expect(weekday(plan.deployDay)).toBeLessThanOrEqual(4)
    expect(plan.deployDay).toBeGreaterThanOrEqual(FIRST_DAY + 14)
    // Up to and including the last day: the detector judges every one of them.
    expect(plan.deployDay).toBeLessThanOrEqual(LAST_DAY)

    // It declines from where that intent normally sits, and not below a floor.
    expect(plan.intentStartResolve).toBe(INTENTS[plan.intent]!.baseResolve)
    expect(plan.intentEndResolve).toBeLessThan(plan.intentStartResolve)
    expect(plan.intentEndResolve).toBeGreaterThanOrEqual(0.3)
  })

  it('never picks one of the five rarest intents', () => {
    /*
     * A decline in a 200-call intent is invisible by construction: its weekly
     * buckets fall below the minimum and the trend is drawn as gaps. Planting
     * one would be testing the detector on a case where silence is correct.
     */
    const rarest = INTENTS.map((intent, code) => ({ code, weight: intent.weight }))
      .sort((a, b) => a.weight - b.weight || a.code - b.code)
      .slice(0, 5)
      .map((entry) => entry.code)

    for (const seed of SEEDS) {
      expect(rarest, `seed ${seed}`).not.toContain(storyFor(seed).intent)
    }
  })

  it('is deterministic', () => {
    for (const seed of SEEDS) {
      expect(storyFor(seed)).toEqual(storyFor(seed))
    }
  })

  it('moves the anomalies around rather than nudging them', () => {
    // If most seeds produced the same plan, twelve seeds would be one test
    // run twelve times.
    const plans = SEEDS.map((seed) => storyFor(seed))

    expect(new Set(plans.map((plan) => plan.agent)).size).toBeGreaterThan(1)
    expect(new Set(plans.map((plan) => plan.intent)).size).toBeGreaterThan(1)
    expect(new Set(plans.map((plan) => plan.deployDay)).size).toBeGreaterThan(1)
  })

  it('handles the ends of the 32-bit range without wrapping into the default', () => {
    // `seed ^ mix` is signed in JS; an unshifted result would index arrays
    // with a negative number and quietly produce undefined.
    for (const seed of [0, 2147483648, 4294967295]) {
      const plan = storyFor(seed)
      expect(Number.isInteger(plan.agent)).toBe(true)
      expect(plan.agent).toBeGreaterThanOrEqual(0)
      expect(plan.intent).toBeGreaterThanOrEqual(0)
    }
  })
})
