/**
 * How often does the dashboard cry wolf?
 *
 * "Zero false positives on twelve seeds" is a claim that gets weaker the more
 * you think about it. Twelve is a small sample for a rate, and zero is the
 * answer a detector gives right up until the day it does not — so the number
 * it produces is either luck or silence, and neither is a budget anybody can
 * plan around.
 *
 * So this measures a **rate** instead: fifty quarters with nothing wrong in
 * them, the whole ninety days in view, and a count of everything the detectors
 * said anyway. The budget is one false incident per ten clean quarters. That
 * is a judgement about attention, not statistics: a director who opens this
 * dashboard every Monday morning should meet a phantom incident roughly twice
 * a year, which is rare enough to still be worth reading and common enough to
 * be honest about.
 *
 * ## Why it is not in `npm test`
 *
 * Fifty datasets is fifty passes of the generator, and a suite people run
 * between edits has to stay quick or it stops being run. `npm run
 * test:detectors` executes it; the default run skips it in microseconds.
 *
 * The recall half stays in `multiSeed.test.ts`, where it belongs: missing a
 * planted anomaly is a failure, not a rate to be budgeted.
 */

import { describe, expect, it } from 'vitest'

import { generateDataset } from '../data/generate'
import { aggregate } from '../engine/aggregate'
import { boundsOf } from '../state/presets'
import { dayIndexToISO } from '../lib/time/riyadh'
import { detectInsights, type Insight } from './detect'

/** Only under `npm run test:detectors`, which passes `--mode sweep`. */
const SWEEP = import.meta.env.MODE === 'sweep'

/** How many clean quarters to look at. */
const QUARTERS = 50

/**
 * The budget: at most one false incident per ten clean quarters.
 *
 * Expressed as a rate rather than a count so the assertion keeps its meaning
 * if the sweep is ever made larger.
 */
const MAX_FALSE_INCIDENTS_PER_QUARTER = 0.1

/**
 * Seeds 1…50, not random ones.
 *
 * A sweep that draws its own seeds measures a different thing every run, so a
 * regression would look like noise and noise would look like a regression.
 */
const SEEDS = Array.from({ length: QUARTERS }, (_, index) => index + 1)

type Alarm = {
  seed: number
  kind: Insight['kind']
  what: string
}

function describeAlarm(insight: Insight): string {
  if (insight.kind === 'agent') {
    return `agent ${insight.params.agent} at ${(insight.evidence.rate * 100).toFixed(1)}% vs ${(
      insight.evidence.median * 100
    ).toFixed(1)}% median`
  }
  if (insight.kind === 'intent') {
    return `intent ${insight.params.intent} ${(insight.evidence.earlyRate * 100).toFixed(1)}% -> ${(
      insight.evidence.recentRate * 100
    ).toFixed(1)}%`
  }

  const drop = insight.params.resolutionDrop ?? 0
  return `${dayIndexToISO(insight.day)} ${
    insight.params.toolErrorRatio === null
      ? `resolution -${(drop * 100).toFixed(1)} pts`
      : `tool errors ${insight.params.toolErrorRatio.toFixed(1)}x`
  }`
}

describe.skipIf(!SWEEP)(`false-alarm budget over ${QUARTERS} clean quarters`, () => {
  /** Fifty passes of the generator; the default five-second budget is for units. */
  const TIMEOUT_MS = 120_000

  it(
    `reports at most ${MAX_FALSE_INCIDENTS_PER_QUARTER} false incidents per quarter`,
    () => {
      const alarms: Alarm[] = []
      const startedAt = performance.now()

      for (const seed of SEEDS) {
        // No planted stories at all: everything found here is a false alarm.
        const ds = generateDataset(seed, { anomalies: false })
        const bounds = boundsOf(ds)
        // The whole quarter, which is the widest window and the hardest test:
        // ninety days of calls resolve a tenth of a point to certainty.
        const range = { from: bounds.firstDay, to: bounds.lastDay }

        const insights = detectInsights(
          aggregate(ds, { range, compare: null, agents: [], intents: [], languages: [] }),
          { range, bounds },
        )

        for (const insight of insights) {
          alarms.push({ seed, kind: insight.kind, what: describeAlarm(insight) })
        }
      }

      const incidents = alarms.filter((alarm) => alarm.kind === 'incident')
      const ongoing = alarms.filter((alarm) => alarm.kind !== 'incident')
      const rate = incidents.length / QUARTERS

      const detail =
        alarms.length === 0
          ? '    none'
          : alarms.map((alarm) => `    seed ${alarm.seed}: ${alarm.kind} ${alarm.what}`).join('\n')

      console.log(
        [
          `false-alarm sweep: ${QUARTERS} clean quarters in ${Math.round(
            performance.now() - startedAt,
          )} ms`,
          `  false incidents: ${incidents.length} (${rate.toFixed(3)} per quarter)`,
          `  false ongoing:   ${ongoing.length}`,
          detail,
        ].join('\n'),
      )

      expect(rate, `false incidents:\n${detail}`).toBeLessThanOrEqual(
        MAX_FALSE_INCIDENTS_PER_QUARTER,
      )

      /*
       * Ongoing findings get no budget at all. An agent or an intent is judged
       * against the others in the same quarter rather than against a baseline
       * drawn from time, so there is no drift for the test to trip over — one
       * would be a bug, not bad luck.
       */
      expect(ongoing.map((alarm) => `seed ${alarm.seed}: ${alarm.what}`)).toEqual([])
    },
    TIMEOUT_MS,
  )
})
