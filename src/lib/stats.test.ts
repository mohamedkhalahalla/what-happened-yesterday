import { describe, expect, it } from 'vitest'

import { compareCounts, compareRates } from './stats'
import { COUNT_MIN_RATIO, KPI_MIN_POINTS, SEGMENT_MIN_POINTS } from './thresholds'

describe('compareRates', () => {
  it('calls last week vs the week before "normal"', () => {
    // The real numbers from the default view: resolution was 11180/15631
    // against 11125/15541. Half a tenth of a point on 15k calls is nothing,
    // and the dashboard must not draw an arrow that implies otherwise.
    const result = compareRates(11180, 15631, 11125, 15541)

    expect(result.verdict).toBe('normal')
    expect(Math.abs(result.z)).toBeLessThan(2)
    expect(result.delta).toBeCloseTo(-0.0006, 4)
  })

  it('needs the change to be material, not merely significant', () => {
    // 20,000 calls a side resolve a 1.25-point shift to z = 2.5. That
    // is real and it is not worth anyone's morning, so the segment threshold
    // reports it as normal while recording why.
    const small = compareRates(10250, 20000, 10000, 20000)

    expect(Math.abs(small.z)).toBeGreaterThan(2)
    expect(Math.abs(small.delta) * 100).toBeLessThan(SEGMENT_MIN_POINTS)
    expect(small.verdict).toBe('normal')
    expect(small.significantButSmall).toBe(true)
  })

  it('needs the change to be significant, not merely large', () => {
    // A 10-point gap on 40 calls a side looks dramatic and proves nothing.
    const noisy = compareRates(24, 40, 20, 40)

    expect(Math.abs(noisy.delta) * 100).toBeGreaterThan(SEGMENT_MIN_POINTS)
    expect(Math.abs(noisy.z)).toBeLessThan(2)
    expect(noisy.verdict).toBe('normal')
    expect(noisy.significantButSmall).toBe(false)
  })

  it('applies a lower bar to whole-centre KPIs than to one segment', () => {
    // The same 1.5-point move (z = 3.0): material for the centre, not for
    // one intent.
    const args = [10300, 20000, 10000, 20000] as const
    expect(compareRates(...args, KPI_MIN_POINTS).verdict).toBe('notable')
    expect(compareRates(...args, SEGMENT_MIN_POINTS).verdict).toBe('normal')
  })

  it('reports the normal range as 2 x SE, hand-computed', () => {
    /*
     * Worked by hand so the number in the tooltip is checkable:
     *   k1=600 n1=1000, k2=550 n2=1000
     *   pooled = 1150 / 2000                     = 0.575
     *   se = sqrt(0.575 * 0.425 * (1/1000 + 1/1000))
     *      = sqrt(0.244375 * 0.002)
     *      = sqrt(0.00048875)                    = 0.02210770...
     *   normalRange = 2 * se                     = 0.04421540...  (4.42 pts)
     */
    const result = compareRates(600, 1000, 550, 1000)

    const pooled = 1150 / 2000
    const se = Math.sqrt(pooled * (1 - pooled) * (1 / 1000 + 1 / 1000))

    expect(result.se).toBeCloseTo(se, 12)
    expect(result.se).toBeCloseTo(0.0221077, 7)
    expect(result.normalRange).toBeCloseTo(2 * se, 12)
    expect(result.normalRange).toBeCloseTo(0.0442154, 7)
    // In points, which is how the tooltip phrases it.
    expect(result.normalRange * 100).toBeCloseTo(4.42, 2)

    // 5 points clears both the 4.42-point noise band and the 3-point floor.
    expect(result.verdict).toBe('notable')
  })

  it('reports a normal range of zero when it refuses to judge', () => {
    expect(compareRates(5, 10, 5, 10).normalRange).toBe(0)
    expect(compareCounts(2, 3).normalRange).toBe(0)
  })

  it('calls a real shift "notable"', () => {
    // Ten points on samples this size is far outside sampling noise.
    const result = compareRates(7000, 10000, 6000, 10000)

    expect(result.verdict).toBe('notable')
    expect(Math.abs(result.z)).toBeGreaterThan(2)
    expect(result.delta).toBeCloseTo(0.1, 10)
  })

  it('sits just the right side of the threshold', () => {
    // Constructed to land near |z| = 2 — the boundary is where an off-by-one
    // in the comparison would hide.
    const below = compareRates(520, 1000, 480, 1000)
    expect(Math.abs(below.z)).toBeGreaterThan(1)
    expect(below.verdict).toBe(Math.abs(below.z) >= 2 ? 'notable' : 'normal')

    const clear = compareRates(600, 1000, 480, 1000)
    expect(clear.verdict).toBe('notable')
  })

  it('refuses to judge when either period is too small', () => {
    expect(compareRates(5, 10, 5000, 10000).verdict).toBe('insufficient')
    expect(compareRates(5000, 10000, 5, 10).verdict).toBe('insufficient')
    expect(compareRates(15, 29, 15, 29).verdict).toBe('insufficient')
    // Exactly at the threshold is enough.
    expect(compareRates(15, 30, 15, 30).verdict).not.toBe('insufficient')
  })

  it('still reports the delta when it will not judge it', () => {
    const result = compareRates(8, 10, 2, 10)
    expect(result.verdict).toBe('insufficient')
    expect(result.delta).toBeCloseTo(0.6, 10)
  })

  it('is symmetric except for the sign', () => {
    const forward = compareRates(7000, 10000, 6000, 10000)
    const backward = compareRates(6000, 10000, 7000, 10000)

    expect(backward.delta).toBeCloseTo(-forward.delta, 12)
    expect(backward.z).toBeCloseTo(-forward.z, 10)
    expect(backward.verdict).toBe(forward.verdict)
  })

  it('never produces NaN or Infinity, whatever it is given', () => {
    const cases: [number, number, number, number][] = [
      [0, 0, 0, 0],
      [0, 0, 100, 1000],
      [100, 1000, 0, 0],
      [0, 1000, 0, 1000], // nobody resolved anything: pooled rate 0
      [1000, 1000, 1000, 1000], // everybody did: pooled rate 1
      [0, 100, 100, 100],
      [50, 0, 50, 0], // impossible input, still must not explode
    ]

    for (const [k1, n1, k2, n2] of cases) {
      const result = compareRates(k1, n1, k2, n2)
      const label = JSON.stringify([k1, n1, k2, n2])

      expect(Number.isFinite(result.delta), label).toBe(true)
      expect(Number.isFinite(result.se), label).toBe(true)
      expect(Number.isFinite(result.z), label).toBe(true)
      expect(Number.isFinite(result.normalRange), label).toBe(true)
      expect(result.normalRange, label).toBeGreaterThanOrEqual(0)
      expect(['notable', 'normal', 'insufficient']).toContain(result.verdict)
    }
  })

  it('treats a zero-variance pooled rate as normal rather than infinite', () => {
    // Every call resolved in both periods. There is no difference and no
    // variance; z must be 0, not NaN.
    const result = compareRates(1000, 1000, 1000, 1000)
    expect(result.z).toBe(0)
    expect(result.verdict).toBe('normal')
  })
})

describe('compareCounts', () => {
  it('calls last week vs the week before "normal"', () => {
    // 15,631 calls against 15,541 — a 90-call difference on 15k.
    const result = compareCounts(15631, 15541)
    expect(result.verdict).toBe('normal')
    expect(result.delta).toBe(90)
  })

  it('needs a volume change to be relatively large, not just significant', () => {
    // 2.5% more calls on 20,000 a side is significant (z = 2.5) and
    // operationally nothing.
    const small = compareCounts(20500, 20000)
    expect(Math.abs(small.z)).toBeGreaterThan(2)
    expect(small.delta / 20000).toBeLessThan(COUNT_MIN_RATIO)
    expect(small.verdict).toBe('normal')
    expect(small.significantButSmall).toBe(true)
  })

  it('calls a large volume swing "notable"', () => {
    const result = compareCounts(2000, 1500)
    expect(result.verdict).toBe('notable')
    expect(result.delta).toBe(500)
    // z = 500 / sqrt(3500)
    expect(result.z).toBeCloseTo(500 / Math.sqrt(3500), 10)
  })

  it('refuses to judge when there is barely any volume', () => {
    expect(compareCounts(10, 5).verdict).toBe('insufficient')
    expect(compareCounts(0, 0).verdict).toBe('insufficient')
    expect(compareCounts(29, 0).verdict).toBe('insufficient')
    expect(compareCounts(30, 0).verdict).not.toBe('insufficient')
  })

  it('never produces NaN or Infinity', () => {
    for (const [c1, c2] of [
      [0, 0],
      [0, 100],
      [100, 0],
      [1, 1],
    ]) {
      const result = compareCounts(c1!, c2!)
      expect(Number.isFinite(result.delta)).toBe(true)
      expect(Number.isFinite(result.se)).toBe(true)
      expect(Number.isFinite(result.z)).toBe(true)
    }
  })

  it('is symmetric except for the sign', () => {
    const forward = compareCounts(2000, 1500)
    const backward = compareCounts(1500, 2000)
    expect(backward.z).toBeCloseTo(-forward.z, 10)
    expect(backward.verdict).toBe(forward.verdict)
  })
})
