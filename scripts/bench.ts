/**
 * Benchmark: columnar engine vs. the obvious object-oriented approach.
 *
 * The comparison is deliberately unfair to the engine. The naive baseline
 * computes *only* the current/previous KPI counts — six numbers each — while
 * `aggregate()` additionally produces the daily series, per-intent weekly
 * sparklines, per-agent splits, handoff reasons and the heatmap, all in the
 * same pass. If the engine still wins on the small job, the architecture is
 * doing something.
 *
 * Run with `npm run bench`.
 */

import { previousPeriod, isoToDayIndex, riyadhDayIndex } from '../src/lib/time/riyadh'
import { AGENTS, INTENTS, LANGUAGES, OUTCOMES } from '../src/data/dictionaries'
import { generateDataset } from '../src/data/generate'
import { getCall } from '../src/data/getCall'
import type { Call, Dataset } from '../src/data/types'
import { aggregate, drill } from '../src/engine/aggregate'
import type { Counts, DrillTarget, Query } from '../src/engine/types'

const WARMUP_RUNS = 5
const MEASURED_RUNS = 50

const intentCode = (id: string): number => INTENTS.findIndex((it) => it.id === id)
const day = (iso: string): number => isoToDayIndex(iso)

// --- timing helpers --------------------------------------------------------

type Stats = { medianMs: number; p95Ms: number }

/** Nearest-rank percentile: for 50 samples, p95 is the 48th slowest. */
function percentile(sortedMs: readonly number[], fraction: number): number {
  const rank = Math.ceil(fraction * sortedMs.length) - 1
  return sortedMs[Math.min(Math.max(rank, 0), sortedMs.length - 1)]!
}

function measure(run: () => void): Stats {
  for (let i = 0; i < WARMUP_RUNS; i++) run()

  const samples: number[] = []
  for (let i = 0; i < MEASURED_RUNS; i++) {
    const startedAt = performance.now()
    run()
    samples.push(performance.now() - startedAt)
  }
  samples.sort((a, b) => a - b)

  return { medianMs: percentile(samples, 0.5), p95Ms: percentile(samples, 0.95) }
}

const fmt = (ms: number): string => (ms >= 10 ? ms.toFixed(1) : ms.toFixed(2))

/**
 * Thousands separators, done by hand. `toLocaleString` would be the obvious
 * call, but the repo's date guardrail cannot tell a number format from a date
 * format and flags every `toLocale*String` with no explicit options — a good
 * trade, so this works around it rather than loosening the rule.
 */
const thousands = (n: number): string => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')

// --- scenarios -------------------------------------------------------------

type Scenario = { name: string; query: Query }

function scenarios(): Scenario[] {
  const base = { compare: null, agents: [], intents: [], languages: [] }
  const arabic = LANGUAGES.indexOf('ar')

  return [
    {
      name: 'All 90 days, no filters',
      query: { range: { from: day('2026-06-29'), to: day('2026-09-26') }, ...base },
    },
    {
      name: 'Last week (7 days)',
      query: { range: { from: day('2026-09-20'), to: day('2026-09-26') }, ...base },
    },
    {
      name: 'Single agent, 90 days',
      query: {
        range: { from: day('2026-06-29'), to: day('2026-09-26') },
        compare: null,
        agents: [5],
        intents: [],
        languages: [],
      },
    },
    {
      name: 'Single intent + Arabic, 90 days',
      query: {
        range: { from: day('2026-06-29'), to: day('2026-09-26') },
        compare: null,
        agents: [],
        intents: [intentCode('roaming')],
        languages: [arabic],
      },
    },
    {
      name: 'Heavy: 3 agents + 10 intents + 2 languages',
      query: {
        range: { from: day('2026-06-29'), to: day('2026-09-26') },
        compare: null,
        agents: [0, 3, 5],
        intents: INTENTS.slice(0, 10).map((_, i) => i),
        languages: [arabic, LANGUAGES.indexOf('en')],
      },
    },
  ]
}

// --- the naive baseline ----------------------------------------------------

function emptyCounts(): Counts {
  return {
    calls: 0,
    resolved: 0,
    transferred: 0,
    abandoned: 0,
    toolErrorCalls: 0,
    toolErrorsSum: 0,
  }
}

/**
 * KPI counts the way you would first write them: an array of objects, string
 * comparisons, `.filter()`, and a `Date` parse per row to find the day.
 *
 * Day maths still goes through `riyadh.ts` on epoch seconds — the point of the
 * comparison is data layout, not a fixed time-zone bug.
 */
function naiveCounts(calls: readonly Call[], q: Query): { current: Counts; previous: Counts } {
  const agentIds = q.agents.map((code) => AGENTS[code]!.id)
  const intentIds = q.intents.map((code) => INTENTS[code]!.id)
  const languages = q.languages.map((code) => LANGUAGES[code]!)
  const previous = previousPeriod(q.range)

  const matching = calls
    .filter((call) => agentIds.length === 0 || agentIds.includes(call.agentId))
    .filter((call) => intentIds.length === 0 || intentIds.includes(call.intent))
    .filter((call) => languages.length === 0 || languages.includes(call.language))

  const tally = (counts: Counts, call: Call): void => {
    counts.calls++
    if (call.outcome === 'resolved') counts.resolved++
    if (call.outcome === 'transferred') counts.transferred++
    if (call.outcome === 'abandoned') counts.abandoned++
    if (call.toolErrors >= 1) {
      counts.toolErrorCalls++
      counts.toolErrorsSum += call.toolErrors
    }
  }

  const out = { current: emptyCounts(), previous: emptyCounts() }
  for (const call of matching) {
    const dayIndex = riyadhDayIndex(new Date(call.startedAt).getTime() / 1000)
    if (dayIndex >= q.range.from && dayIndex <= q.range.to) tally(out.current, call)
    else if (dayIndex >= previous.from && dayIndex <= previous.to) tally(out.previous, call)
  }
  return out
}

function materialiseAll(ds: Dataset): Call[] {
  const calls: Call[] = []
  for (let i = 0; i < ds.n; i++) calls.push(getCall(ds, i))
  return calls
}

// --- main ------------------------------------------------------------------

function main(): void {
  process.stdout.write('Generating dataset…\n')
  const generateStart = performance.now()
  const ds = generateDataset()
  const generateMs = performance.now() - generateStart

  process.stdout.write('Materialising 200k Call objects for the naive baseline…\n')
  const materialiseStart = performance.now()
  const calls = materialiseAll(ds)
  const materialiseMs = performance.now() - materialiseStart

  const rows: string[] = []
  for (const { name, query } of scenarios()) {
    const engine = measure(() => void aggregate(ds, query))
    const naive = measure(() => void naiveCounts(calls, query))

    rows.push(
      `| ${name} | ${fmt(engine.medianMs)} | ${fmt(engine.p95Ms)} | ${fmt(naive.medianMs)} | ${fmt(naive.p95Ms)} | ${(naive.medianMs / engine.medianMs).toFixed(1)}× |`,
    )
  }

  const drillCases: { name: string; query: Query; target: DrillTarget }[] = [
    {
      name: 'All rows in the last week',
      query: {
        range: { from: day('2026-09-20'), to: day('2026-09-26') },
        compare: null,
        agents: [],
        intents: [],
        languages: [],
      },
      target: { period: 'current' },
    },
    {
      name: 'Roaming + transferred, whole quarter',
      query: {
        range: { from: day('2026-06-29'), to: day('2026-09-26') },
        compare: null,
        agents: [],
        intents: [],
        languages: [],
      },
      target: {
        period: 'current',
        intent: intentCode('roaming'),
        outcome: OUTCOMES.indexOf('transferred'),
      },
    },
  ]

  const drillRows: string[] = []
  for (const { name, query, target } of drillCases) {
    const matched = drill(ds, query, target).length
    const stats = measure(() => void drill(ds, query, target))
    drillRows.push(
      `| ${name} | ${thousands(matched)} | ${fmt(stats.medianMs)} | ${fmt(stats.p95Ms)} |`,
    )
  }

  const report = [
    '',
    '## Benchmark',
    '',
    `Node ${process.version}, ${thousands(ds.n)} calls over ${ds.days} days.`,
    `${WARMUP_RUNS} warm-up runs, then ${MEASURED_RUNS} measured runs per scenario.`,
    '',
    `Dataset generation: **${fmt(generateMs)} ms**.`,
    `Materialising all rows as \`Call\` objects: **${fmt(materialiseMs)} ms** (the naive baseline pays this once).`,
    '',
    '### Aggregation',
    '',
    'The engine computes the KPI counts **plus** the daily series, per-intent weekly',
    'sparklines, per-agent splits, handoff reasons and the heatmap. The naive baseline',
    'computes the KPI counts only.',
    '',
    '| Scenario | Engine median | Engine p95 | Naive median | Naive p95 | Speed-up |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...rows,
    '',
    '### Drill-down',
    '',
    '| Target | Rows | Median | p95 |',
    '| --- | ---: | ---: | ---: |',
    ...drillRows,
    '',
  ].join('\n')

  process.stdout.write(report)
}

main()
