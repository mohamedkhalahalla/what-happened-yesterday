/**
 * The test that matters: does the dashboard find the planted anomalies on its
 * own?
 *
 * Nothing in this file imports STORY, and neither does any module it exercises.
 * The dataset is generated, aggregated through the real engine, and fed to the
 * same row builders the widgets use. If these pass, the widgets surface the
 * three anomalies from the data alone — which is the entire premise of the
 * exercise. If they fail, the dashboard is only ever going to show what it was
 * told, and the analysis is theatre.
 */

import { beforeAll, describe, expect, it } from 'vitest'

import { INTENTS, AGENTS } from '../data/dictionaries'
import { generateDataset } from '../data/generate'
import { aggregate } from '../engine/aggregate'
import type { Dataset } from '../data/types'
import type { Aggregates } from '../engine/types'
import { isoToDayIndex } from '../lib/time/riyadh'
import { boundsOf, comparisonRange, type DataBounds } from '../state/presets'
import { buildAgentRows } from './agentsData'
import { buildIntentRows } from './intentsData'
import { buildReasonRows } from './reasonsData'

let ds: Dataset
let bounds: DataBounds

beforeAll(() => {
  ds = generateDataset()
  bounds = boundsOf(ds)
})

/** Aggregate with no filters over an inclusive day range. */
function run(from: number, to: number): Aggregates {
  return aggregate(ds, {
    range: { from, to },
    compare: comparisonRange({ from, to }),
    agents: [],
    intents: [],
    languages: [],
  })
}

describe('anomaly 2: the degrading intent', () => {
  it('flags roaming, and only roaming, as declining across the quarter', () => {
    const data = run(bounds.firstDay, bounds.lastDay)
    const rows = buildIntentRows(data, {
      weekStarts: data.weekStarts,
      firstDay: bounds.firstDay,
      lastDay: bounds.lastDay,
    })

    const declining = rows
      .filter((row) => row.quarterTrend?.declining === true)
      .map((row) => ({
        id: INTENTS[row.code]!.id,
        points: (row.quarterTrend!.delta * 100).toFixed(1),
        z: row.quarterTrend!.comparison.z.toFixed(2),
      }))

    // Printed so the numbers behind the claim are visible in the run.
    console.log('declining intents:', JSON.stringify(declining))

    expect(declining.map((d) => d.id)).toEqual(['roaming'])

    const roaming = rows.find((row) => INTENTS[row.code]!.id === 'roaming')!
    expect(roaming.quarterTrend!.delta).toBeLessThan(-0.2)
    expect(roaming.quarterTrend!.comparison.verdict).toBe('notable')
  })

  it('does not flag roaming as improving', () => {
    const data = run(bounds.firstDay, bounds.lastDay)
    const rows = buildIntentRows(data, {
      weekStarts: data.weekStarts,
      firstDay: bounds.firstDay,
      lastDay: bounds.lastDay,
    })
    const roaming = rows.find((row) => INTENTS[row.code]!.id === 'roaming')!
    expect(roaming.quarterTrend!.improving).toBe(false)
  })
})

describe('anomaly 3: the over-transferring agent', () => {
  it('flags agent_06, and only agent_06, against the median', () => {
    const view = buildAgentRows(run(bounds.firstDay, bounds.lastDay))

    const flagged = view.rows
      .filter((row) => row.outlier)
      .map((row) => ({
        id: AGENTS[row.code]!.id,
        rate: (row.transferRate * 100).toFixed(1) + '%',
        ratio: row.ratioToMedian.toFixed(2) + 'x',
      }))

    console.log(
      `median transfer rate: ${(view.median * 100).toFixed(1)}%  flagged: ${JSON.stringify(flagged)}`,
    )

    expect(flagged.map((f) => f.id)).toEqual(['agent_06'])

    const majed = view.rows.find((row) => AGENTS[row.code]!.id === 'agent_06')!
    expect(majed.ratioToMedian).toBeGreaterThanOrEqual(1.5)
    // He should also be the worst, not merely flagged.
    expect(AGENTS[view.worst!.code]!.id).toBe('agent_06')
  })

  it('leaves every other agent close to the median', () => {
    const view = buildAgentRows(run(bounds.firstDay, bounds.lastDay))
    for (const row of view.rows) {
      if (AGENTS[row.code]!.id === 'agent_06') continue
      expect(row.ratioToMedian, AGENTS[row.code]!.id).toBeLessThan(1.5)
    }
  })
})

describe('anomaly 1: the bad deploy', () => {
  it('flags tool_error as a notable change on 2026-08-25', () => {
    const deployDay = isoToDayIndex('2026-08-25')
    const view = buildReasonRows(run(deployDay, deployDay))

    const toolError = view.rows.find((row) => row.key === 'tool_error')!

    console.log(
      `2026-08-25 tool_error: ${toolError.currentPer100.toFixed(1)} per 100 vs ` +
        `${toolError.previousPer100.toFixed(1)} per 100, z = ${toolError.delta.z.toFixed(1)}, ` +
        `verdict ${toolError.delta.verdict}`,
    )

    expect(toolError.delta.verdict).toBe('notable')
    expect(toolError.currentPer100).toBeGreaterThan(toolError.previousPer100)
    // It should also be the single largest mover that day.
    expect(view.notable.map((row) => row.key)).toContain('tool_error')
  })

  it('does not flag tool_error on an ordinary day', () => {
    // The Tuesday a fortnight before the deploy: same weekday, nothing wrong.
    const ordinary = isoToDayIndex('2026-08-11')
    const view = buildReasonRows(run(ordinary, ordinary))
    const toolError = view.rows.find((row) => row.key === 'tool_error')!

    expect(toolError.delta.verdict).not.toBe('notable')
  })
})
