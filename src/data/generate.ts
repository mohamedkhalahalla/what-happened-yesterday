/**
 * Builds the whole synthetic quarter in memory, columnar and deterministic.
 *
 * Shape of the run: allocate an exact integer call count per day, draw and
 * sort that day's timestamps, then walk the sorted timestamps filling one row
 * at a time. Rows therefore come out sorted by `startedAt` globally, which is
 * what makes `dayStartRow` a usable slicing index.
 *
 * This is the only non-test module allowed to import {@link STORY}: the three
 * anomalies are *planted* here, and every other part of the app has to
 * discover them from the data the way the director would.
 *
 * Note on the `!` assertions below: indices into `INTENTS` / the mix arrays
 * always come from `pickWeighted` over those same arrays, so they are in range
 * by construction. The assertions only silence `noUncheckedIndexedAccess`.
 */

import {
  isoToDayIndex,
  riyadhDayIndex,
  riyadhHour,
  riyadhMidnightEpochSec,
  weekday,
} from '../lib/time/riyadh'
import {
  ANCHOR_TODAY_ISO,
  BASE_TOOL_ERROR_RATE,
  DAYS,
  DURATION_MAX_SEC,
  DURATION_MEDIAN_SEC,
  DURATION_MIN_SEC,
  DURATION_SIGMA,
  EXTRA_TOOL_ERROR_RATE,
  HANDOFF_MIX,
  LANGUAGE_MIX,
  LANGUAGE_RESOLVE_ADJUST,
  NORMAL_HOURLY,
  QUARTER_GROWTH,
  QUARTER_RESOLVE_TREND,
  RAMADAN,
  RAMADAN_HOURLY,
  RAMADAN_VOLUME_MULTIPLIER,
  SEED,
  SENTIMENT_DELTA,
  SENTIMENT_NOISE_SD,
  SENTIMENT_START_MEAN,
  SENTIMENT_START_SD,
  STORY,
  TOOL_ERROR_HANDOFF_SHARE,
  TOOL_ERROR_RESOLVE_PENALTY,
  TOTAL_CALLS,
  TRANSFER_SHARE_OF_UNRESOLVED,
  WEEKDAY_VOLUME,
} from './config'
import { AGENTS, HANDOFF_REASONS, INTENTS, agentIndex, intentIndex } from './dictionaries'
import { clamp, lerp, lognormal, mulberry32, normal, pickWeighted, sum, type Rng } from './prng'
import { NO_HANDOFF, type Dataset } from './types'

const SEC_PER_HOUR = 3600

// Outcome codes, matching the OUTCOMES array order.
const RESOLVED = 0
const TRANSFERRED = 1
const ABANDONED = 2

// Handoff codes, matching the HANDOFF_REASONS array order.
const LOW_CONFIDENCE = HANDOFF_REASONS.indexOf('low_confidence')
const TOOL_ERROR = HANDOFF_REASONS.indexOf('tool_error')

const ROAMING = intentIndex(STORY.degradingIntent.intentId)
const MAJED = agentIndex(STORY.overTransferringAgent.agentId)

// Totals precomputed once rather than re-summed 200k times.
const INTENT_WEIGHTS = INTENTS.map((it) => it.weight)
const INTENT_WEIGHT_TOTAL = sum(INTENT_WEIGHTS)
const LANGUAGE_MIX_TOTAL = sum(LANGUAGE_MIX)
const HANDOFF_MIX_TOTAL = sum(HANDOFF_MIX)
const NORMAL_HOURLY_TOTAL = sum(NORMAL_HOURLY)
const RAMADAN_HOURLY_TOTAL = sum(RAMADAN_HOURLY)

/** Everything about a day that is the same for all of its calls. */
type DayContext = {
  /** 0-based position in the window, used for "progress across the quarter". */
  offset: number
  /** Absolute Riyadh day index. */
  dayIndex: number
  /** Resolve-rate bonus from the gentle quarter-long improvement. */
  resolveTrend: number
  /** Where roaming's decaying resolve rate has got to on this day. */
  roamingResolve: number
  /** True on the day the bad deploy shipped. */
  isDeployDay: boolean
  hourly: readonly number[]
  hourlyTotal: number
}

/**
 * Relative call volume for each day of the window: weekday rhythm, a Ramadan
 * lift, and a gentle upward drift across the quarter.
 */
function dailyVolumeWeights(firstDay: number, ramadanFrom: number, ramadanTo: number): number[] {
  const weights: number[] = []

  for (let offset = 0; offset < DAYS; offset++) {
    const dayIndex = firstDay + offset
    const dow = weekday(dayIndex)
    let w =
      dow === 5
        ? WEEKDAY_VOLUME.friday
        : dow === 6
          ? WEEKDAY_VOLUME.saturday
          : WEEKDAY_VOLUME.workday

    if (dayIndex >= ramadanFrom && dayIndex <= ramadanTo) w *= RAMADAN_VOLUME_MULTIPLIER
    w *= 1 + QUARTER_GROWTH * (offset / (DAYS - 1))
    weights.push(w)
  }
  return weights
}

/**
 * Split `total` across `weights` as whole numbers summing to exactly `total`.
 * Largest-remainder: floor everything, then hand the leftover units to the
 * days with the biggest discarded fraction (ties broken by day index, so the
 * result is deterministic).
 */
function allocateLargestRemainder(weights: readonly number[], total: number): number[] {
  const weightTotal = sum(weights)
  const exact = weights.map((w) => (w / weightTotal) * total)
  const counts = exact.map((x) => Math.floor(x))
  let assigned = sum(counts)

  const byRemainder = exact
    .map((x, i) => ({ i, remainder: x - Math.floor(x) }))
    .sort((a, b) => b.remainder - a.remainder || a.i - b.i)

  for (const { i } of byRemainder) {
    if (assigned >= total) break
    counts[i] = counts[i]! + 1
    assigned++
  }
  return counts
}

/**
 * `count` timestamps inside one Riyadh day, spread over that day's hour curve
 * and sorted ascending. Sorting here is what keeps the whole dataset ordered.
 */
function drawDayTimestamps(rng: Rng, ctx: DayContext, count: number): Uint32Array {
  const midnight = riyadhMidnightEpochSec(ctx.dayIndex)
  const times = new Uint32Array(count)

  for (let i = 0; i < count; i++) {
    const hour = pickWeighted(rng, ctx.hourly, ctx.hourlyTotal)
    times[i] = midnight + hour * SEC_PER_HOUR + Math.floor(rng() * SEC_PER_HOUR)
  }
  times.sort()
  return times
}

/**
 * How many backend calls failed. Ordinarily rare; inside the bad deploy's
 * office-hours window every tool-backed intent is very likely to hit one.
 */
function drawToolErrors(rng: Rng, intentCode: number, inDeployWindow: boolean): number {
  const toolBacked = INTENTS[intentCode]!.toolBacked
  const rate =
    inDeployWindow && toolBacked ? STORY.badDeploy.toolErrorProbability : BASE_TOOL_ERROR_RATE

  if (rng() >= rate) return 0

  let errors = STORY.badDeploy.minErrors
  while (errors < STORY.badDeploy.maxErrors && rng() < EXTRA_TOOL_ERROR_RATE) errors++
  return errors
}

/**
 * Chance this call resolves, paired with the chance it *would* have resolved
 * if roaming had never started degrading.
 *
 * The pair is what lets the caller tell which failures the decline caused:
 * against a single uniform draw `u`, a failure is "caused by the decline"
 * exactly when `p <= u < pWithoutDecline`. For every other intent the two are
 * equal, so that branch never fires.
 */
function resolveOdds(
  intentCode: number,
  languageCode: number,
  toolErrors: number,
  ctx: DayContext,
): { p: number; pWithoutDecline: number } {
  const isRoaming = intentCode === ROAMING
  // Roaming follows its own ramp and deliberately ignores the rising trend.
  const base = isRoaming ? ctx.roamingResolve : INTENTS[intentCode]!.baseResolve + ctx.resolveTrend
  const languageAdjust = LANGUAGE_RESOLVE_ADJUST[languageCode]!
  const toolPenalty = toolErrors > 0 ? TOOL_ERROR_RESOLVE_PENALTY : 1

  const p = clamp((base + languageAdjust) * toolPenalty, 0, 1)
  if (!isRoaming) return { p, pWithoutDecline: p }

  const undegraded = clamp(
    (STORY.degradingIntent.startResolve + languageAdjust) * toolPenalty,
    0,
    1,
  )
  return { p, pWithoutDecline: undegraded }
}

/** Why a transferred call was handed over. Tool failures dominate when present. */
function pickHandoffReason(rng: Rng, toolErrors: number): number {
  if (toolErrors > 0 && rng() < TOOL_ERROR_HANDOFF_SHARE) return TOOL_ERROR
  return pickWeighted(rng, HANDOFF_MIX, HANDOFF_MIX_TOTAL)
}

/** Call length in whole seconds: lognormal around the median for its outcome. */
function drawDuration(rng: Rng, outcome: number): number {
  const raw = lognormal(rng, DURATION_MEDIAN_SEC[outcome]!, DURATION_SIGMA[outcome]!)
  return Math.round(clamp(raw, DURATION_MIN_SEC, DURATION_MAX_SEC))
}

/** Sentiment stored as hundredths, so -1..1 becomes -100..100 in an Int8Array. */
function toSentimentCode(value: number): number {
  return Math.round(clamp(value, -1, 1) * 100)
}

function allocateDataset(n: number, firstDay: number): Dataset {
  return {
    n,
    startedAt: new Uint32Array(n),
    dayIdx: new Uint16Array(n),
    hour: new Uint8Array(n),
    durationSec: new Uint16Array(n),
    language: new Uint8Array(n),
    agent: new Uint8Array(n),
    intent: new Uint8Array(n),
    outcome: new Uint8Array(n),
    handoff: new Uint8Array(n),
    sentStart: new Int8Array(n),
    sentEnd: new Int8Array(n),
    toolErrors: new Uint8Array(n),
    dayStartRow: new Uint32Array(DAYS + 1),
    firstDay,
    days: DAYS,
  }
}

function buildDayContext(
  offset: number,
  firstDay: number,
  deployDay: number,
  ramadanFrom: number,
  ramadanTo: number,
): DayContext {
  const dayIndex = firstDay + offset
  const progress = offset / (DAYS - 1)
  const inRamadan = dayIndex >= ramadanFrom && dayIndex <= ramadanTo

  return {
    offset,
    dayIndex,
    resolveTrend: QUARTER_RESOLVE_TREND * progress,
    roamingResolve: lerp(
      STORY.degradingIntent.startResolve,
      STORY.degradingIntent.endResolve,
      progress,
    ),
    isDeployDay: dayIndex === deployDay,
    hourly: inRamadan ? RAMADAN_HOURLY : NORMAL_HOURLY,
    hourlyTotal: inRamadan ? RAMADAN_HOURLY_TOTAL : NORMAL_HOURLY_TOTAL,
  }
}

/**
 * Decide the outcome of a call, and the handoff reason if it was transferred.
 *
 * All three anomalies meet here, which is why they stay comprehensible: each
 * one is a single branch, and the ordinary 70/30 split is the fallback.
 */
function decideOutcome(
  rng: Rng,
  agentCode: number,
  intentCode: number,
  toolErrors: number,
  odds: { p: number; pWithoutDecline: number },
): { outcome: number; handoff: number } {
  const u = rng()

  if (u < odds.p) {
    // Majed hands off calls the other agents would have finished themselves.
    if (agentCode === MAJED && rng() < STORY.overTransferringAgent.overrideProbability) {
      return { outcome: TRANSFERRED, handoff: LOW_CONFIDENCE }
    }
    return { outcome: RESOLVED, handoff: NO_HANDOFF }
  }

  if (intentCode === ROAMING && u < odds.pWithoutDecline) {
    // A failure the roaming decline is directly responsible for.
    return rng() < STORY.degradingIntent.extraFailureTransferShare
      ? { outcome: TRANSFERRED, handoff: LOW_CONFIDENCE }
      : { outcome: ABANDONED, handoff: NO_HANDOFF }
  }

  if (rng() < TRANSFER_SHARE_OF_UNRESOLVED) {
    return { outcome: TRANSFERRED, handoff: pickHandoffReason(rng, toolErrors) }
  }
  return { outcome: ABANDONED, handoff: NO_HANDOFF }
}

/**
 * Fill one row. The order of `rng()` draws here is part of the dataset's
 * identity — reordering them changes every downstream value for a given seed.
 */
function fillRow(ds: Dataset, row: number, epochSec: number, ctx: DayContext, rng: Rng): void {
  const hour = riyadhHour(epochSec)
  const languageCode = pickWeighted(rng, LANGUAGE_MIX, LANGUAGE_MIX_TOTAL)
  const agentCode = Math.floor(rng() * AGENTS.length)
  const intentCode = pickWeighted(rng, INTENT_WEIGHTS, INTENT_WEIGHT_TOTAL)

  const inDeployWindow =
    ctx.isDeployDay && hour >= STORY.badDeploy.fromHour && hour <= STORY.badDeploy.toHour
  const toolErrors = drawToolErrors(rng, intentCode, inDeployWindow)

  const odds = resolveOdds(intentCode, languageCode, toolErrors, ctx)
  const { outcome, handoff } = decideOutcome(rng, agentCode, intentCode, toolErrors, odds)

  const sentimentStart = clamp(normal(rng, SENTIMENT_START_MEAN, SENTIMENT_START_SD), -1, 1)
  const sentimentEnd =
    sentimentStart + SENTIMENT_DELTA[outcome]! + normal(rng, 0, SENTIMENT_NOISE_SD)

  ds.startedAt[row] = epochSec
  ds.dayIdx[row] = riyadhDayIndex(epochSec)
  ds.hour[row] = hour
  ds.durationSec[row] = drawDuration(rng, outcome)
  ds.language[row] = languageCode
  ds.agent[row] = agentCode
  ds.intent[row] = intentCode
  ds.outcome[row] = outcome
  ds.handoff[row] = handoff
  ds.sentStart[row] = toSentimentCode(sentimentStart)
  ds.sentEnd[row] = toSentimentCode(sentimentEnd)
  ds.toolErrors[row] = toolErrors
}

/**
 * Generate the full 90-day, {@link TOTAL_CALLS}-row dataset.
 * Same seed in, identical columns out.
 */
export function generateDataset(seed: number = SEED): Dataset {
  const rng = mulberry32(seed)
  // Data ends the day before "today", so the window starts DAYS days before it.
  const firstDay = isoToDayIndex(ANCHOR_TODAY_ISO) - DAYS
  const deployDay = isoToDayIndex(STORY.badDeploy.dateISO)
  const ramadanFrom = isoToDayIndex(RAMADAN.fromISO)
  const ramadanTo = isoToDayIndex(RAMADAN.toISO)

  const weights = dailyVolumeWeights(firstDay, ramadanFrom, ramadanTo)
  const callsPerDay = allocateLargestRemainder(weights, TOTAL_CALLS)
  const ds = allocateDataset(TOTAL_CALLS, firstDay)

  let row = 0
  for (let offset = 0; offset < DAYS; offset++) {
    ds.dayStartRow[offset] = row
    const ctx = buildDayContext(offset, firstDay, deployDay, ramadanFrom, ramadanTo)

    for (const epochSec of drawDayTimestamps(rng, ctx, callsPerDay[offset]!)) {
      fillRow(ds, row, epochSec, ctx, rng)
      row++
    }
  }
  ds.dayStartRow[DAYS] = row

  return ds
}
