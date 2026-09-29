import { describe, expect, it } from 'vitest'

import type { Counts } from '../engine/types'
import { dayIndexToISO, isoToDayIndex } from '../lib/time/riyadh'
import {
  LOW_VOLUME_THRESHOLD,
  niceRateMax,
  prepareDaily,
  summarizeTrend,
  type DailyPoint,
} from './dailyTrendData'

const FIRST = isoToDayIndex('2026-06-29')

const counts = (partial: Partial<Counts>): Counts => ({
  calls: 0,
  resolved: 0,
  transferred: 0,
  abandoned: 0,
  toolErrorCalls: 0,
  toolErrorsSum: 0,
  ...partial,
})

describe('prepareDaily', () => {
  it('derives both rates and pairs each day with its index', () => {
    const points = prepareDaily([counts({ calls: 100, resolved: 70, toolErrorCalls: 12 })], FIRST)

    expect(points).toHaveLength(1)
    expect(points[0]!.dayIndex).toBe(FIRST)
    expect(points[0]!.resolutionRate).toBeCloseTo(0.7, 10)
    expect(points[0]!.toolErrorRate).toBeCloseTo(0.12, 10)
  })

  it('leaves rates undefined, never 0, on a day with no calls', () => {
    // This is the whole point of the module. Plotting 0% here would draw a
    // cliff to the floor that reads as a total service failure.
    const points = prepareDaily([counts({ calls: 0 })], FIRST)

    expect(points[0]!.calls).toBe(0)
    expect(points[0]!.resolutionRate).toBeUndefined()
    expect(points[0]!.toolErrorRate).toBeUndefined()
    expect(points[0]!.resolutionRate).not.toBe(0)
  })

  it('flags low volume only for days that actually had calls', () => {
    const points = prepareDaily(
      [
        counts({ calls: 0 }),
        counts({ calls: 5, resolved: 4 }),
        counts({ calls: 500, resolved: 400 }),
      ],
      FIRST,
    )

    expect(points[0]!.lowVolume).toBe(false) // no calls is not "low volume"
    expect(points[1]!.lowVolume).toBe(true)
    expect(points[2]!.lowVolume).toBe(false)
  })

  it('treats the threshold as exclusive', () => {
    const points = prepareDaily(
      [counts({ calls: LOW_VOLUME_THRESHOLD - 1 }), counts({ calls: LOW_VOLUME_THRESHOLD })],
      FIRST,
    )
    expect(points[0]!.lowVolume).toBe(true)
    expect(points[1]!.lowVolume).toBe(false)
  })

  it('numbers consecutive days from firstDay', () => {
    const points = prepareDaily([counts({}), counts({}), counts({})], FIRST)
    expect(points.map((p) => p.dayIndex)).toEqual([FIRST, FIRST + 1, FIRST + 2])
  })

  it('handles an empty series', () => {
    expect(prepareDaily([], FIRST)).toEqual([])
  })
})

describe('summarizeTrend', () => {
  /** Ten days: one with no calls, one clearly worst, one tool-error spike. */
  const build = (): DailyPoint[] =>
    prepareDaily(
      [
        counts({ calls: 100, resolved: 80, toolErrorCalls: 5 }),
        counts({ calls: 100, resolved: 78, toolErrorCalls: 6 }),
        counts({ calls: 0 }), // gap
        counts({ calls: 100, resolved: 40, toolErrorCalls: 8 }), // worst resolution
        counts({ calls: 100, resolved: 76, toolErrorCalls: 60 }), // tool-error spike
        counts({ calls: 100, resolved: 79, toolErrorCalls: 4 }),
        counts({ calls: 100, resolved: 81, toolErrorCalls: 5 }),
        counts({ calls: 100, resolved: 77, toolErrorCalls: 6 }),
        counts({ calls: 100, resolved: 80, toolErrorCalls: 5 }),
        counts({ calls: 100, resolved: 82, toolErrorCalls: 3 }),
      ],
      FIRST,
    )

  it('finds the lowest-resolution day', () => {
    const summary = summarizeTrend(build(), { from: FIRST, to: FIRST + 9 })
    expect(summary.lowestResolution).not.toBeNull()
    expect(dayIndexToISO(summary.lowestResolution!.dayIndex)).toBe(dayIndexToISO(FIRST + 3))
    expect(summary.lowestResolution!.rate).toBeCloseTo(0.4, 10)
  })

  it('finds the highest tool-error day', () => {
    const summary = summarizeTrend(build(), { from: FIRST, to: FIRST + 9 })
    expect(dayIndexToISO(summary.highestToolError!.dayIndex)).toBe(dayIndexToISO(FIRST + 4))
    expect(summary.highestToolError!.rate).toBeCloseTo(0.6, 10)
  })

  it('skips zero-call days when hunting for extremes', () => {
    // A day with no calls must never be reported as the worst day. It has no
    // rate at all, and a 0 would beat every real day.
    const summary = summarizeTrend(build(), { from: FIRST, to: FIRST + 9 })
    expect(summary.lowestResolution!.dayIndex).not.toBe(FIRST + 2)
    expect(summary.lowestResolution!.rate).toBeGreaterThan(0)
  })

  it('weights the average by calls, not by day', () => {
    const points = prepareDaily(
      [counts({ calls: 1000, resolved: 800 }), counts({ calls: 10, resolved: 1 })],
      FIRST,
    )
    const summary = summarizeTrend(points, { from: FIRST, to: FIRST + 1 })

    // Unweighted would be (0.8 + 0.1) / 2 = 0.45. Weighted is 801/1010.
    expect(summary.quarterAverage).toBeCloseTo(801 / 1010, 10)
    expect(summary.quarterAverage).not.toBeCloseTo(0.45, 3)
  })

  it('restricts the selected average to the selected range', () => {
    const points = prepareDaily(
      [
        counts({ calls: 100, resolved: 90 }),
        counts({ calls: 100, resolved: 50 }),
        counts({ calls: 100, resolved: 50 }),
      ],
      FIRST,
    )
    const summary = summarizeTrend(points, { from: FIRST + 1, to: FIRST + 2 })

    expect(summary.selectedAverage).toBeCloseTo(0.5, 10)
    expect(summary.quarterAverage).toBeCloseTo(190 / 300, 10)
  })

  it('flags noisy data when any day is under the threshold', () => {
    const quiet = summarizeTrend(prepareDaily([counts({ calls: 500, resolved: 400 })], FIRST), {
      from: FIRST,
      to: FIRST,
    })
    expect(quiet.noisy).toBe(false)

    const noisy = summarizeTrend(
      prepareDaily(
        [counts({ calls: 500, resolved: 400 }), counts({ calls: 3, resolved: 2 })],
        FIRST,
      ),
      { from: FIRST, to: FIRST + 1 },
    )
    expect(noisy.noisy).toBe(true)
  })

  it('reports empty when nothing matched the filters', () => {
    const summary = summarizeTrend(
      prepareDaily([counts({ calls: 0 }), counts({ calls: 0 })], FIRST),
      {
        from: FIRST,
        to: FIRST + 1,
      },
    )

    expect(summary.empty).toBe(true)
    expect(summary.quarterAverage).toBeUndefined()
    expect(summary.selectedAverage).toBeUndefined()
    expect(summary.lowestResolution).toBeNull()
    expect(summary.highestToolError).toBeNull()
  })

  it('leaves the selected average undefined when the selection has no calls', () => {
    const points = prepareDaily([counts({ calls: 100, resolved: 80 }), counts({ calls: 0 })], FIRST)
    const summary = summarizeTrend(points, { from: FIRST + 1, to: FIRST + 1 })

    expect(summary.quarterAverage).toBeCloseTo(0.8, 10)
    expect(summary.selectedAverage).toBeUndefined()
    expect(summary.empty).toBe(false)
  })
})

describe('niceRateMax never clips the tallest bar', () => {
  /**
   * The invariant that matters for the chart: the axis domain maximum is
   * always at or above the highest daily rate. If it were not, the tallest
   * bar would be drawn past the top of its panel and read as clipped.
   */
  it('is at least the highest daily rate, across many shapes of data', () => {
    const shapes: number[][] = [
      [1, 5, 12, 3],
      [21, 4, 9],
      [50],
      [99],
      [100],
      [0, 0, 0],
      [4, 4, 4, 4],
      [19, 20, 21],
      [0, 100],
    ]

    for (const errorCounts of shapes) {
      const points = prepareDaily(
        errorCounts.map((errors) => counts({ calls: 100, resolved: 50, toolErrorCalls: errors })),
        FIRST,
      )
      const max = niceRateMax(points, (p) => p.toolErrorRate)
      const highest = Math.max(...points.map((p) => p.toolErrorRate ?? 0))

      expect(max, JSON.stringify(errorCounts)).toBeGreaterThanOrEqual(highest)
    }
  })

  it('leaves headroom above the highest bar rather than touching it exactly', () => {
    // A bar flush with the top of the panel looks clipped even when it is not.
    const points = prepareDaily([counts({ calls: 100, resolved: 50, toolErrorCalls: 20 })], FIRST)
    expect(niceRateMax(points, (p) => p.toolErrorRate)).toBeGreaterThan(0.2)
  })
})

describe('niceRateMax', () => {
  it('never returns less than 5 points, so a quiet quarter is not magnified', () => {
    const points = prepareDaily([counts({ calls: 100, resolved: 100, toolErrorCalls: 1 })], FIRST)
    expect(niceRateMax(points, (p) => p.toolErrorRate)).toBeCloseTo(0.05, 10)
  })

  it('rounds up past the highest value', () => {
    const points = prepareDaily([counts({ calls: 100, resolved: 50, toolErrorCalls: 21 })], FIRST)
    const max = niceRateMax(points, (p) => p.toolErrorRate)
    expect(max).toBeGreaterThanOrEqual(0.21)
    expect(max).toBeCloseTo(0.25, 10)
  })

  it('caps at 100%', () => {
    const points = prepareDaily([counts({ calls: 100, resolved: 0, toolErrorCalls: 100 })], FIRST)
    expect(niceRateMax(points, (p) => p.toolErrorRate)).toBe(1)
  })

  it('handles no data', () => {
    expect(niceRateMax([], (p) => p.toolErrorRate)).toBeCloseTo(0.05, 10)
  })
})
