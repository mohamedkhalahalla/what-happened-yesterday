/**
 * Asia/Riyadh calendar arithmetic.
 *
 * Riyadh is a **fixed UTC+3 offset with no DST**, so every conversion here is
 * plain integer arithmetic on epoch seconds — the module does not use `Date`
 * at all, let alone its host-local getters/setters or `toLocaleDateString`.
 * Results are therefore identical whatever the browser or OS is set to.
 *
 * Vocabulary used throughout the app:
 * - **epoch seconds**: integer seconds since 1970-01-01T00:00:00Z.
 * - **day index**: integer number of whole days since 1970-01-01 *in Riyadh
 *   time*. Day 0 is 1970-01-01 Riyadh (which began at 1969-12-31T21:00:00Z).
 */

/** Riyadh's fixed offset from UTC, in seconds (+03:00, never adjusted for DST). */
export const RIYADH_OFFSET_SEC = 3 * 3600

const SEC_PER_DAY = 86400
const SEC_PER_HOUR = 3600

/** Euclidean modulo: always returns a value in `[0, m)`, including for negative `n`. */
function mod(n: number, m: number): number {
  return ((n % m) + m) % m
}

/**
 * The Riyadh calendar day containing `epochSec`, as a day index.
 * Floors, so it is correct for pre-1970 (negative) timestamps too.
 */
export function riyadhDayIndex(epochSec: number): number {
  return Math.floor((epochSec + RIYADH_OFFSET_SEC) / SEC_PER_DAY)
}

/** The hour of the Riyadh day containing `epochSec`, `0..23`. */
export function riyadhHour(epochSec: number): number {
  return Math.floor(mod(epochSec + RIYADH_OFFSET_SEC, SEC_PER_DAY) / SEC_PER_HOUR)
}

/**
 * Day of the week for a day index: `0` = Sunday … `6` = Saturday.
 * 1970-01-01 (day 0) was a Thursday, hence the `+ 4` shift.
 */
export function weekday(dayIndex: number): number {
  return mod(dayIndex + 4, 7)
}

/** The day index of the Sunday on or before `dayIndex` (weeks start on Sunday). */
export function startOfWeek(dayIndex: number): number {
  return dayIndex - weekday(dayIndex)
}

/** Whether `dayIndex` falls in the Saudi work week (Sunday…Thursday). */
export function isWorkday(dayIndex: number): boolean {
  return weekday(dayIndex) <= 4
}

/** Number of days in `month` (`1..12`) of the proleptic Gregorian `year`. */
function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
    return isLeap ? 29 : 28
  }
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31
}

/**
 * Days from 1970-01-01 to the proleptic Gregorian date `y-m-d`
 * (Howard Hinnant's `days_from_civil`; pure integer arithmetic, no `Date`).
 */
function daysFromCivil(y: number, m: number, d: number): number {
  const year = y - (m <= 2 ? 1 : 0)
  const era = Math.floor(year / 400)
  const yoe = year - era * 400 // [0, 399]
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1 // [0, 365]
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy // [0, 146096]
  return era * 146097 + doe - 719468
}

/** Inverse of {@link daysFromCivil} (Hinnant's `civil_from_days`). */
function civilFromDays(dayIndex: number): { year: number; month: number; day: number } {
  const z = dayIndex + 719468
  const era = Math.floor(z / 146097)
  const doe = z - era * 146097 // [0, 146096]
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  ) // [0, 399]
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100)) // [0, 365]
  const mp = Math.floor((5 * doy + 2) / 153) // [0, 11]
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1 // [1, 31]
  const month = mp + (mp < 10 ? 3 : -9) // [1, 12]
  return { year: yoe + era * 400 + (month <= 2 ? 1 : 0), month, day }
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0')
}

/** Format a day index as an ISO calendar date, `'YYYY-MM-DD'`. */
export function dayIndexToISO(dayIndex: number): string {
  const { year, month, day } = civilFromDays(dayIndex)
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Parse a strict `'YYYY-MM-DD'` string into a day index.
 *
 * @throws {RangeError} if the string is not exactly four-two-two zero-padded
 * digits (`'2026-2-3'` is rejected), or names a date that does not exist
 * (`'2026-02-30'`, `'2026-13-01'`).
 */
export function isoToDayIndex(iso: string): number {
  const m = ISO_DATE.exec(iso)
  if (!m) throw new RangeError(`Invalid ISO date: ${JSON.stringify(iso)} (expected YYYY-MM-DD)`)

  // Non-null: the regex has three capture groups, so all three matched.
  const year = Number(m[1]!)
  const month = Number(m[2]!)
  const day = Number(m[3]!)

  if (month < 1 || month > 12) throw new RangeError(`Invalid month in ISO date: ${iso}`)
  if (day < 1 || day > daysInMonth(year, month)) {
    throw new RangeError(`Invalid day in ISO date: ${iso}`)
  }

  return daysFromCivil(year, month, day)
}

/** UTC epoch seconds of 00:00 Riyadh on `dayIndex` (i.e. 21:00Z the day before). */
export function riyadhMidnightEpochSec(dayIndex: number): number {
  return dayIndex * SEC_PER_DAY - RIYADH_OFFSET_SEC
}

/** An inclusive span of Riyadh days, as day indices. */
export type DayRange = { from: number; to: number }

/** Number of days in `r`, counting both endpoints (so `{from: d, to: d}` is 1). */
export function rangeLength(r: DayRange): number {
  return r.to - r.from + 1
}

/**
 * The equally long range immediately before `r`, ending the day before `r.from`.
 * Used for period-over-period comparisons ("yesterday vs. the day before").
 */
export function previousPeriod(r: DayRange): DayRange {
  const len = rangeLength(r)
  return { from: r.from - len, to: r.from - 1 }
}
