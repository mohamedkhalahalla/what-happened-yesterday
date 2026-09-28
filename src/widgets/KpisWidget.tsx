/**
 * "Are we resolving more than last week?"
 *
 * Four headline numbers, each carrying two separate judgements that are easy
 * to conflate:
 *
 * - **Direction and tone** — did it go up, and is up good? Up is good for
 *   resolution, bad for transfers and abandonment, and neither for volume, so
 *   tone is declared per metric rather than inferred from the sign.
 * - **Significance** — is the change bigger than this week's noise? That comes
 *   from `stats.ts`, and it is stated in words ("Within normal variation"),
 *   never by colour alone.
 *
 * Without the second judgement the first one lies every week: a half-point
 * wobble on 15,000 calls gets the same red arrow as a real collapse.
 *
 * Each value is a button. The number is the question; the calls behind it are
 * the answer, and making the reader retype the filters to see them is the
 * difference between a dashboard and a report.
 */

import { StackedBar, type StackedSegment } from '../components/Bars'
import { KpiCard, type DeltaTone } from '../components/KpiCard'
import type { Counts } from '../engine/types'
import { outcomeLabel } from '../i18n/dictionary'
import { useI18n } from '../i18n/useI18n'
import type { MessageKey } from '../i18n/messages.en'
import {
  formatInt,
  formatPercent,
  formatPointsDelta,
  formatPointsMagnitude,
  formatSignedInt,
} from '../lib/format'
import { compareCounts, compareRates, type Comparison, type Verdict } from '../lib/stats'
import { useDrill } from '../state/drill'
import type { WidgetProps } from './types'

/** Share of `value` in `total`, as a ratio. No division by zero. */
function rate(value: number, total: number): number {
  return total > 0 ? value / total : 0
}

/**
 * The chip under each number. `'none'` is not a statistical verdict — it means
 * there is no previous period in the dataset at all, which must not be
 * confused with "we compared and found nothing".
 */
type ChipState = Verdict | 'none'

const CHIP_LABEL: Record<ChipState, MessageKey> = {
  notable: 'kpi.verdict.notable',
  normal: 'kpi.verdict.normal',
  insufficient: 'kpi.verdict.insufficient',
  none: 'kpi.verdict.noComparison',
}

/**
 * Only a notable change earns colour. Everything else is deliberately quiet:
 * the chip still says what it means in words, so nothing depends on seeing it.
 */
const CHIP_CLASS: Record<ChipState, string> = {
  notable: 'border-transparent bg-accent text-accent-foreground',
  normal: 'border-border text-muted-foreground',
  insufficient: 'border-border text-muted-foreground',
  none: 'border-border text-muted-foreground',
}

type Kpi = {
  key: string
  label: string
  value: string
  delta: string
  magnitude: string
  direction: number
  tone: DeltaTone
  chip: ChipState
  /** What the drill-down should narrow to, if anything beyond the period. */
  outcome?: number
}

/** `deltaTone` cannot be inferred from the sign: rising abandonment is bad. */
function toneFor(delta: number, higherIsBetter: boolean | null): DeltaTone {
  if (delta === 0 || higherIsBetter === null) return 'neutral'
  const good = delta > 0 ? higherIsBetter : !higherIsBetter
  return good ? 'good' : 'bad'
}

export function KpisWidget({ data, showDelta, coverage, filters }: WidgetProps) {
  const { lang, t } = useI18n()
  const { openDrill } = useDrill()

  if (data === null) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <KpiCard key={i} label="" value="" loading />
        ))}
      </div>
    )
  }

  const { current, previous } = data

  /** One rate KPI: value, signed delta, tone and significance chip. */
  const rateKpi = (
    key: string,
    labelKey: MessageKey,
    pick: (counts: Counts) => number,
    higherIsBetter: boolean,
    outcome: number,
  ): Kpi => {
    const value = rate(pick(current), current.calls)
    const comparison: Comparison = compareRates(
      pick(current),
      current.calls,
      pick(previous),
      previous.calls,
    )

    return {
      key,
      label: t(labelKey),
      value: formatPercent(lang, value),
      delta: formatPointsDelta(lang, comparison.delta),
      magnitude: formatPointsMagnitude(lang, comparison.delta),
      direction: comparison.delta,
      tone: toneFor(comparison.delta, higherIsBetter),
      chip: coverage === 'none' ? 'none' : comparison.verdict,
      outcome,
    }
  }

  const volume = compareCounts(current.calls, previous.calls)

  const kpis: Kpi[] = [
    rateKpi('resolution', 'kpi.resolutionRate', (c) => c.resolved, true, 0),
    rateKpi('transfer', 'kpi.transferRate', (c) => c.transferred, false, 1),
    rateKpi('abandonment', 'kpi.abandonmentRate', (c) => c.abandoned, false, 2),
    {
      key: 'calls',
      label: t('kpi.calls'),
      value: formatInt(lang, current.calls),
      // A count changes by a count, not by percentage points.
      delta: formatSignedInt(lang, volume.delta),
      magnitude: formatInt(lang, Math.abs(volume.delta)),
      direction: volume.delta,
      // More calls is neither good nor bad on its own.
      tone: toneFor(volume.delta, null),
      chip: coverage === 'none' ? 'none' : volume.verdict,
    },
  ]

  const segments: StackedSegment[] = [
    { key: 'resolved', label: outcomeLabel(lang, 0), value: current.resolved, tone: 'good' },
    {
      key: 'transferred',
      label: outcomeLabel(lang, 1),
      value: current.transferred,
      tone: 'data-1',
    },
    { key: 'abandoned', label: outcomeLabel(lang, 2), value: current.abandoned, tone: 'bad' },
  ]

  const drillTo = (outcome?: number): void => {
    openDrill({
      range: filters.range,
      constraints: outcome === undefined ? {} : { outcome },
      source: 'kpis',
    })
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <KpiCard
            key={kpi.key}
            label={kpi.label}
            value={kpi.value}
            // No previous period means no delta — not a delta of -100%.
            delta={showDelta ? kpi.delta : undefined}
            deltaMagnitude={kpi.magnitude}
            deltaTone={kpi.tone}
            deltaDirection={kpi.direction}
            onOpenDetails={() => drillTo(kpi.outcome)}
            detailsLabel={t('kpi.showCalls', { label: kpi.label })}
            footnote={
              <span
                className={`inline-block rounded-full border px-2 py-0.5 text-[11px] ${CHIP_CLASS[kpi.chip]}`}
              >
                {t(CHIP_LABEL[kpi.chip])}
              </span>
            }
          />
        ))}
      </div>

      {current.calls === 0 ? (
        <p className="text-[12.5px] text-muted-foreground">{t('state.empty')}</p>
      ) : (
        <StackedBar segments={segments} label={t('outcome.breakdown')} />
      )}
    </div>
  )
}
