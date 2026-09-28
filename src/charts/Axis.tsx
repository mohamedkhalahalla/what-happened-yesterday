/**
 * Axes. Two rules, both non-negotiable.
 *
 * **Every value axis starts at zero.** A rate chart with a 60–75% y-axis turns
 * a two-point wobble into a cliff, and the reader has no way to know the
 * baseline was cut unless they read the axis labels — which nobody does before
 * forming an impression. Only the top of the scale adapts.
 *
 * **Ticks go through format.ts**, so dates and percentages are localized and
 * in Riyadh time like every other number on the page.
 */

import type { ScaleLinear } from 'd3-scale'

import { formatDay, formatPercent, type UiLang } from '../lib/format'
import type { ChartDirection } from './direction'

const TICK_TEXT_CLASS = 'fill-muted-foreground text-[10px]'
const GRID_CLASS = 'stroke-border'

export type ValueAxisProps = {
  scale: ScaleLinear<number, number>
  direction: ChartDirection
  innerWidth: number
  lang: UiLang
  /** Number of ticks to aim for. */
  tickCount?: number
  /** Render tick values as percentages rather than plain numbers. */
  asPercent?: boolean
  /** Decimals for percentage ticks. */
  percentDigits?: number
}

/**
 * The value axis, on the inline-start side with gridlines across the plot.
 *
 * Gridlines rather than tick marks: a reader comparing a point to a value
 * needs to travel across the chart, and a 4px tick does not help them do that.
 */
export function ValueAxis({
  scale,
  direction,
  innerWidth,
  lang,
  tickCount = 4,
  asPercent = false,
  percentDigits = 0,
}: ValueAxisProps) {
  const ticks = scale.ticks(tickCount)
  const axisX = direction.valueAxisX(innerWidth)
  // Labels hang off the axis, away from the plot.
  const labelX = axisX + (direction.isRtl ? 8 : -8)

  return (
    <g>
      {ticks.map((tick) => {
        const y = scale(tick)
        return (
          <g key={tick}>
            <line x1={0} x2={innerWidth} y1={y} y2={y} className={GRID_CLASS} strokeWidth={1} />
            <text
              x={labelX}
              y={y}
              dominantBaseline="middle"
              textAnchor={direction.startAnchor}
              className={TICK_TEXT_CLASS}
            >
              {asPercent ? formatPercent(lang, tick, percentDigits) : String(tick)}
            </text>
          </g>
        )
      })}
    </g>
  )
}

export type TimeAxisProps = {
  /** Day indices to label. */
  ticks: readonly number[]
  /** Maps a day index to a pixel x. */
  x: (dayIndex: number) => number
  y: number
  lang: UiLang
}

/** The time axis: sparse labelled ticks, no line — the gridlines carry it. */
export function TimeAxis({ ticks, x, y, lang }: TimeAxisProps) {
  return (
    <g>
      {ticks.map((dayIndex) => (
        <text
          key={dayIndex}
          x={x(dayIndex)}
          y={y}
          textAnchor="middle"
          dominantBaseline="hanging"
          className={TICK_TEXT_CLASS}
        >
          {formatDay(lang, dayIndex)}
        </text>
      ))}
    </g>
  )
}

/**
 * How many of the candidate ticks to actually draw.
 *
 * Ninety days of Sundays is thirteen labels, which collide below about 500px.
 * Rather than rotating them — unreadable in any language and worse in
 * Arabic — drop every other one until they fit.
 */
export function thinTicks<T>(ticks: readonly T[], width: number, pxPerTick = 64): T[] {
  if (ticks.length === 0) return []

  const affordable = Math.max(1, Math.floor(width / pxPerTick))
  const step = Math.max(1, Math.ceil(ticks.length / affordable))
  return ticks.filter((_, index) => index % step === 0)
}
