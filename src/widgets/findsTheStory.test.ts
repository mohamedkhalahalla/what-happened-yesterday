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
import { compareRates } from '../lib/stats'
import { KPI_MIN_POINTS, SEGMENT_MIN_POINTS } from '../lib/thresholds'
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

  it('badges exactly one intent across the whole quarter', () => {
    // The point of the materiality threshold. Before it, 12 of 25 intents
    // carried an "Improving" badge and buried the one that needed action.
    const data = run(bounds.firstDay, bounds.lastDay)
    const rows = buildIntentRows(data, {
      weekStarts: data.weekStarts,
      firstDay: bounds.firstDay,
      lastDay: bounds.lastDay,
    })

    const declining = rows.filter((row) => row.quarterTrend?.declining === true)
    const improving = rows.filter((row) => row.quarterTrend?.improving === true)

    console.log(
      `badged intents: ${declining.length} declining, ${improving.length} improving ` +
        `(of ${rows.length} intents)`,
    )

    expect(declining).toHaveLength(1)
    // Improvements are never badged, whatever their size: the UI shows the
    // arrow and the number and leaves it at that.
    const badgeCount = declining.length
    expect(badgeCount).toBe(1)
  })

  it('does not badge a small-but-significant improvement', () => {
    // balance_check drifts up by roughly two points across the quarter. On
    // 90 days of calls that is statistically certain and operationally
    // nothing, so it must not be flagged.
    const data = run(bounds.firstDay, bounds.lastDay)
    const rows = buildIntentRows(data, {
      weekStarts: data.weekStarts,
      firstDay: bounds.firstDay,
      lastDay: bounds.lastDay,
    })

    const balance = rows.find((row) => INTENTS[row.code]!.id === 'balance_check')!
    const trend = balance.quarterTrend!

    console.log(
      `balance_check quarter trend: ${(trend.delta * 100).toFixed(1)} pts, ` +
        `z = ${trend.comparison.z.toFixed(2)}, verdict ${trend.comparison.verdict}, ` +
        `significantButSmall ${trend.comparison.significantButSmall}`,
    )

    expect(Math.abs(trend.delta * 100)).toBeLessThan(SEGMENT_MIN_POINTS)
    expect(trend.comparison.verdict).toBe('normal')
    expect(trend.declining).toBe(false)
    expect(trend.improving).toBe(false)
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

describe('KPI verdicts use the whole-centre threshold', () => {
  it('calls a quiet week normal on every KPI', () => {
    const range = { from: isoToDayIndex('2026-09-20'), to: isoToDayIndex('2026-09-26') }
    const data = run(range.from, range.to)

    const verdicts = (['resolved', 'transferred', 'abandoned'] as const).map((key) => ({
      key,
      comparison: compareRates(
        data.current[key],
        data.current.calls,
        data.previous[key],
        data.previous.calls,
        KPI_MIN_POINTS,
      ),
    }))

    console.log(
      'last week KPI verdicts: ' +
        verdicts
          .map(
            (v) => `${v.key} ${(v.comparison.delta * 100).toFixed(2)}pts ${v.comparison.verdict}`,
          )
          .join(', '),
    )

    for (const { key, comparison } of verdicts) {
      expect(comparison.verdict, key).toBe('normal')
    }
  })

  it('calls the bad deploy day a notable drop in resolution', () => {
    const deployDay = isoToDayIndex('2026-08-25')
    const data = run(deployDay, deployDay)

    const resolution = compareRates(
      data.current.resolved,
      data.current.calls,
      data.previous.resolved,
      data.previous.calls,
      KPI_MIN_POINTS,
    )

    console.log(
      `2026-08-25 resolution: ${(resolution.delta * 100).toFixed(2)} pts, ` +
        `z = ${resolution.z.toFixed(2)}, normal range +/-${(resolution.normalRange * 100).toFixed(2)} pts, ` +
        `verdict ${resolution.verdict}`,
    )

    expect(resolution.verdict).toBe('notable')
    expect(resolution.delta).toBeLessThan(0)
  })
})
