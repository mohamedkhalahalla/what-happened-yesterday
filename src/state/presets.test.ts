import { describe, expect, it } from 'vitest'

import { dayIndexToISO, isoToDayIndex, weekday } from '../lib/time/riyadh'
import {
  activePreset,
  boundsOf,
  comparisonCoverage,
  comparisonRange,
  defaultRange,
  presetRange,
  type DataBounds,
} from './presets'

const day = (iso: string): number => isoToDayIndex(iso)

/** The real dataset's shape: 2026-06-29 … 2026-09-26, so "today" is 09-27. */
const DATASET = { firstDay: day('2026-06-29'), days: 90 }
const bounds: DataBounds = boundsOf(DATASET)

/** Render a range as ISO, so failures read as dates rather than day indices. */
const iso = (range: { from: number; to: number }): [string, string] => [
  dayIndexToISO(range.from),
  dayIndexToISO(range.to),
]

describe('boundsOf', () => {
  it('derives the data edges and "today" from the dataset', () => {
    expect(dayIndexToISO(bounds.firstDay)).toBe('2026-06-29')
    expect(dayIndexToISO(bounds.lastDay)).toBe('2026-09-26')
    // Today is the day after the last complete day, not the wall clock.
    expect(dayIndexToISO(bounds.today)).toBe('2026-09-27')
    expect(weekday(bounds.today)).toBe(0) // a Sunday
  })
})

describe('presetRange', () => {
  it('lastWeek is the last complete Sunday-Saturday week', () => {
    expect(iso(presetRange('lastWeek', bounds))).toEqual(['2026-09-20', '2026-09-26'])
    expect(weekday(presetRange('lastWeek', bounds).from)).toBe(0) // Sunday
    expect(weekday(presetRange('lastWeek', bounds).to)).toBe(6) // Saturday
  })

  it('last7Days is the seven days ending yesterday', () => {
    expect(iso(presetRange('last7Days', bounds))).toEqual(['2026-09-20', '2026-09-26'])
  })

  it('last30Days is the thirty days ending yesterday', () => {
    expect(iso(presetRange('last30Days', bounds))).toEqual(['2026-08-28', '2026-09-26'])
    const range = presetRange('last30Days', bounds)
    expect(range.to - range.from + 1).toBe(30)
  })

  it('quarter is every day in the dataset', () => {
    expect(iso(presetRange('quarter', bounds))).toEqual(['2026-06-29', '2026-09-26'])
  })

  it('clamps a preset that would reach before the data', () => {
    // A dataset only 10 days long cannot supply 30 days.
    const short = boundsOf({ firstDay: day('2026-09-17'), days: 10 })
    const range = presetRange('last30Days', short)
    expect(range.from).toBe(short.firstDay)
    expect(range.to).toBe(short.lastDay)
  })

  it('defaults to lastWeek', () => {
    expect(defaultRange(bounds)).toEqual(presetRange('lastWeek', bounds))
  })
})

describe('presetRange on a mid-week "today"', () => {
  /**
   * The Sunday-based definition only earns its keep when today is *not* a
   * Sunday: "last week" must still mean the previous whole week, not a
   * rolling seven days.
   */
  it('still returns the previous whole week when today is a Wednesday', () => {
    // 2026-09-30 is a Wednesday, so data would end 09-29.
    const midWeek = boundsOf({ firstDay: day('2026-06-29'), days: 93 })
    expect(dayIndexToISO(midWeek.today)).toBe('2026-09-30')
    expect(weekday(midWeek.today)).toBe(3)

    expect(iso(presetRange('lastWeek', midWeek))).toEqual(['2026-09-20', '2026-09-26'])
    // Where a rolling window would have drifted:
    expect(iso(presetRange('last7Days', midWeek))).toEqual(['2026-09-23', '2026-09-29'])
  })
})

describe('activePreset', () => {
  it('recognises each preset range', () => {
    expect(activePreset(presetRange('lastWeek', bounds), bounds)).toBe('lastWeek')
    expect(activePreset(presetRange('last30Days', bounds), bounds)).toBe('last30Days')
    expect(activePreset(presetRange('quarter', bounds), bounds)).toBe('quarter')
  })

  it('resolves the lastWeek / last7Days tie in favour of lastWeek', () => {
    // On this dataset today is a Sunday, so the two presets are the same seven
    // days and no function could tell them apart. First match wins, and
    // lastWeek is the one a person would have meant.
    expect(presetRange('last7Days', bounds)).toEqual(presetRange('lastWeek', bounds))
    expect(activePreset(presetRange('last7Days', bounds), bounds)).toBe('lastWeek')
  })

  it('distinguishes them when today is not a Sunday', () => {
    const midWeek = boundsOf({ firstDay: day('2026-06-29'), days: 93 })
    expect(activePreset(presetRange('last7Days', midWeek), midWeek)).toBe('last7Days')
    expect(activePreset(presetRange('lastWeek', midWeek), midWeek)).toBe('lastWeek')
  })

  it('calls anything else custom', () => {
    expect(activePreset({ from: day('2026-09-21'), to: day('2026-09-26') }, bounds)).toBe('custom')
    expect(activePreset({ from: day('2026-09-20'), to: day('2026-09-25') }, bounds)).toBe('custom')
  })
})

describe('comparisonCoverage', () => {
  it('is full when the previous period fits inside the data', () => {
    expect(comparisonCoverage(presetRange('lastWeek', bounds), bounds)).toBe('full')
    expect(comparisonCoverage(presetRange('last30Days', bounds), bounds)).toBe('full')
  })

  it('is none when the whole dataset is selected', () => {
    // The previous quarter simply does not exist in this data. Showing a
    // delta here would read as a total collapse rather than as no history.
    expect(comparisonCoverage(presetRange('quarter', bounds), bounds)).toBe('none')
  })

  it('is partial when the previous period only half-reaches the data', () => {
    // Starts 3 days after the data begins, so 3 of its 7 comparison days exist.
    const range = { from: bounds.firstDay + 3, to: bounds.firstDay + 9 }
    expect(comparisonCoverage(range, bounds)).toBe('partial')

    const previous = comparisonRange(range)
    expect(previous.from).toBe(bounds.firstDay - 4)
    expect(previous.to).toBe(bounds.firstDay + 2)
  })

  it('is full for a range starting exactly one period after the data begins', () => {
    const range = { from: bounds.firstDay + 7, to: bounds.firstDay + 13 }
    expect(comparisonCoverage(range, bounds)).toBe('full')
  })

  it('is none for a range starting on the first day of data', () => {
    const range = { from: bounds.firstDay, to: bounds.firstDay + 6 }
    expect(comparisonCoverage(range, bounds)).toBe('none')
  })

  it('always names a comparison period of the same length', () => {
    for (const preset of ['lastWeek', 'last30Days', 'quarter'] as const) {
      const range = presetRange(preset, bounds)
      const previous = comparisonRange(range)
      expect(previous.to - previous.from).toBe(range.to - range.from)
      expect(previous.to).toBe(range.from - 1)
    }
  })
})
