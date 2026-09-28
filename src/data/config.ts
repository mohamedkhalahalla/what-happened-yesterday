/**
 * Tunable constants for the synthetic dataset.
 *
 * Everything here is data, not logic: the generator reads these and nothing
 * else decides the shape of the quarter.
 */

/** Seed for the default dataset. Change it and every number below moves. */
export const SEED = 20260927

/** Exact number of calls generated. Hit precisely, via largest-remainder allocation. */
export const TOTAL_CALLS = 200_000

/**
 * The day the app pretends is "today" (a Sunday). Data covers the {@link DAYS}
 * Riyadh days *ending the day before*, i.e. 2026-06-29 … 2026-09-26, so
 * "yesterday" is always the last complete day in the dataset.
 */
export const ANCHOR_TODAY_ISO = '2026-09-27'

/** Length of the data window in Riyadh days. */
export const DAYS = 90

/** Ramadan 1447 AH, inclusive. Falls fully inside the 90-day window. */
export const RAMADAN = { fromISO: '2026-07-24', toISO: '2026-08-22' } as const

/** Relative daily volume by Saudi weekday: Sunday–Thursday work, Friday is quietest. */
export const WEEKDAY_VOLUME = {
  workday: 1.0,
  friday: 0.45,
  saturday: 0.65,
} as const

/** Ramadan lifts total daily volume by 10%. */
export const RAMADAN_VOLUME_MULTIPLIER = 1.1

/** Volume grows linearly by this much from the first day to the last. */
export const QUARTER_GROWTH = 0.08

/** Resolve rate improves linearly by this much from the first day to the last. */
export const QUARTER_RESOLVE_TREND = 0.04

/**
 * Call volume by Riyadh hour on an ordinary day.
 * Morning peak 10–13, evening peak 16–21, dead between 02 and 07.
 */
export const NORMAL_HOURLY: readonly number[] = [
  // 00  01  02  03  04  05  06  07
  18, 10, 5, 3, 2, 2, 3, 6,
  // 08  09  10  11  12  13  14  15
  18, 40, 72, 80, 78, 70, 52, 46,
  // 16  17  18  19  20  21  22  23
  62, 70, 74, 76, 72, 64, 46, 30,
]

/**
 * Call volume by Riyadh hour during Ramadan — a different day entirely.
 * Quiet while fasting (05–13), moderate late afternoon (14–17), a sharp dip at
 * iftar (18), then the real day: a strong peak 21–01 and a suhoor tail 02–03.
 */
export const RAMADAN_HOURLY: readonly number[] = [
  // 00  01  02  03  04  05  06  07
  88, 78, 42, 36, 14, 8, 6, 6,
  // 08  09  10  11  12  13  14  15
  8, 12, 16, 20, 22, 26, 44, 50,
  // 16  17  18  19  20  21  22  23
  54, 52, 12, 34, 60, 92, 100, 96,
]

/** Share of calls in each language. Order matches LANGUAGES. */
export const LANGUAGE_MIX: readonly number[] = [0.6, 0.13, 0.27] // ar, en, mixed

/** Resolve-rate nudge per language. Order matches LANGUAGES. */
export const LANGUAGE_RESOLVE_ADJUST: readonly number[] = [0, 0.01, -0.03] // ar, en, mixed

/** Of the calls the agent could not resolve, this share is transferred; the rest abandon. */
export const TRANSFER_SHARE_OF_UNRESOLVED = 0.7

/** Baseline handoff reason mix. Order matches HANDOFF_REASONS. */
export const HANDOFF_MIX: readonly number[] = [0.4, 0.3, 0.2, 0.1]

/** Share of ordinary calls that hit at least one tool error. */
export const BASE_TOOL_ERROR_RATE = 0.06

/** Given at least one tool error, the chance of a 2nd and then a 3rd. */
export const EXTRA_TOOL_ERROR_RATE = 0.18

/** A call that hit a tool error is this much less likely to resolve. */
export const TOOL_ERROR_RESOLVE_PENALTY = 0.6

/** If a call with tool errors is transferred, this often the reason is tool_error. */
export const TOOL_ERROR_HANDOFF_SHARE = 0.7

/** Lognormal call duration by outcome (seconds). Order matches OUTCOMES. */
export const DURATION_MEDIAN_SEC: readonly number[] = [180, 240, 60]
export const DURATION_SIGMA: readonly number[] = [0.62, 0.66, 0.85]
export const DURATION_MIN_SEC = 10
export const DURATION_MAX_SEC = 3600

/** Sentiment at the start of a call: mildly negative, wide spread. */
export const SENTIMENT_START_MEAN = -0.1
export const SENTIMENT_START_SD = 0.35

/** How sentiment moves by the end of the call. Order matches OUTCOMES. */
export const SENTIMENT_DELTA: readonly number[] = [0.35, -0.05, -0.3]
export const SENTIMENT_NOISE_SD = 0.15

/**
 * STORY is ground truth for tests and documentation ONLY; dashboard code must
 * never import it. The whole point of the exercise is that the director finds
 * these three things in the data, so nothing in the UI is allowed to know
 * where they are.
 */
export const STORY = {
  /**
   * 1. A bad deploy. For one working day, every backend-touching intent starts
   *    throwing errors during office hours. Normal rules do the rest: those
   *    calls resolve less and get transferred with `tool_error`.
   */
  badDeploy: {
    dateISO: '2026-08-25',
    /** Riyadh hours 09:00–17:59, inclusive of both ends. */
    fromHour: 9,
    toHour: 17,
    toolErrorProbability: 0.7,
    minErrors: 1,
    maxErrors: 3,
    titleEn: 'Backend deploy broke tool calls for one working day',
    titleAr: 'تحديث برمجي أعطل الأنظمة الخلفية ليوم عمل كامل',
  },

  /**
   * 2. A slow rot. Roaming quietly degrades all quarter — no single week looks
   *    alarming, which is exactly why it is only visible over 90 days.
   */
  degradingIntent: {
    intentId: 'roaming',
    startResolve: 0.82,
    endResolve: 0.45,
    /** The failures caused by the decline transfer with low_confidence this often. */
    extraFailureTransferShare: 0.75,
    extraFailureReason: 'low_confidence',
    titleEn: 'Roaming resolve rate decayed steadily across the quarter',
    titleAr: 'تراجع تدريجي في معالجة طلبات التجوال خلال الربع',
  },

  /**
   * 3. One agent hands off far too readily. Majed sees the same intent mix as
   *    everyone else, so intent difficulty cannot explain his transfer rate.
   */
  overTransferringAgent: {
    agentId: 'agent_06',
    /** Chance a call Majed would have resolved is transferred instead. */
    overrideProbability: 0.4,
    reason: 'low_confidence',
    titleEn: 'Majed transfers calls he could have resolved',
    titleAr: 'ماجد يحوّل مكالمات كان بإمكانه إنهاءها',
  },
} as const
