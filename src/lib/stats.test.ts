import { describe, expect, it } from 'vitest'

import { compareCounts, compareRates } from './stats'

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
