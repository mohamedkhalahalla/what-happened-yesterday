/**
 * Proportion bars: one value against a maximum, and a stacked breakdown.
 *
 * Adapted from enigma-dashboard:
 *   src/pages/Insights/components/Meter.tsx             -> HtmlBar
 *   src/pages/Insights/components/OutcomeBreakdown.tsx  -> StackedBar
 *
 * Kept from the originals: sizing the fill with the logical `inlineSize` so
 * the bar grows from the inline-start edge and mirrors under RTL with no extra
 * code, and the `role="progressbar"` / decorative split.
 *
 * Changed in the port: no Recharts and no Radix tooltips — a tooltip is the
 * one place a number can hide, and these values matter enough to be on the
 * page. Colours come from the Okabe-Ito data tokens rather than the brand
 * status colours, and every bar carries a text equivalent giving the actual
 * values, so nothing here is only available to someone who can see colour.
 */

import { useI18n } from '../i18n/useI18n'
import { formatInt, formatPercent } from '../lib/format'

/** Share of `max`, as a 0..1 ratio. Zero denominator reads as zero, not NaN. */
function ratio(value: number, max: number): number {
  return max > 0 ? value / max : 0
}

export type BarTone = 'good' | 'bad' | 'neutral' | 'data-1' | 'data-2' | 'data-3'

const TONE_FILL: Record<BarTone, string> = {
  good: 'bg-good',
  bad: 'bg-bad',
  neutral: 'bg-neutral',
  'data-1': 'bg-data-1',
  'data-2': 'bg-data-2',
  'data-3': 'bg-data-3',
}

export type HtmlBarProps = {
  value: number
  max: number
  tone?: BarTone
  size?: 'sm' | 'md'
  /**
   * What the bar represents. Required unless `decorative`, because a bar
   * without one is a shape that means nothing to a screen reader.
   */
  label?: string
  /** True when an adjacent element already states the value in text. */
  decorative?: boolean
}

/** A single proportion bar. */
export function HtmlBar({
  value,
  max,
  tone = 'neutral',
  size = 'md',
  label,
  decorative = false,
}: HtmlBarProps) {
  const { lang } = useI18n()
  const share = ratio(value, max)

  const a11y = decorative
    ? ({ 'aria-hidden': true } as const)
    : ({
        role: 'progressbar',
        'aria-valuemin': 0,
        'aria-valuemax': 100,
        'aria-valuenow': Math.round(share * 100),
        'aria-valuetext': `${formatInt(lang, value)} / ${formatInt(lang, max)} (${formatPercent(lang, share)})`,
        'aria-label': label,
      } as const)

  return (
    <div
      className={`flex w-full overflow-hidden rounded-full bg-muted ${size === 'sm' ? 'h-1.5' : 'h-2'}`}
      {...a11y}
    >
      <div
        className={`rounded-full transition-[inline-size] duration-300 ease-out ${TONE_FILL[tone]}`}
        style={{ inlineSize: `${share * 100}%` }}
      />
    </div>
  )
}

export type StackedSegment = {
  key: string
  label: string
  value: number
  tone: BarTone
}

export type StackedBarProps = {
  segments: readonly StackedSegment[]
  /** Defaults to the sum of the segments. Pass it to show a remainder. */
  total?: number
  /** Overall description, e.g. "Outcome breakdown". */
  label: string
}

/**
 * A stacked proportion bar with a value/percent legend below it.
 *
 * The legend is not optional decoration: colour alone cannot carry which
 * segment is which, and the segments are often too small to label in place.
 */
export function StackedBar({ segments, total, label }: StackedBarProps) {
  const { lang } = useI18n()
  const sum = segments.reduce((acc, segment) => acc + segment.value, 0)
  const denominator = total ?? sum

  // One sentence carrying every number in the bar, for anyone who cannot see it.
  const textEquivalent = `${label}: ${segments
    .map(
      (segment) =>
        `${segment.label} ${formatInt(lang, segment.value)} (${formatPercent(lang, ratio(segment.value, denominator))})`,
    )
    .join(', ')}`

  return (
    <div>
      <div
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={textEquivalent}
      >
        {segments.map((segment) => (
          <div
            key={segment.key}
            className={`h-full transition-[inline-size] duration-300 ease-out ${TONE_FILL[segment.tone]}`}
            style={{ inlineSize: `${ratio(segment.value, denominator) * 100}%` }}
          />
        ))}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {segments.map((segment) => (
          <li key={segment.key} className="inline-flex items-center gap-1.5 text-[12.5px]">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${TONE_FILL[segment.tone]}`}
              aria-hidden
            />
            <span className="text-muted-foreground">{segment.label}</span>
            <bdi className="font-medium text-card-foreground" data-numeric>
              {formatInt(lang, segment.value)}
            </bdi>
            <bdi className="text-muted-foreground" data-numeric>
              ({formatPercent(lang, ratio(segment.value, denominator))})
            </bdi>
          </li>
        ))}
      </ul>
    </div>
  )
}
