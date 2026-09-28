import { describe, expect, it } from 'vitest'

import {
  RIYADH_OFFSET_SEC,
  dayIndexToISO,
  isWorkday,
  isoToDayIndex,
  previousPeriod,
  rangeLength,
  riyadhDayIndex,
  riyadhHour,
  riyadhMidnightEpochSec,
  startOfWeek,
  weekday,
  type DayRange,
} from './riyadh'

/**
 * Epoch seconds for a UTC instant, built without any local-time API.
 * (`Date.parse` on a `Z`-suffixed ISO string is time-zone independent.)
 */
const utc = (iso: string): number => Date.parse(iso) / 1000

// Weekday names indexed the way `weekday()` numbers them.
const SUN = 0
const FRI = 5
const SAT = 6

describe('riyadhDayIndex / riyadhHour', () => {
  it('rolls over to the next Riyadh day at 21:00Z', () => {
    const t = utc('2026-01-01T21:00:00Z')
    expect(dayIndexToISO(riyadhDayIndex(t))).toBe('2026-01-02')
    expect(riyadhHour(t)).toBe(0)
  })

  it('is still the previous Riyadh day one second earlier', () => {
    const t = utc('2026-01-01T20:59:59Z')
    expect(dayIndexToISO(riyadhDayIndex(t))).toBe('2026-01-01')
    expect(riyadhHour(t)).toBe(23)
  })

  it('offsets midday by exactly +3', () => {
    expect(riyadhHour(utc('2026-06-15T12:00:00Z'))).toBe(15)
    expect(riyadhHour(utc('2026-06-15T00:00:00Z'))).toBe(3)
  })

  it('covers all 24 hours in order across a Riyadh day', () => {
    const start = riyadhMidnightEpochSec(isoToDayIndex('2026-03-10'))
    const hours = Array.from({ length: 24 }, (_, h) => riyadhHour(start + h * 3600))
    expect(hours).toEqual(Array.from({ length: 24 }, (_, h) => h))
  })

  it('floors correctly for pre-epoch timestamps', () => {
    // 1969-12-31T21:00:00Z is exactly 1970-01-01T00:00 Riyadh → day 0.
    expect(riyadhDayIndex(utc('1969-12-31T21:00:00Z'))).toBe(0)
    expect(riyadhHour(utc('1969-12-31T21:00:00Z'))).toBe(0)
    expect(riyadhDayIndex(utc('1969-12-31T20:59:59Z'))).toBe(-1)
    expect(riyadhHour(utc('1969-12-31T20:59:59Z'))).toBe(23)
  })

  it('exports the fixed +03:00 offset', () => {
    expect(RIYADH_OFFSET_SEC).toBe(10800)
  })
})

describe('weekday / isWorkday', () => {
  it('numbers 2026-09-27 as Sunday and 2026-10-02 as Friday', () => {
    expect(weekday(isoToDayIndex('2026-09-27'))).toBe(SUN)
    expect(weekday(isoToDayIndex('2026-10-02'))).toBe(FRI)
  })

  it('numbers the epoch day (1970-01-01) as Thursday', () => {
    expect(weekday(0)).toBe(4)
  })

  it('is correct for negative day indices', () => {
    // 1969-12-31 was a Wednesday.
    expect(weekday(-1)).toBe(3)
    expect(weekday(-7)).toBe(4)
    expect(weekday(-8)).toBe(3)
  })

  it('treats Sunday…Thursday as workdays and Friday/Saturday as weekend', () => {
    const week = [
      ['2026-09-27', true], // Sunday
      ['2026-09-28', true], // Monday
      ['2026-09-29', true], // Tuesday
      ['2026-09-30', true], // Wednesday
      ['2026-10-01', true], // Thursday
      ['2026-10-02', false], // Friday
      ['2026-10-03', false], // Saturday
    ] as const

    for (const [iso, expected] of week) {
      expect(isWorkday(isoToDayIndex(iso)), iso).toBe(expected)
    }

    expect(weekday(isoToDayIndex('2026-10-03'))).toBe(SAT)
  })
})

describe('startOfWeek', () => {
  it('walks a Wednesday back to its Sunday', () => {
    expect(dayIndexToISO(startOfWeek(isoToDayIndex('2026-09-30')))).toBe('2026-09-27')
  })

  it('leaves a Sunday unchanged', () => {
    const sunday = isoToDayIndex('2026-09-27')
    expect(startOfWeek(sunday)).toBe(sunday)
  })

  it('always lands on a Sunday, at most 6 days back', () => {
    const base = isoToDayIndex('2026-09-27')
    for (let d = base - 400; d < base + 400; d++) {
      const s = startOfWeek(d)
      expect(weekday(s)).toBe(SUN)
      expect(d - s).toBeGreaterThanOrEqual(0)
      expect(d - s).toBeLessThanOrEqual(6)
    }
  })
})

describe('dayIndexToISO / isoToDayIndex', () => {
  it('round-trips across a multi-year span, including leap days', () => {
    const start = isoToDayIndex('2019-01-01')
    const end = isoToDayIndex('2031-12-31')
    for (let d = start; d <= end; d++) {
      expect(isoToDayIndex(dayIndexToISO(d))).toBe(d)
    }
  })

  it('handles the 2024 leap day and its neighbours', () => {
    const feb29 = isoToDayIndex('2024-02-29')
    expect(dayIndexToISO(feb29)).toBe('2024-02-29')
    expect(dayIndexToISO(feb29 - 1)).toBe('2024-02-28')
    expect(dayIndexToISO(feb29 + 1)).toBe('2024-03-01')
    expect(isoToDayIndex('2024-03-01') - isoToDayIndex('2024-02-01')).toBe(29)
  })

  it('has no 29 February in the non-leap years 2023, 2026 and 2100', () => {
    expect(() => isoToDayIndex('2023-02-29')).toThrow()
    expect(() => isoToDayIndex('2026-02-29')).toThrow()
    expect(() => isoToDayIndex('2100-02-29')).toThrow()
    expect(dayIndexToISO(isoToDayIndex('2000-02-29'))).toBe('2000-02-29') // 2000 is a leap year
  })

  it('anchors day 0 at 1970-01-01', () => {
    expect(dayIndexToISO(0)).toBe('1970-01-01')
    expect(isoToDayIndex('1970-01-01')).toBe(0)
    expect(dayIndexToISO(-1)).toBe('1969-12-31')
  })

  it('rejects impossible dates and sloppy formats', () => {
    for (const bad of [
      '2026-02-30',
      '2026-2-3',
      '',
      '2026-13-01',
      '2026-00-10',
      '2026-01-00',
      '2026-01-32',
      '2026-04-31',
      '26-01-02',
      '2026-01-02T00:00:00Z',
      '2026/01/02',
      ' 2026-01-02',
      '2026-01-02 ',
      'not-a-date',
    ]) {
      expect(() => isoToDayIndex(bad), JSON.stringify(bad)).toThrow(RangeError)
    }
  })
})

describe('riyadhMidnightEpochSec', () => {
  it('maps back to the same day at hour 0', () => {
    for (const iso of ['2026-01-01', '2026-02-28', '2024-02-29', '1970-01-01', '2031-12-31']) {
      const d = isoToDayIndex(iso)
      const midnight = riyadhMidnightEpochSec(d)
      expect(riyadhDayIndex(midnight)).toBe(d)
      expect(riyadhHour(midnight)).toBe(0)
      // One second earlier belongs to the previous day's last hour.
      expect(riyadhDayIndex(midnight - 1)).toBe(d - 1)
      expect(riyadhHour(midnight - 1)).toBe(23)
    }
  })

  it('is 21:00Z on the preceding UTC date', () => {
    expect(riyadhMidnightEpochSec(isoToDayIndex('2026-01-02'))).toBe(utc('2026-01-01T21:00:00Z'))
  })

  it('advances by exactly 86400 seconds per day', () => {
    const d = isoToDayIndex('2026-06-01')
    expect(riyadhMidnightEpochSec(d + 1) - riyadhMidnightEpochSec(d)).toBe(86400)
  })
})

describe('rangeLength / previousPeriod', () => {
  it('counts inclusive ranges', () => {
    const from = isoToDayIndex('2026-09-20')
    expect(rangeLength({ from, to: from })).toBe(1)
    expect(rangeLength({ from, to: from + 6 })).toBe(7)
  })

  it('shifts a 7-day range back by 7 days', () => {
    const r: DayRange = { from: isoToDayIndex('2026-09-20'), to: isoToDayIndex('2026-09-26') }
    const prev = previousPeriod(r)
    expect(dayIndexToISO(prev.from)).toBe('2026-09-13')
    expect(dayIndexToISO(prev.to)).toBe('2026-09-19')
    expect(rangeLength(prev)).toBe(rangeLength(r))
  })

  it('shifts a 1-day range to the day before', () => {
    const day = isoToDayIndex('2026-09-27')
    const prev = previousPeriod({ from: day, to: day })
    expect(dayIndexToISO(prev.from)).toBe('2026-09-26')
    expect(dayIndexToISO(prev.to)).toBe('2026-09-26')
    expect(rangeLength(prev)).toBe(1)
  })

  it('never overlaps the original range and stays adjacent to it', () => {
    for (let len = 1; len <= 40; len++) {
      const from = isoToDayIndex('2026-03-01')
      const r: DayRange = { from, to: from + len - 1 }
      const prev = previousPeriod(r)
      expect(rangeLength(prev)).toBe(len)
      expect(prev.to).toBe(r.from - 1)
    }
  })
})

describe('time-zone independence', () => {
  /**
   * The module must be a pure function of its inputs, so results cannot depend
   * on `process.env.TZ`. This test re-runs the same assertions under several
   * wildly different zones; `npm run test:tz` additionally runs the *whole*
   * suite three times with TZ set before the process starts, which also covers
   * any zone caching the runtime does at startup.
   */
  const zones = ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Asia/Riyadh', 'Asia/Kolkata']

  const snapshot = () => {
    const t = utc('2026-01-01T21:00:00Z')
    const d = isoToDayIndex('2026-09-30')
    return {
      dayIndex: riyadhDayIndex(t),
      hour: riyadhHour(t),
      iso: dayIndexToISO(riyadhDayIndex(t)),
      weekday: weekday(d),
      workday: isWorkday(d),
      weekStart: dayIndexToISO(startOfWeek(d)),
      midnight: riyadhMidnightEpochSec(d),
      prev: previousPeriod({ from: d - 6, to: d }),
      roundTrip: isoToDayIndex(dayIndexToISO(d)),
    }
  }

  it('produces identical results under every process time zone', () => {
    const original = process.env.TZ
    try {
      const results = zones.map((tz) => {
        process.env.TZ = tz
        return snapshot()
      })
      const first = results[0]
      expect(first).toBeDefined()
      for (const [i, r] of results.entries()) {
        expect(r, zones[i]).toEqual(first)
      }
      // Sanity: the snapshot is the expected Riyadh answer, not just self-consistent.
      expect(first).toMatchObject({ iso: '2026-01-02', hour: 0, weekday: 3, workday: true })
    } finally {
      if (original === undefined) delete process.env.TZ
      else process.env.TZ = original
    }
  })

  it('agrees with Intl formatting in Asia/Riyadh for a sample of instants', () => {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Riyadh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
    })

    // Every 7h13m for ~200 days: hits every hour-of-day and both sides of midnight.
    let t = utc('2026-01-01T00:00:00Z')
    for (let i = 0; i < 700; i++) {
      const parts = fmt.formatToParts(new Date(t * 1000))
      const get = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((p) => p.type === type)?.value ?? ''
      const expectedIso = `${get('year')}-${get('month')}-${get('day')}`
      // en-CA renders midnight as "24" in some engines; normalise to 0.
      const expectedHour = Number(get('hour')) % 24

      expect(dayIndexToISO(riyadhDayIndex(t)), String(t)).toBe(expectedIso)
      expect(riyadhHour(t), String(t)).toBe(expectedHour)

      t += 7 * 3600 + 13 * 60
    }
  })
})
