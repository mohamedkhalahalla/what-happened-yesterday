/**
 * "Are we resolving more than last week?"
 *
 * The four headline rates plus the outcome breakdown, moved here out of
 * App.tsx now that the canvas owns arrangement. Nothing about the numbers
 * changed in the move.
 */

import { StackedBar, type StackedSegment } from '../components/Bars'
import { KpiCard, type DeltaTone } from '../components/KpiCard'
import type { Counts } from '../engine/types'
import { outcomeLabel } from '../i18n/dictionary'
import { useI18n } from '../i18n/useI18n'
import {
  formatInt,
  formatPercent,
  formatPointsDelta,
  formatPointsMagnitude,
  formatSignedInt,
} from '../lib/format'
import type { WidgetProps } from './types'

/** Share of `value` in `total`, as a ratio. No division by zero. */
function rate(value: number, total: number): number {
  return total > 0 ? value / total : 0
}

/** One KPI's current rate, and its change in points against the previous period. */
function rateDelta(
  current: Counts,
  previous: Counts,
  pick: (counts: Counts) => number,
): { value: number; delta: number } {
  const value = rate(pick(current), current.calls)
  const before = rate(pick(previous), previous.calls)
  return { value, delta: value - before }
}

/** `deltaTone` cannot be inferred from the sign: rising abandonment is bad. */
function toneFor(delta: number, higherIsBetter: boolean): DeltaTone {
  if (delta === 0) return 'neutral'
  const good = delta > 0 ? higherIsBetter : !higherIsBetter
  return good ? 'good' : 'bad'
}

export function KpisWidget({ data, showDelta }: WidgetProps) {
  const { lang, t } = useI18n()

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

  const resolution = rateDelta(current, previous, (c) => c.resolved)
  const transfer = rateDelta(current, previous, (c) => c.transferred)
  const abandonment = rateDelta(current, previous, (c) => c.abandoned)
  // A count changes by a count, not by percentage points.
  const callsDelta = current.calls - previous.calls

  const kpis = [
    {
      key: 'resolution',
      label: t('kpi.resolutionRate'),
      value: formatPercent(lang, resolution.value),
      delta: formatPointsDelta(lang, resolution.delta),
      magnitude: formatPointsMagnitude(lang, resolution.delta),
      direction: resolution.delta,
      tone: toneFor(resolution.delta, true),
    },
    {
      key: 'transfer',
      label: t('kpi.transferRate'),
      value: formatPercent(lang, transfer.value),
      delta: formatPointsDelta(lang, transfer.delta),
      magnitude: formatPointsMagnitude(lang, transfer.delta),
      direction: transfer.delta,
      tone: toneFor(transfer.delta, false),
    },
    {
      key: 'abandonment',
      label: t('kpi.abandonmentRate'),
      value: formatPercent(lang, abandonment.value),
      delta: formatPointsDelta(lang, abandonment.delta),
      magnitude: formatPointsMagnitude(lang, abandonment.delta),
      direction: abandonment.delta,
      tone: toneFor(abandonment.delta, false),
    },
    {
      key: 'calls',
      label: t('kpi.calls'),
      value: formatInt(lang, current.calls),
      delta: formatSignedInt(lang, callsDelta),
      magnitude: formatInt(lang, Math.abs(callsDelta)),
      direction: callsDelta,
      tone: toneFor(callsDelta, true),
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
