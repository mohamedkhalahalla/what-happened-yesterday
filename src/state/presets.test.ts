import { describe, expect, it } from 'vitest'

import { dayIndexToISO, isoToDayIndex, weekday } from '../lib/time/riyadh'
import {
  PRESET_IDS,
  activePreset,
  comparisonIsShifted,
  comparisonShift,
  comparisonWeeksBack,
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
    // A rolling seven-day window would have drifted to 09-23..09-29 here,
    // cutting across two weekends. That is exactly why the preset is
    // Sunday-anchored rather than rolling.
  })
})

describe('PRESET_IDS', () => {
  it('offers exactly three presets', () => {
    // "Last 7 days" was removed: whenever today is a Sunday it is the same
    // seven days as "Last week", and two buttons that do the same thing make
    // a person wonder which one is subtly different.
    expect([...PRESET_IDS]).toEqual(['lastWeek', 'last30Days', 'quarter'])
  })
})

describe('activePreset', () => {
  it('recognises each preset range', () => {
    expect(activePreset(presetRange('lastWeek', bounds), bounds)).toBe('lastWeek')
    expect(activePreset(presetRange('last30Days', bounds), bounds)).toBe('last30Days')
    expect(activePreset(presetRange('quarter', bounds), bounds)).toBe('quarter')
  })

  it('recognises lastWeek whatever day of the week today is', () => {
    const midWeek = boundsOf({ firstDay: day('2026-06-29'), days: 93 })
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

  it('always names a comparison period of the same length, strictly earlier', () => {
    for (const preset of ['lastWeek', 'last30Days', 'quarter'] as const) {
      const range = presetRange(preset, bounds)
      const previous = comparisonRange(range)
      expect(previous.to - previous.from, preset).toBe(range.to - range.from)
      // Adjacency is no longer guaranteed: a 30-day range shifts back 35 days
      // to keep the weekday mix identical, leaving a deliberate 5-day gap.
      expect(previous.to, preset).toBeLessThan(range.from)
    }
  })
})

describe('comparisonRange is weekday-aligned', () => {
  /**
   * The bug this prevents: comparing 17-26 Sept (2 Fridays) against the 10
   * days immediately before it (1 Friday) reported a "notable" volume drop
   * that was purely an artefact of the weekend mix. Shifting by whole weeks
   * makes both windows contain the same weekdays.
   */
  const weekdayHistogram = (range: { from: number; to: number }): number[] => {
    const counts = [0, 0, 0, 0, 0, 0, 0]
    for (let d = range.from; d <= range.to; d++) counts[weekday(d)]! += 1
    return counts
  }

  it('shifts a 7-day range back 7 days', () => {
    const range = { from: day('2026-09-20'), to: day('2026-09-26') }
    expect(comparisonShift(range)).toBe(7)
    expect(comparisonWeeksBack(range)).toBe(1)
    expect(iso(comparisonRange(range))).toEqual(['2026-09-13', '2026-09-19'])
    // One week back is adjacent, so no extra explanation is needed.
    expect(comparisonIsShifted(range)).toBe(false)
  })

  it('shifts a 10-day range back 14 days, not 10', () => {
    // This is the exact case from the bug report.
    const range = { from: day('2026-09-17'), to: day('2026-09-26') }
    expect(comparisonShift(range)).toBe(14)
    expect(comparisonWeeksBack(range)).toBe(2)
    expect(iso(comparisonRange(range))).toEqual(['2026-09-03', '2026-09-12'])
    // There is now a gap, and the UI has to say so.
    expect(comparisonIsShifted(range)).toBe(true)
  })

  it('shifts a 30-day range back 35 days', () => {
    const range = presetRange('last30Days', bounds)
    expect(comparisonShift(range)).toBe(35)
    expect(comparisonWeeksBack(range)).toBe(5)
    expect(iso(comparisonRange(range))).toEqual(['2026-07-24', '2026-08-22'])
    expect(comparisonIsShifted(range)).toBe(true)
  })

  it('gives both periods the same count of every weekday', () => {
    for (const length of [1, 3, 7, 10, 14, 20, 30, 45, 90]) {
      const range = { from: day('2026-09-26') - length + 1, to: day('2026-09-26') }
      const previous = comparisonRange(range)

      expect(weekdayHistogram(previous), `length ${length}`).toEqual(weekdayHistogram(range))
    }
  })

  it('keeps both periods the same length', () => {
    for (const length of [1, 7, 10, 30]) {
      const range = { from: day('2026-09-26') - length + 1, to: day('2026-09-26') }
      const previous = comparisonRange(range)
      expect(previous.to - previous.from).toBe(range.to - range.from)
      expect(previous.to).toBeLessThan(range.from)
    }
  })

  it('never overlaps the range it compares against', () => {
    for (const length of [1, 5, 10, 30, 90]) {
      const range = { from: day('2026-09-26') - length + 1, to: day('2026-09-26') }
      expect(comparisonRange(range).to).toBeLessThan(range.from)
    }
  })
})
