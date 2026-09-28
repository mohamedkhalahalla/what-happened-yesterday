/**
 * The single place in the app allowed to touch `Intl` or `toLocale*`.
 * An ESLint rule enforces that; everything else calls these functions.
 *
 * Two rules the whole dashboard depends on:
 *
 * 1. **Explicit locale.** Never the host default. Arabic uses
 *    `ar-SA-u-nu-latn` — Arabic text with Western digits 0-9, because the
 *    director reads dashboards in Arabic but reads *numbers* in Latin digits,
 *    and mixing ٤٢ with 42 across a page is worse than either alone.
 * 2. **Explicit time zone.** Every date formatter passes
 *    `timeZone: 'Asia/Riyadh'`, and every function takes a Riyadh day index,
 *    epoch seconds or an hour — never a `Date` from the caller. A `Date` would
 *    carry the host zone in with it, which is exactly the bug the rest of the
 *    codebase is built to avoid.
 *
 * ## Bidi approach
 *
 * Signed numbers and ranges flip when the bidi algorithm meets them inside
 * Arabic prose: `-0.4` can render with the minus on the wrong end, and
 * `20 Sep – 26 Sep` can reverse its endpoints. Two mechanisms, chosen per case:
 *
 * - **FSI…PDI (U+2068 / U+2069) inside the returned string** for
 *   {@link formatPointsDelta} and {@link formatDayRange}. Those two are
 *   *inherently* composite — a leading sign, or two dates around a dash — and
 *   they land in `aria-label` and `title` attributes and in concatenated
 *   sentences, where there is no element to hang markup on. The isolate has to
 *   travel with the string.
 * - **`<bdi>` via the `<Num>` component** for everything else. Simple values
 *   are only at risk where they are rendered next to other text, which is a
 *   DOM concern, and `<bdi>` keeps the strings themselves clean and
 *   comparable in tests.
 *
 * {@link isolate} is exported so callers assembling their own aria-label
 * strings can apply the same wrapping.
 */

import { riyadhMidnightEpochSec } from './time/riyadh'

/** The two UI languages. Arabic is the default. */
export type UiLang = 'ar' | 'en'

/**
 * BCP-47 locale per UI language.
 * `-u-nu-latn` forces Western digits in Arabic; without it Intl emits
 * Arabic-Indic digits (٠١٢…), which this app deliberately does not use.
 */
const LOCALE: Record<UiLang, string> = {
  ar: 'ar-SA-u-nu-latn',
  en: 'en-GB',
}

/** Fixed: the business runs on Riyadh time whatever the browser thinks. */
const TIME_ZONE = 'Asia/Riyadh'

const SEC_PER_MINUTE = 60
const SEC_PER_HOUR = 3600

// Built from code points rather than pasted: these characters are invisible,
// and an invisible literal in source is one stray keystroke from silent loss.

/** U+2068 First Strong Isolate — opens a run that takes direction from content. */
const FSI = String.fromCharCode(0x2068)
/** U+2069 Pop Directional Isolate — closes the innermost isolate. */
const PDI = String.fromCharCode(0x2069)
/** U+00A0 non-breaking space, as Intl itself uses between a number and its unit. */
const NBSP = String.fromCharCode(0x00a0)

/**
 * Wrap text so the surrounding paragraph's direction cannot reorder it.
 * Use when embedding a signed number, range or id into localized prose.
 */
export function isolate(text: string): string {
  return `${FSI}${text}${PDI}`
}

// --- formatter caches ------------------------------------------------------
//
// Constructing an Intl formatter is expensive relative to using one, and the
// dashboard formats thousands of cells per render. Cache by locale + options.

const numberFormatters = new Map<string, Intl.NumberFormat>()
const dateFormatters = new Map<string, Intl.DateTimeFormat>()

function numberFormat(lang: UiLang, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const locale = LOCALE[lang]
  const key = `${locale}|${JSON.stringify(options)}`

  let formatter = numberFormatters.get(key)
  if (formatter === undefined) {
    formatter = new Intl.NumberFormat(locale, options)
    numberFormatters.set(key, formatter)
  }
  return formatter
}

function dateFormat(lang: UiLang, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const locale = LOCALE[lang]
  const withZone: Intl.DateTimeFormatOptions = { ...options, timeZone: TIME_ZONE }
  const key = `${locale}|${JSON.stringify(withZone)}`

  let formatter = dateFormatters.get(key)
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat(locale, withZone)
    dateFormatters.set(key, formatter)
  }
  return formatter
}

/**
 * The instant a date formatter should be handed for a given Riyadh day.
 *
 * Noon rather than midnight: the calendar date is the only thing being read
 * off, and noon is the furthest point from a day boundary, so any disagreement
 * about the offset still lands on the same day.
 */
function middayOf(dayIndex: number): Date {
  return new Date((riyadhMidnightEpochSec(dayIndex) + 12 * SEC_PER_HOUR) * 1000)
}

// --- numbers ---------------------------------------------------------------

/** A whole number with grouping: `15,631`. */
export function formatInt(lang: UiLang, value: number): string {
  return numberFormat(lang, { maximumFractionDigits: 0 }).format(value)
}

/** Shortened for tight spaces: `15.6K` / `15.6 ألف`. */
export function formatCompact(lang: UiLang, value: number): string {
  return numberFormat(lang, { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

/**
 * A ratio as a percentage: `formatPercent('en', 0.7152)` → `71.5%`.
 * Takes the ratio, not the already-multiplied number — the engine deals in
 * counts and ratios, and multiplying by 100 in two places invites drift.
 */
export function formatPercent(lang: UiLang, ratio: number, digits = 1): string {
  return numberFormat(lang, {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(ratio)
}

/**
 * A period-over-period change in **percentage points**: `+0.4 pts` /
 * `+0.4 نقطة`. The sign is always shown, including for zero, because "no
 * change" and "we did not measure" must not look alike.
 *
 * Takes the difference of two ratios (0.715 - 0.711), not a percentage.
 * Returned already wrapped in FSI…PDI — see the module note on bidi.
 */
export function formatPointsDelta(lang: UiLang, deltaRatio: number): string {
  const points = numberFormat(lang, {
    signDisplay: 'always',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(deltaRatio * 100)

  const unit = lang === 'ar' ? 'نقطة' : 'pts'
  return isolate(`${points}${NBSP}${unit}`)
}

/** One value with a localized unit, e.g. `3 mins` / `3 د`. */
function formatUnit(lang: UiLang, value: number, unit: 'second' | 'minute' | 'hour'): string {
  return numberFormat(lang, { style: 'unit', unit, unitDisplay: 'short' }).format(value)
}

/**
 * A call duration, in the largest units that stay honest: seconds under a
 * minute, minutes under an hour, hours and minutes above that.
 */
export function formatDurationSec(lang: UiLang, seconds: number): string {
  const total = Math.max(0, Math.round(seconds))

  if (total < SEC_PER_MINUTE) return formatUnit(lang, total, 'second')

  if (total < SEC_PER_HOUR) {
    const minutes = Math.floor(total / SEC_PER_MINUTE)
    const rest = total % SEC_PER_MINUTE
    if (rest === 0) return formatUnit(lang, minutes, 'minute')
    return `${formatUnit(lang, minutes, 'minute')} ${formatUnit(lang, rest, 'second')}`
  }

  const hours = Math.floor(total / SEC_PER_HOUR)
  const minutes = Math.round((total % SEC_PER_HOUR) / SEC_PER_MINUTE)
  if (minutes === 0) return formatUnit(lang, hours, 'hour')
  return `${formatUnit(lang, hours, 'hour')} ${formatUnit(lang, minutes, 'minute')}`
}

// --- dates and times -------------------------------------------------------

/** A Riyadh day as day and short month: `20 Sept` / `20 سبتمبر`. */
export function formatDay(lang: UiLang, dayIndex: number): string {
  return dateFormat(lang, { day: 'numeric', month: 'short' }).format(middayOf(dayIndex))
}

/** A Riyadh day including the year, for labels that outlive their context. */
export function formatDayLong(lang: UiLang, dayIndex: number): string {
  return dateFormat(lang, { day: 'numeric', month: 'long', year: 'numeric' }).format(
    middayOf(dayIndex),
  )
}

/**
 * An inclusive day span: `20 Sept – 26 Sept`.
 * Returned already wrapped in FSI…PDI so the endpoints cannot swap visually
 * inside Arabic prose — see the module note on bidi.
 */
export function formatDayRange(lang: UiLang, from: number, to: number): string {
  if (from === to) return isolate(formatDay(lang, from))
  return isolate(`${formatDay(lang, from)} – ${formatDay(lang, to)}`)
}

/**
 * A weekday name from a weekday number, `0` = Sunday … `6` = Saturday,
 * matching `weekday()` in riyadh.ts.
 */
export function formatWeekdayShort(lang: UiLang, weekday: number): string {
  // 2026-09-27 is a Sunday, so this reference day + weekday lands on the right
  // one without any date parsing at the call site.
  const SUNDAY_REFERENCE = 20723
  return dateFormat(lang, { weekday: 'short' }).format(
    middayOf(SUNDAY_REFERENCE + (((weekday % 7) + 7) % 7)),
  )
}

/**
 * An hour of the Riyadh day as 24-hour clock: `21:00`.
 * 24-hour in both languages — the heatmap axis has to line up column by
 * column, and an am/pm suffix would make the Arabic column twice as wide.
 */
export function formatHour(lang: UiLang, hour: number): string {
  const epochSec = riyadhMidnightEpochSec(0) + hour * SEC_PER_HOUR
  return dateFormat(lang, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
    new Date(epochSec * 1000),
  )
}

/** A precise instant, for row-level detail: `20 Sept, 21:43`. */
export function formatInstant(lang: UiLang, epochSec: number): string {
  return dateFormat(lang, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(epochSec * 1000))
}
