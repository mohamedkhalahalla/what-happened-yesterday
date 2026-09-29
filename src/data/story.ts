/**
 * Where the three anomalies are hidden, as a function of the seed.
 *
 * ## Why this exists
 *
 * A detector that finds one planted agent in one planted week has proved
 * nothing except that it was written after the data. The only way to tell a
 * rule from a coincidence is to move what it is looking for and check it still
 * finds it — so the seed now decides *which* agent over-transfers, *which*
 * intent rots, and *which* day the deploy broke, and the detectors are run
 * against a dozen of those in `src/insights/multiSeed.test.ts`.
 *
 * ## The default seed is special, on purpose
 *
 * `storyFor(SEED)` returns today's {@link STORY} verbatim rather than deriving
 * anything. The default dataset is the one the README quotes, the one every
 * other test pins numbers against, and the one anybody opening the app sees.
 * It has to stay byte-identical, which a derived plan could only manage by
 * coincidence — roaming's own rule would end it at 0.47, not the 0.45 it has
 * always had.
 *
 * ## A separate random stream
 *
 * The plan is drawn from `mulberry32(seed ^ PLAN_SEED_MIX)`, never from the
 * generator's own stream. Drawing three numbers from the main stream would
 * shift every call in the dataset by three draws, so the "same seed, same
 * data" guarantee would hold only for as long as nobody changed how many
 * decisions the plan needs. Mixing the seed rather than reusing it means the
 * two streams do not run in lockstep either.
 *
 * Only the *placement* lives here. The mechanics — how often a broken backend
 * throws, how often a decline's failures transfer rather than abandon — are
 * the same for every seed and stay in `config.ts`.
 */

import { ANCHOR_TODAY_ISO, DAYS, SEED, STORY } from './config'
import { AGENTS, INTENTS, agentIndex, intentIndex } from './dictionaries'
import { isoToDayIndex, weekday } from '../lib/time/riyadh'
import { mulberry32, uniformInt } from './prng'

/** Where one seed's three anomalies live. Codes, not ids: the generator's units. */
export type StoryPlan = {
  /** Code into AGENTS: the agent who hands off calls he could have finished. */
  agent: number
  /** Code into INTENTS: the intent that decays across the quarter. */
  intent: number
  /** Absolute Riyadh day index of the bad deploy. */
  deployDay: number
  /** Inclusive Riyadh hour window the deploy is broken for. */
  deployHours: { from: number; to: number }
  /** The declining intent's resolve rate on the first day of the window. */
  intentStartResolve: number
  /** And on the last. */
  intentEndResolve: number
}

/**
 * Mixed into the seed so the plan stream is not the data stream.
 *
 * The golden-ratio constant from Knuth's multiplicative hashing, which is the
 * usual choice for this and has no significance beyond spreading nearby seeds
 * apart — seeds 1 and 2 should not produce neighbouring plans.
 */
const PLAN_SEED_MIX = 0x9e3779b9

/**
 * How far the declining intent falls over the quarter, in ratio units.
 *
 * Matched to the planted story's 37 points, rounded. Much smaller and the
 * decline stops being visible over ninety days for a low-volume intent; much
 * larger and every seed produces a collapse nobody could miss, which would
 * make the recall test easy for the wrong reason.
 */
const DECLINE_DROP = 0.35

/**
 * The lowest an intent is allowed to decline to.
 *
 * Below about a third, the intent stops resembling a telecom queue and starts
 * resembling a broken product — and the failure modes downstream (every call
 * transferring, sentiment bottoming out) would be a different story from the
 * slow rot this is meant to plant.
 */
const DECLINE_FLOOR = 0.3

/**
 * How many of the rarest intents are excluded from the draw.
 *
 * The five lowest by weight carry a few hundred calls a quarter between them.
 * A decline in one of those is real and genuinely hard to see — the weekly
 * buckets fall below the minimum and the trend is drawn as gaps — so planting
 * one would be testing the detector against a case where "invisible" is the
 * correct answer.
 */
const EXCLUDED_RAREST_INTENTS = 5

/**
 * The window the deploy day is drawn from, as offsets into the data.
 *
 * It runs to the last day now. It used to stop short of both ends because the
 * detector compared each day against a symmetric window of neighbouring weeks
 * and could not judge the days where symmetry was impossible — so the plan
 * politely avoided planting anything the detector was blind to, and the tests
 * never noticed the blind spot. The drift is fitted and removed now, every day
 * is judged, and the plan is free to use the last week: the one the dashboard
 * opens on.
 *
 * The first fortnight stays out, but no longer because the detector cannot
 * cope: it can. It keeps a couple of ordinary weeks in front of every planted
 * deploy, so the trend chart has context on both sides of the marker and
 * "nothing like it since" counts from somewhere.
 */
const DEPLOY_FIRST_OFFSET = 14
const DEPLOY_LAST_OFFSET = DAYS - 1

/** Sunday to Thursday: the Saudi working week. */
function isWorkdayIndex(dayIndex: number): boolean {
  return weekday(dayIndex) <= 4
}

/** The first day of the data window. Derived, so this module needs no dataset. */
function firstDayOf(): number {
  return isoToDayIndex(ANCHOR_TODAY_ISO) - DAYS
}

/**
 * Intent codes eligible to be the declining one, rarest excluded.
 *
 * Sorted by weight and then by code, so the tie at weight 25 resolves the same
 * way on every machine and the candidate list is a fact about the dictionary
 * rather than about the sort implementation.
 */
function decliningCandidates(): number[] {
  return INTENTS.map((intent, code) => ({ code, weight: intent.weight }))
    .sort((a, b) => a.weight - b.weight || a.code - b.code)
    .slice(EXCLUDED_RAREST_INTENTS)
    .map((entry) => entry.code)
}

/** Workdays in the deploy window, as absolute day indices. */
function deployCandidates(): number[] {
  const firstDay = firstDayOf()
  const days: number[] = []

  for (let offset = DEPLOY_FIRST_OFFSET; offset <= DEPLOY_LAST_OFFSET; offset++) {
    const dayIndex = firstDay + offset
    // A deploy on a Friday would be a quiet day with a spike on it, which is a
    // different and much easier thing to spot than a broken working Tuesday.
    if (isWorkdayIndex(dayIndex)) days.push(dayIndex)
  }
  return days
}

/** The plan as it has always been: Majed, roaming, and the 25th of August. */
function defaultPlan(): StoryPlan {
  return {
    agent: agentIndex(STORY.overTransferringAgent.agentId),
    intent: intentIndex(STORY.degradingIntent.intentId),
    deployDay: isoToDayIndex(STORY.badDeploy.dateISO),
    deployHours: { from: STORY.badDeploy.fromHour, to: STORY.badDeploy.toHour },
    intentStartResolve: STORY.degradingIntent.startResolve,
    intentEndResolve: STORY.degradingIntent.endResolve,
  }
}

/**
 * Where this seed hides its three anomalies.
 *
 * Pure and total: any 32-bit seed produces a plan, and the same seed always
 * produces the same one.
 */
export function storyFor(seed: number): StoryPlan {
  // The one the README, the screenshots and every pinned number describe.
  if (seed >>> 0 === SEED >>> 0) return defaultPlan()

  const rng = mulberry32((seed ^ PLAN_SEED_MIX) >>> 0)

  const agent = uniformInt(rng, 0, AGENTS.length - 1)

  const candidates = decliningCandidates()
  const intent = candidates[uniformInt(rng, 0, candidates.length - 1)]!

  const days = deployCandidates()
  const deployDay = days[uniformInt(rng, 0, days.length - 1)]!

  // The intent declines from wherever it normally sits, so the story is "this
  // got worse" rather than "this intent was replaced with a broken one".
  const intentStartResolve = INTENTS[intent]!.baseResolve
  const intentEndResolve = Math.max(DECLINE_FLOOR, intentStartResolve - DECLINE_DROP)

  return {
    agent,
    intent,
    deployDay,
    deployHours: { from: STORY.badDeploy.fromHour, to: STORY.badDeploy.toHour },
    intentStartResolve,
    intentEndResolve,
  }
}
