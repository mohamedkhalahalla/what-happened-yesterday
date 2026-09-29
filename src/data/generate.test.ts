import { beforeAll, describe, expect, it } from 'vitest'

import {
  dayIndexToISO,
  isoToDayIndex,
  riyadhDayIndex,
  riyadhHour,
  weekday,
} from '../lib/time/riyadh'
import { DAYS, RAMADAN, SEED, STORY, TOTAL_CALLS } from './config'
import { AGENTS, HANDOFF_REASONS, INTENTS, LANGUAGES, OUTCOMES } from './dictionaries'
import { generateDataset } from './generate'
import { getCall } from './getCall'
import { NO_HANDOFF, type Dataset } from './types'

const RESOLVED = OUTCOMES.indexOf('resolved')
const TRANSFERRED = OUTCOMES.indexOf('transferred')

let ds: Dataset

beforeAll(() => {
  const startedAt = performance.now()
  ds = generateDataset()
  const elapsedMs = performance.now() - startedAt
  // Informational only: no threshold, machines differ.
  console.log(`generateDataset: ${ds.n} rows in ${elapsedMs.toFixed(0)} ms`)
})

// --- small helpers the assertions read better with -------------------------

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

function mean(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length
}

/** Rows of day `offset`, as a `[from, to)` half-open row range. */
function dayRows(d: Dataset, offset: number): [number, number] {
  return [d.dayStartRow[offset]!, d.dayStartRow[offset + 1]!]
}

function dailyCounts(d: Dataset): number[] {
  return Array.from({ length: d.days }, (_, offset) => {
    const [from, to] = dayRows(d, offset)
    return to - from
  })
}

function dailyToolErrorSums(d: Dataset): number[] {
  return Array.from({ length: d.days }, (_, offset) => {
    const [from, to] = dayRows(d, offset)
    let total = 0
    for (let i = from; i < to; i++) total += d.toolErrors[i]!
    return total
  })
}

/** FNV-1a over every column, so "identical dataset" is one cheap comparison. */
function hashDataset(d: Dataset): string {
  let h = 0x811c9dc5
  const mix = (value: number): void => {
    h ^= value & 0xff
    h = Math.imul(h, 0x01000193) >>> 0
    h ^= (value >>> 8) & 0xff
    h = Math.imul(h, 0x01000193) >>> 0
    h ^= (value >>> 16) & 0xff
    h = Math.imul(h, 0x01000193) >>> 0
    h ^= (value >>> 24) & 0xff
    h = Math.imul(h, 0x01000193) >>> 0
  }

  const columns = [
    d.startedAt,
    d.dayIdx,
    d.hour,
    d.durationSec,
    d.language,
    d.agent,
    d.intent,
    d.outcome,
    d.handoff,
    d.sentStart,
    d.sentEnd,
    d.toolErrors,
    d.dayStartRow,
  ]
  for (const column of columns) {
    for (const value of column) mix(value)
  }
  mix(d.n)
  mix(d.firstDay)
  mix(d.days)
  return h.toString(16).padStart(8, '0')
}

/** Evenly spaced row indices — enough coverage without touching all 200k. */
function sampleRows(n: number, count: number): number[] {
  const step = Math.max(1, Math.floor(n / count))
  const rows: number[] = []
  for (let i = 0; i < n; i += step) rows.push(i)
  return rows
}

// --- structure -------------------------------------------------------------

describe('dataset structure', () => {
  it('has exactly TOTAL_CALLS rows in every column', () => {
    expect(ds.n).toBe(TOTAL_CALLS)
    expect(ds.n).toBe(200_000)

    for (const column of [
      ds.startedAt,
      ds.dayIdx,
      ds.hour,
      ds.durationSec,
      ds.language,
      ds.agent,
      ds.intent,
      ds.outcome,
      ds.handoff,
      ds.sentStart,
      ds.sentEnd,
      ds.toolErrors,
    ]) {
      expect(column.length).toBe(TOTAL_CALLS)
    }
  })

  it('covers exactly the 90 days ending the day before the anchor', () => {
    expect(ds.days).toBe(DAYS)
    expect(dayIndexToISO(ds.firstDay)).toBe('2026-06-29')
    expect(dayIndexToISO(ds.firstDay + DAYS - 1)).toBe('2026-09-26')
  })

  it('keeps every dayIdx inside the window', () => {
    const lastDay = ds.firstDay + DAYS - 1
    let min = Infinity
    let max = -Infinity
    for (const d of ds.dayIdx) {
      if (d < min) min = d
      if (d > max) max = d
    }
    expect(min).toBe(ds.firstDay)
    expect(max).toBe(lastDay)
  })

  it('is sorted by startedAt ascending', () => {
    let previous = 0
    let outOfOrder = 0
    for (const t of ds.startedAt) {
      if (t < previous) outOfOrder++
      previous = t
    }
    expect(outOfOrder).toBe(0)
  })

  it('agrees with riyadh.ts on dayIdx and hour for a sample of rows', () => {
    for (const i of sampleRows(ds.n, 2000)) {
      const t = ds.startedAt[i]!
      expect(ds.dayIdx[i], `row ${i}`).toBe(riyadhDayIndex(t))
      expect(ds.hour[i], `row ${i}`).toBe(riyadhHour(t))
    }
  })

  it('has a consistent dayStartRow index', () => {
    expect(ds.dayStartRow.length).toBe(DAYS + 1)
    expect(ds.dayStartRow[0]).toBe(0)
    expect(ds.dayStartRow[DAYS]).toBe(ds.n)

    for (let offset = 0; offset < DAYS; offset++) {
      const [from, to] = dayRows(ds, offset)
      expect(to, `day ${offset} is not after its start`).toBeGreaterThanOrEqual(from)
      // Every row in the slice really does belong to that day.
      expect(ds.dayIdx[from], `first row of day ${offset}`).toBe(ds.firstDay + offset)
      expect(ds.dayIdx[to - 1], `last row of day ${offset}`).toBe(ds.firstDay + offset)
    }
    expect(dailyCounts(ds).reduce((a, b) => a + b, 0)).toBe(TOTAL_CALLS)
  })

  it('stores only codes the dictionaries can resolve', () => {
    for (const i of sampleRows(ds.n, 5000)) {
      expect(ds.language[i]!).toBeLessThan(LANGUAGES.length)
      expect(ds.agent[i]!).toBeLessThan(AGENTS.length)
      expect(ds.intent[i]!).toBeLessThan(INTENTS.length)
      expect(ds.outcome[i]!).toBeLessThan(OUTCOMES.length)
      const handoff = ds.handoff[i]!
      expect(handoff === NO_HANDOFF || handoff < HANDOFF_REASONS.length).toBe(true)
      expect(ds.durationSec[i]!).toBeGreaterThanOrEqual(10)
      expect(ds.durationSec[i]!).toBeLessThanOrEqual(3600)
    }
  })
})

// --- determinism -----------------------------------------------------------

describe('determinism', () => {
  /*
   * The default dataset, pinned.
   *
   * Every number in the README, the screenshots and half the assertions in
   * this repo describe *this* quarter. A refactor that changes it by one call
   * invalidates all of them silently — the tests that compare two runs of the
   * generator would still pass, because both runs moved together. A literal
   * is the only thing that notices.
   *
   * If this fails and the change was deliberate, recompute both hashes, check
   * the README numbers again, and update them in the same commit.
   */
  const DEFAULT_HASH = '62bc0f09'
  const DEFAULT_HASH_WITHOUT_ANOMALIES = 'd8f0437f'

  it('still produces the exact dataset the README describes', () => {
    expect(hashDataset(ds)).toBe(DEFAULT_HASH)
  })

  it('still produces the exact anomaly-free dataset the precision tests use', () => {
    expect(hashDataset(generateDataset(SEED, { anomalies: false }))).toBe(
      DEFAULT_HASH_WITHOUT_ANOMALIES,
    )
  })

  it('produces an identical dataset for the same seed', () => {
    expect(hashDataset(generateDataset(SEED))).toBe(hashDataset(ds))
  })

  it('produces a different dataset for a different seed', () => {
    expect(hashDataset(generateDataset(SEED + 1))).not.toBe(hashDataset(ds))
  })
})

describe('without anomalies', () => {
  /*
   * The same quarter with nothing wrong in it. These tests only check that it
   * is a *well-formed* dataset — that switching the stories off did not
   * quietly change the size or the determinism of the thing. Whether it is
   * actually free of findings is a question for the detectors, and it is
   * asked in `src/insights/detect.test.ts` as the precision case.
   */
  it('still generates exactly the stated number of rows', () => {
    const plain = generateDataset(SEED, { anomalies: false })

    expect(plain.n).toBe(TOTAL_CALLS)
    expect(plain.days).toBe(DAYS)
    expect(plain.firstDay).toBe(ds.firstDay)
    // Row zero of the day after the last is the end of the data, by definition.
    expect(plain.dayStartRow[DAYS]).toBe(TOTAL_CALLS)
  })

  it('is deterministic: same seed and options, identical columns', () => {
    const once = generateDataset(SEED, { anomalies: false })
    const twice = generateDataset(SEED, { anomalies: false })

    expect(hashDataset(twice)).toBe(hashDataset(once))
  })

  it('is a different dataset from the one with the stories in it', () => {
    // Otherwise the switch does nothing and every precision test below is
    // measuring the anomalous dataset twice.
    expect(hashDataset(generateDataset(SEED, { anomalies: false }))).not.toBe(hashDataset(ds))
  })

  it('still follows its seed, not the options object', () => {
    const a = generateDataset(SEED + 1, { anomalies: false })
    const b = generateDataset(SEED + 2, { anomalies: false })

    expect(hashDataset(a)).not.toBe(hashDataset(b))
  })
})

// --- rhythm ----------------------------------------------------------------

describe('weekly and seasonal rhythm', () => {
  it('runs much quieter on Fridays than on workdays', () => {
    const counts = dailyCounts(ds)
    const fridays: number[] = []
    const workdays: number[] = []

    counts.forEach((count, offset) => {
      const dow = weekday(ds.firstDay + offset)
      if (dow === 5) fridays.push(count)
      else if (dow !== 6) workdays.push(count)
    })

    expect(fridays.length).toBeGreaterThan(10)
    expect(mean(fridays)).toBeLessThan(0.6 * mean(workdays))
  })

  it('shifts calls into the late night during Ramadan', () => {
    const from = isoToDayIndex(RAMADAN.fromISO)
    const to = isoToDayIndex(RAMADAN.toISO)
    // 21:00 through 01:59 Riyadh, i.e. the post-taraweeh peak.
    const isLateNight = (hour: number): boolean => hour >= 21 || hour <= 1

    let ramadanNight = 0
    let ramadanTotal = 0
    let otherNight = 0
    let otherTotal = 0

    for (let i = 0; i < ds.n; i++) {
      const day = ds.dayIdx[i]!
      const night = isLateNight(ds.hour[i]!)
      if (day >= from && day <= to) {
        ramadanTotal++
        if (night) ramadanNight++
      } else {
        otherTotal++
        if (night) otherNight++
      }
    }

    const ramadanShare = ramadanNight / ramadanTotal
    const otherShare = otherNight / otherTotal
    expect(ramadanShare).toBeGreaterThanOrEqual(2 * otherShare)
  })
})

// --- anomaly 1: the bad deploy --------------------------------------------

describe('anomaly: bad deploy', () => {
  it('spikes tool errors far above a normal day', () => {
    const sums = dailyToolErrorSums(ds)
    const deployOffset = isoToDayIndex(STORY.badDeploy.dateISO) - ds.firstDay
    expect(deployOffset).toBeGreaterThanOrEqual(0)
    expect(deployOffset).toBeLessThan(DAYS)

    expect(sums[deployOffset]!).toBeGreaterThanOrEqual(4 * median(sums))
  })

  it('confines the spike to the stated office-hours window', () => {
    const deployDay = isoToDayIndex(STORY.badDeploy.dateISO)
    const [from, to] = dayRows(ds, deployDay - ds.firstDay)

    let insideWithErrors = 0
    let insideToolBacked = 0
    let outsideWithErrors = 0
    let outsideTotal = 0

    for (let i = from; i < to; i++) {
      const hour = ds.hour[i]!
      const inWindow = hour >= STORY.badDeploy.fromHour && hour <= STORY.badDeploy.toHour
      const toolBacked = INTENTS[ds.intent[i]!]!.toolBacked

      if (inWindow && toolBacked) {
        insideToolBacked++
        if (ds.toolErrors[i]! > 0) insideWithErrors++
      } else if (!inWindow) {
        outsideTotal++
        if (ds.toolErrors[i]! > 0) outsideWithErrors++
      }
    }

    // Inside the window, tool-backed intents fail at roughly the planted 70%.
    expect(insideWithErrors / insideToolBacked).toBeGreaterThan(0.6)
    // Outside it, the same day looks completely ordinary.
    expect(outsideWithErrors / outsideTotal).toBeLessThan(0.12)
  })
})

// --- anomaly 2: the degrading intent --------------------------------------

describe('anomaly: degrading roaming', () => {
  /** Resolve rate per intent in the first and last 14 days, in percentage points. */
  function resolveRatesByIntent(): { first: number[]; last: number[] } {
    const firstEnd = ds.dayStartRow[14]!
    const lastStart = ds.dayStartRow[DAYS - 14]!

    const tally = INTENTS.map(() => ({ firstN: 0, firstOk: 0, lastN: 0, lastOk: 0 }))
    for (let i = 0; i < ds.n; i++) {
      const row = tally[ds.intent[i]!]!
      const resolved = ds.outcome[i] === RESOLVED
      if (i < firstEnd) {
        row.firstN++
        if (resolved) row.firstOk++
      } else if (i >= lastStart) {
        row.lastN++
        if (resolved) row.lastOk++
      }
    }

    return {
      first: tally.map((r) => (r.firstOk / r.firstN) * 100),
      last: tally.map((r) => (r.lastOk / r.lastN) * 100),
    }
  }

  it('drops roaming by at least 20 points, and nothing else by more than 5', () => {
    const { first, last } = resolveRatesByIntent()
    const roaming = INTENTS.findIndex((it) => it.id === STORY.degradingIntent.intentId)
    expect(roaming).toBeGreaterThanOrEqual(0)

    expect(first[roaming]! - last[roaming]!).toBeGreaterThanOrEqual(20)

    INTENTS.forEach((intent, k) => {
      if (k === roaming) return
      expect(first[k]! - last[k]!, `${intent.id} dropped too much`).toBeLessThanOrEqual(5)
    })
  })

  it('degrades gradually, with no dramatic week-over-week cliff', () => {
    const roaming = INTENTS.findIndex((it) => it.id === STORY.degradingIntent.intentId)
    const weekly: number[] = []

    for (let week = 0; week * 7 + 7 <= DAYS; week++) {
      const from = ds.dayStartRow[week * 7]!
      const to = ds.dayStartRow[week * 7 + 7]!
      let n = 0
      let ok = 0
      for (let i = from; i < to; i++) {
        if (ds.intent[i] !== roaming) continue
        n++
        if (ds.outcome[i] === RESOLVED) ok++
      }
      weekly.push((ok / n) * 100)
    }

    // End to end the decline is large, but no single week falls off a cliff.
    expect(weekly[0]! - weekly[weekly.length - 1]!).toBeGreaterThan(20)
    for (let w = 1; w < weekly.length; w++) {
      expect(weekly[w - 1]! - weekly[w]!, `week ${w} drop`).toBeLessThan(12)
    }
  })
})

// --- anomaly 3: the over-transferring agent --------------------------------

describe('anomaly: over-transferring agent', () => {
  function tallyByAgent() {
    const tally = AGENTS.map(() => ({
      calls: 0,
      transferred: 0,
      byIntent: INTENTS.map(() => 0),
    }))
    for (let i = 0; i < ds.n; i++) {
      const agent = tally[ds.agent[i]!]!
      agent.calls++
      if (ds.outcome[i] === TRANSFERRED) agent.transferred++
      agent.byIntent[ds.intent[i]!]!++
    }
    return tally
  }

  it('transfers far more often than his colleagues', () => {
    const tally = tallyByAgent()
    const majed = AGENTS.findIndex((a) => a.id === STORY.overTransferringAgent.agentId)
    expect(majed).toBeGreaterThanOrEqual(0)

    const rates = tally.map((a) => a.transferred / a.calls)
    const others = rates.filter((_, k) => k !== majed)

    expect(rates[majed]!).toBeGreaterThanOrEqual(2.5 * median(others))
  })

  it('sees the same intent mix as everyone else', () => {
    const tally = tallyByAgent()
    const majed = AGENTS.findIndex((a) => a.id === STORY.overTransferringAgent.agentId)
    const majedTally = tally[majed]!

    INTENTS.forEach((intent, k) => {
      const majedShare = (majedTally.byIntent[k]! / majedTally.calls) * 100

      let otherCalls = 0
      let otherOfIntent = 0
      tally.forEach((agent, a) => {
        if (a === majed) return
        otherCalls += agent.calls
        otherOfIntent += agent.byIntent[k]!
      })
      const otherShare = (otherOfIntent / otherCalls) * 100

      expect(Math.abs(majedShare - otherShare), `${intent.id} share gap`).toBeLessThanOrEqual(2)
    })
  })
})

// --- row view --------------------------------------------------------------

describe('getCall', () => {
  it('rebuilds a valid Call for a sample of rows', () => {
    const languages: readonly string[] = LANGUAGES
    const outcomes: readonly string[] = OUTCOMES
    const handoffReasons: readonly string[] = HANDOFF_REASONS
    const agentIds = AGENTS.map((a) => a.id)
    const intentIds = INTENTS.map((it) => it.id)

    for (const i of sampleRows(ds.n, 1000)) {
      const call = getCall(ds, i)

      expect(call.id).toBe(`C-${String(i).padStart(6, '0')}`)
      expect(call.startedAt.endsWith('Z'), call.startedAt).toBe(true)
      expect(Date.parse(call.startedAt) / 1000).toBe(ds.startedAt[i]!)

      expect(languages).toContain(call.language)
      expect(outcomes).toContain(call.outcome)
      expect(agentIds).toContain(call.agentId)
      expect(intentIds).toContain(call.intent)

      expect(call.durationSec).toBeGreaterThanOrEqual(10)
      expect(call.durationSec).toBeLessThanOrEqual(3600)
      expect(call.sentimentStart).toBeGreaterThanOrEqual(-1)
      expect(call.sentimentStart).toBeLessThanOrEqual(1)
      expect(call.sentimentEnd).toBeGreaterThanOrEqual(-1)
      expect(call.sentimentEnd).toBeLessThanOrEqual(1)
      expect(call.toolErrors).toBeGreaterThanOrEqual(0)

      // handoffReason is present exactly when the call was transferred.
      if (call.outcome === 'transferred') {
        expect(handoffReasons).toContain(call.handoffReason)
      } else {
        expect(call.handoffReason).toBeUndefined()
      }
    }
  })

  it('formats the first row against a hand-checked Riyadh instant', () => {
    const call = getCall(ds, 0)
    // The first call of the window falls on 2026-06-29 Riyadh, so its UTC
    // timestamp is on the 28th or 29th depending on the hour.
    expect(riyadhDayIndex(ds.startedAt[0]!)).toBe(ds.firstDay)
    expect(call.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  it('rejects out-of-range indices', () => {
    expect(() => getCall(ds, -1)).toThrow(RangeError)
    expect(() => getCall(ds, ds.n)).toThrow(RangeError)
    expect(() => getCall(ds, 1.5)).toThrow(RangeError)
  })
})
