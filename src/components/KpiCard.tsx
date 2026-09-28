/**
 * A single headline number with its period-over-period change.
 *
 * Adapted from enigma-dashboard:
 *   src/pages/Insights/components/KpiHeroCard.tsx        (tile anatomy: big
 *                                                         tabular value, muted
 *                                                         label, optional
 *                                                         sublabel/meter)
 *   src/pages/Dashboard/components/MetricCard.tsx        (loading/error/empty
 *                                                         handling, the
 *                                                         trend footer)
 *
 * Changed in the port:
 *
 * - The tone chip and Lucide icon are gone. Eight coloured icon chips across a
 *   KPI row is decoration competing with the numbers; the label already says
 *   what the metric is.
 * - The trend is stated in **percentage points**, not as a percent change of a
 *   percent. "Resolution up 4%" is ambiguous — 4% of what? — where
 *   "+0.4 pts" is not. The original's ▲/▼ glyph is kept as a redundant
 *   encoding alongside colour, so direction survives greyscale and CVD.
 * - Colour comes from --color-good / --color-bad (blue / vermillion), never
 *   green/red as the only difference.
 * - `deltaTone` is explicit because "up" is not always good: a rising
 *   abandonment rate is bad, and the card cannot infer that.
 */

import type { ReactNode } from 'react'

import { useI18n } from '../i18n/useI18n'
import { Num } from './Num'

export type DeltaTone = 'good' | 'bad' | 'neutral'

export type KpiCardProps = {
  label: string
  /** Already formatted — the card does not know if this is a rate or a count. */
  value: string
  /** Formatted delta, e.g. from `formatPointsDelta`. */
  delta?: string
  /** Whether this movement is good news. Not inferable from the sign. */
  deltaTone?: DeltaTone
  /** Raw direction for the glyph: positive, negative or flat. */
  deltaDirection?: number
  footnote?: ReactNode
  loading?: boolean
}

const DELTA_COLOR: Record<DeltaTone, string> = {
  good: 'text-good',
  bad: 'text-bad',
  neutral: 'text-neutral',
}

function directionGlyph(direction: number): string {
  if (direction > 0) return '▲'
  if (direction < 0) return '▼'
  return '—'
}

export function KpiCard({
  label,
  value,
  delta,
  deltaTone = 'neutral',
  deltaDirection = 0,
  footnote,
  loading = false,
}: KpiCardProps) {
  const { t } = useI18n()

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-[18px] shadow-card">
        <div className="animate-pulse space-y-3" aria-hidden>
          <div className="h-3.5 w-24 rounded-md bg-muted" />
          <div className="h-7 w-20 rounded-md bg-muted" />
          <div className="h-3 w-28 rounded-md bg-muted" />
        </div>
        <p className="sr-only-text" role="status">
          {t('state.loading')}
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card p-[18px] shadow-card">
      <div className="text-[12.5px] text-muted-foreground">{label}</div>

      <div className="mt-2 text-[26px] leading-none font-semibold text-card-foreground">
        <Num>{value}</Num>
      </div>

      {delta !== undefined && (
        <div className={`mt-2.5 text-[12.5px] font-medium ${DELTA_COLOR[deltaTone]}`}>
          {/* Glyph as well as colour: direction must survive greyscale and
              colour-vision deficiency. */}
          <span className="text-[9px] leading-none" aria-hidden>
            {directionGlyph(deltaDirection)}
          </span>{' '}
          <Num>{delta}</Num>{' '}
          <span className="font-normal text-muted-foreground">{t('kpi.vsPrevious')}</span>
        </div>
      )}

      {footnote !== undefined && (
        <div className="mt-2 text-[11.5px] text-muted-foreground">{footnote}</div>
      )}
    </div>
  )
}
