import { describe, expect, it } from 'vitest'
import { scaleLinear } from 'd3-scale'

import { isoToDayIndex } from '../lib/time/riyadh'
import { axisTicks, thinTicks } from './Axis'
import { moveCursor } from './cursor'
import { chartDirection } from './direction'

const FIRST = isoToDayIndex('2026-06-29')
const LAST = isoToDayIndex('2026-09-26')

describe('chartDirection', () => {
  it('runs time from the start edge in English', () => {
    const direction = chartDirection('en')
    const x = scaleLinear().domain([FIRST, LAST]).range(direction.timeRange(800))

    expect(direction.isRtl).toBe(false)
    expect(x(FIRST)).toBeLessThan(x(LAST))
    expect(x(FIRST)).toBe(0)
    expect(x(LAST)).toBe(800)
  })

  it('reverses time in Arabic, earliest at the inline start', () => {
    const direction = chartDirection('ar')
    const x = scaleLinear().domain([FIRST, LAST]).range(direction.timeRange(800))

    expect(direction.isRtl).toBe(true)
    // The requirement in one line: the first day sits further right.
    expect(x(FIRST)).toBeGreaterThan(x(LAST))
    expect(x(FIRST)).toBe(800)
    expect(x(LAST)).toBe(0)
  })

  it('puts the value axis on the inline-start side in both languages', () => {
    expect(chartDirection('en').valueAxisX(800)).toBe(0)
    expect(chartDirection('ar').valueAxisX(800)).toBe(800)
  })

  it('mirrors text anchors', () => {
    expect(chartDirection('en').startAnchor).toBe('end')
    expect(chartDirection('ar').startAnchor).toBe('start')
    expect(chartDirection('en').endAnchor).toBe('start')
    expect(chartDirection('ar').endAnchor).toBe('end')
  })

  it('keeps a mid-domain day between the ends whichever way time runs', () => {
    const middle = Math.round((FIRST + LAST) / 2)
    for (const lang of ['en', 'ar'] as const) {
      const direction = chartDirection(lang)
      const x = scaleLinear().domain([FIRST, LAST]).range(direction.timeRange(800))
      const [low, high] = [x(FIRST), x(LAST)].sort((a, b) => a - b)
      expect(x(middle)).toBeGreaterThan(low!)
      expect(x(middle)).toBeLessThan(high!)
    }
  })
})

describe('moveCursor', () => {
  const COUNT = 90

  it('moves with the arrow in English', () => {
    expect(moveCursor('ArrowRight', 10, COUNT, false)).toBe(11)
    expect(moveCursor('ArrowLeft', 10, COUNT, false)).toBe(9)
  })

  it('mirrors the arrows in Arabic, so ArrowLeft goes to a later date', () => {
    // Time flows leftward under RTL, so pressing left must advance the date.
    expect(moveCursor('ArrowLeft', 10, COUNT, true)).toBe(11)
    expect(moveCursor('ArrowRight', 10, COUNT, true)).toBe(9)
  })

  it('does not mirror Home and End', () => {
    // These mean first and last in the data, as they do in every list and
    // text field the reader has used.
    for (const isRtl of [false, true]) {
      expect(moveCursor('Home', 42, COUNT, isRtl)).toBe(0)
      expect(moveCursor('End', 42, COUNT, isRtl)).toBe(COUNT - 1)
    }
  })

  it('clamps at both ends rather than wrapping', () => {
    for (const isRtl of [false, true]) {
      const back = isRtl ? 'ArrowRight' : 'ArrowLeft'
      const forward = isRtl ? 'ArrowLeft' : 'ArrowRight'
      expect(moveCursor(back, 0, COUNT, isRtl)).toBe(0)
      expect(moveCursor(forward, COUNT - 1, COUNT, isRtl)).toBe(COUNT - 1)
    }
  })

  it('ignores keys it does not handle, so they can bubble', () => {
    for (const key of ['a', 'Tab', 'Escape', 'ArrowUp', 'ArrowDown', 'PageUp', ' ']) {
      expect(moveCursor(key, 5, COUNT, false), key).toBeNull()
    }
  })

  it('handles an empty series without moving anywhere', () => {
    for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
      expect(moveCursor(key, 0, 0, false), key).toBeNull()
    }
  })

  it('works on a single-point series', () => {
    expect(moveCursor('ArrowRight', 0, 1, false)).toBe(0)
    expect(moveCursor('Home', 0, 1, false)).toBe(0)
    expect(moveCursor('End', 0, 1, false)).toBe(0)
  })

  it('is reversible: forward then back returns to the start', () => {
    for (const isRtl of [false, true]) {
      const forward = isRtl ? 'ArrowLeft' : 'ArrowRight'
      const back = isRtl ? 'ArrowRight' : 'ArrowLeft'
      const moved = moveCursor(forward, 30, COUNT, isRtl)!
      expect(moveCursor(back, moved, COUNT, isRtl)).toBe(30)
    }
  })
})

describe('thinTicks', () => {
  const sundays = Array.from({ length: 13 }, (_, i) => i)

  it('keeps every tick when there is room', () => {
    expect(thinTicks(sundays, 1200)).toEqual(sundays)
  })

  it('drops ticks on a narrow chart', () => {
    const narrow = thinTicks(sundays, 300)
    expect(narrow.length).toBeLessThan(sundays.length)
    expect(narrow.length).toBeGreaterThan(0)
    // Always keeps the first, so the axis has an anchor.
    expect(narrow[0]).toBe(0)
  })

  it('never returns nothing, however narrow', () => {
    expect(thinTicks(sundays, 10).length).toBeGreaterThan(0)
    expect(thinTicks(sundays, 0).length).toBeGreaterThan(0)
  })

  it('handles an empty input', () => {
    expect(thinTicks([], 800)).toEqual([])
  })
})

describe('axisTicks', () => {
  it('always includes the domain maximum, so the tallest bar has a label', () => {
    // 0-28.4% would otherwise be labelled 0/10/20% and the tallest bar would
    // sail past the last tick with nothing to read it against.
    const scale = scaleLinear().domain([0, 0.284]).range([100, 0])
    const ticks = axisTicks(scale, 3)

    expect(ticks[ticks.length - 1]).toBeCloseTo(0.284, 10)
    expect(ticks[0]).toBe(0)
  })

  it('never emits a tick above the domain maximum', () => {
    for (const max of [0.05, 0.1, 0.284, 0.5, 1]) {
      const scale = scaleLinear().domain([0, max]).range([100, 0])
      for (const tick of axisTicks(scale, 3)) {
        expect(tick, `max ${max}`).toBeLessThanOrEqual(max)
      }
    }
  })

  it('drops a round tick that would collide with the maximum', () => {
    const scale = scaleLinear().domain([0, 0.201]).range([100, 0])
    const ticks = axisTicks(scale, 3)
    // 20% and 20.1% must not both appear.
    expect(ticks.filter((tick) => Math.abs(tick - 0.2) < 0.005)).toHaveLength(1)
  })

  it('keeps a clean scale clean', () => {
    const scale = scaleLinear().domain([0, 1]).range([100, 0])
    expect(axisTicks(scale, 4)).toContain(1)
    expect(axisTicks(scale, 4)[0]).toBe(0)
  })
})
