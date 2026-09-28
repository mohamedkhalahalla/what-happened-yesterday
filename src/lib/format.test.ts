import { describe, expect, it } from 'vitest'

import {
  formatCompact,
  formatDay,
  formatDayLong,
  formatDayRange,
  formatDurationSec,
  formatHour,
  formatInstant,
  formatInt,
  formatPercent,
  formatPointsDelta,
  formatWeekdayShort,
  isolate,
  type UiLang,
} from './format'
import { isoToDayIndex, riyadhMidnightEpochSec } from './time/riyadh'

const LANGS: UiLang[] = ['ar', 'en']

/** Arabic-Indic digits ٠-٩. The app uses Western digits in both languages. */
const ARABIC_INDIC = /[٠-٩]/
/** Extended Arabic-Indic digits ۰-۹ (Persian/Urdu), equally unwanted. */
const EXTENDED_ARABIC_INDIC = /[۰-۹]/

const FSI = String.fromCharCode(0x2068)
const NBSP = String.fromCharCode(0x00a0)
const PDI = String.fromCharCode(0x2069)

const SEP_20 = isoToDayIndex('2026-09-20')
const SEP_26 = isoToDayIndex('2026-09-26')

describe('digits', () => {
  it('never emits Arabic-Indic digits in Arabic', () => {
    const samples = [
      formatInt('ar', 15631),
      formatInt('ar', 0),
      formatCompact('ar', 15631),
      formatCompact('ar', 1250000),
      formatPercent('ar', 0.7152),
      formatPointsDelta('ar', 0.004),
      formatPointsDelta('ar', -0.004),
      formatDurationSec('ar', 45),
      formatDurationSec('ar', 185),
      formatDurationSec('ar', 3700),
      formatDay('ar', SEP_20),
      formatDayLong('ar', SEP_20),
      formatDayRange('ar', SEP_20, SEP_26),
      formatHour('ar', 21),
      formatInstant('ar', riyadhMidnightEpochSec(SEP_20) + 21 * 3600),
      ...Array.from({ length: 7 }, (_, w) => formatWeekdayShort('ar', w)),
    ]

    for (const sample of samples) {
      expect(ARABIC_INDIC.test(sample), `Arabic-Indic digits in ${JSON.stringify(sample)}`).toBe(
        false,
      )
      expect(EXTENDED_ARABIC_INDIC.test(sample), JSON.stringify(sample)).toBe(false)
    }
  })

  it('still writes Arabic words in Arabic', () => {
    // Guards against "no Arabic-Indic digits" being satisfied by falling back
    // to an English locale entirely.
    expect(formatCompact('ar', 15631)).toContain('ألف')
    expect(formatPointsDelta('ar', 0.004)).toContain('نقطة')
    expect(formatDay('ar', SEP_20)).toMatch(/[؀-ۿ]/)
  })
})

describe('formatInt / formatCompact / formatPercent', () => {
  it('groups whole numbers', () => {
    expect(formatInt('en', 15631)).toBe('15,631')
    expect(formatInt('ar', 15631)).toBe('15,631')
    expect(formatInt('en', 0)).toBe('0')
  })

  it('compacts large numbers per language', () => {
    expect(formatCompact('en', 15631)).toBe('15.6K')
    expect(formatCompact('ar', 15631)).toBe(`15.6${NBSP}ألف`)
    expect(formatCompact('en', 1250000)).toBe('1.3M')
  })

  it('formats a ratio as a percentage', () => {
    expect(formatPercent('en', 0.7152)).toBe('71.5%')
    expect(formatPercent('en', 0.7152, 0)).toBe('72%')
    expect(formatPercent('en', 1)).toBe('100.0%')
    expect(formatPercent('en', 0)).toBe('0.0%')
    // Arabic uses its own percent sign, which is correct, not a digit issue.
    expect(formatPercent('ar', 0.7152)).toContain('71.5')
  })
})

describe('formatPointsDelta', () => {
  it('always shows an explicit sign, including zero', () => {
    expect(formatPointsDelta('en', 0.004)).toContain('+0.4')
    expect(formatPointsDelta('en', -0.004)).toContain('-0.4')
    expect(formatPointsDelta('en', 0)).toContain('+0.0')
  })

  it('labels the unit per language', () => {
    expect(formatPointsDelta('en', 0.004)).toContain('pts')
    expect(formatPointsDelta('ar', 0.004)).toContain('نقطة')
  })

  it('keeps the sign attached to the digits', () => {
    for (const lang of LANGS) {
      for (const delta of [0.004, -0.004, 0.123, -0.123, 0]) {
        const out = formatPointsDelta(lang, delta)
        // Whatever bidi marks Intl adds, sign and first digit stay adjacent.
        expect(out, `${lang} ${delta}`).toMatch(/[+\-−]\d/)
      }
    }
  })

  it('wraps the result in a bidi isolate', () => {
    for (const lang of LANGS) {
      const out = formatPointsDelta(lang, -0.004)
      expect(out.startsWith(FSI), lang).toBe(true)
      expect(out.endsWith(PDI), lang).toBe(true)
    }
  })
})

describe('formatDurationSec', () => {
  it('picks units by magnitude', () => {
    expect(formatDurationSec('en', 45)).toBe('45 secs')
    expect(formatDurationSec('en', 180)).toBe('3 mins')
    expect(formatDurationSec('en', 185)).toBe('3 mins 5 secs')
    expect(formatDurationSec('en', 3600)).toBe('1 hr')
    expect(formatDurationSec('en', 3900)).toBe('1 hr 5 mins')
  })

  it('never renders a negative duration', () => {
    expect(formatDurationSec('en', -5)).toBe('0 secs')
  })
})

describe('dates and times', () => {
  it('formats a Riyadh day', () => {
    expect(formatDay('en', SEP_20)).toContain('20')
    expect(formatDay('en', SEP_20)).toMatch(/Sep/)
    expect(formatDay('ar', SEP_20)).toContain('20')
    expect(formatDay('ar', SEP_20)).toContain('سبتمبر')
  })

  it('formats an inclusive day range and collapses a single day', () => {
    const range = formatDayRange('en', SEP_20, SEP_26)
    expect(range).toContain('20')
    expect(range).toContain('26')
    expect(range.startsWith(FSI)).toBe(true)
    expect(range.endsWith(PDI)).toBe(true)

    expect(formatDayRange('en', SEP_20, SEP_20)).toBe(isolate(formatDay('en', SEP_20)))
  })

  it('numbers weekdays from Sunday', () => {
    expect(formatWeekdayShort('en', 0)).toBe('Sun')
    expect(formatWeekdayShort('en', 5)).toBe('Fri')
    expect(formatWeekdayShort('en', 6)).toBe('Sat')
    expect(formatWeekdayShort('ar', 0)).toContain('أحد')
  })

  it('uses a 24-hour clock in both languages', () => {
    for (const lang of LANGS) {
      expect(formatHour(lang, 21), lang).toBe('21:00')
      expect(formatHour(lang, 0), lang).toBe('00:00')
      expect(formatHour(lang, 9), lang).toBe('09:00')
    }
  })

  it('renders an instant at its Riyadh wall-clock time', () => {
    // 2026-09-20T18:43Z is 21:43 in Riyadh.
    const epochSec = riyadhMidnightEpochSec(SEP_20) + 21 * 3600 + 43 * 60
    for (const lang of LANGS) {
      expect(formatInstant(lang, epochSec), lang).toContain('21:43')
      expect(formatInstant(lang, epochSec), lang).toContain('20')
    }
  })
})

describe('time-zone independence', () => {
  /**
   * These run three more times under TZ=UTC, TZ=America/Los_Angeles and
   * TZ=Pacific/Kiritimati via `npm run test:tz`. The assertions below pin the
   * exact strings, so a formatter that forgot `timeZone: 'Asia/Riyadh'` and
   * silently used the host zone would fail there even though it passes here.
   */
  it('pins Riyadh dates regardless of the host zone', () => {
    expect(formatDay('en', SEP_20)).toBe('20 Sept')
    expect(formatDayLong('en', SEP_20)).toBe('20 September 2026')
    expect(formatWeekdayShort('en', 0)).toBe('Sun')
  })

  it('keeps an instant near midnight on its Riyadh day', () => {
    // 21:00Z on the 19th is already 00:00 on the 20th in Riyadh. A host in
    // Los Angeles would call this the 19th; Kiritimati, the 20th at 11:00.
    const justAfterRiyadhMidnight = riyadhMidnightEpochSec(SEP_20)
    expect(formatInstant('en', justAfterRiyadhMidnight)).toContain('20 Sept')
    expect(formatInstant('en', justAfterRiyadhMidnight)).toContain('00:00')

    // One second earlier is the previous Riyadh day, at 23:59.
    expect(formatInstant('en', justAfterRiyadhMidnight - 60)).toContain('19 Sept')
    expect(formatInstant('en', justAfterRiyadhMidnight - 60)).toContain('23:59')
  })

  it('formats every hour of the day identically whatever the host zone', () => {
    const hours = Array.from({ length: 24 }, (_, h) => formatHour('en', h))
    expect(hours).toEqual([
      '00:00',
      '01:00',
      '02:00',
      '03:00',
      '04:00',
      '05:00',
      '06:00',
      '07:00',
      '08:00',
      '09:00',
      '10:00',
      '11:00',
      '12:00',
      '13:00',
      '14:00',
      '15:00',
      '16:00',
      '17:00',
      '18:00',
      '19:00',
      '20:00',
      '21:00',
      '22:00',
      '23:00',
    ])
  })
})

describe('isolate', () => {
  it('wraps text in FSI…PDI', () => {
    expect(isolate('x')).toBe(`${FSI}x${PDI}`)
  })
})
