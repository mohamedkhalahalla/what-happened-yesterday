/**
 * A 13-week resolution trend, one per table row.
 *
 * **Shared 0–100% scale across every row.** Autoscaling each sparkline to its
 * own range is the default in most libraries and it is actively misleading
 * here: an intent wobbling between 86% and 88% would draw the same dramatic
 * shape as one collapsing from 82% to 45%. A shared scale means the eye can
 * compare rows down the column, which is the only reason to put sparklines in
 * a table at all.
 *
 * Weeks below the volume threshold are gaps, not zeroes — same rule as the
 * daily trend, same reason.
 */

import { line } from 'd3-shape'

const WIDTH = 96
const HEIGHT = 22
const PADDING = 2

export type SparklineProps = {
  /** Weekly rates, `undefined` where the week was too small to trust. */
  values: readonly (number | undefined)[]
  /** Indices of weeks inside the selected period, highlighted behind the line. */
  selectedWeeks?: readonly number[]
  /** Describes the trend in words, since the shape is not available to everyone. */
  ariaLabel: string
}

export function Sparkline({ values, selectedWeeks = [], ariaLabel }: SparklineProps) {
  if (values.length === 0) {
    return <span className="sr-only-text">{ariaLabel}</span>
  }

  const step = values.length > 1 ? (WIDTH - PADDING * 2) / (values.length - 1) : 0
  const x = (index: number): number => PADDING + index * step
  // Fixed domain, never fitted to the row.
  const y = (value: number): number => HEIGHT - PADDING - value * (HEIGHT - PADDING * 2)

  const path = line<number | undefined>()
    .defined((value) => value !== undefined)
    .x((_, index) => x(index))
    .y((value) => y(value ?? 0))(values as (number | undefined)[])

  const selected = new Set(selectedWeeks)

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={ariaLabel}
      className="overflow-visible"
    >
      {/* The selected period, so a row can be read against the rest of the table. */}
      {[...selected].map((index) => (
        <rect
          key={index}
          // logical-css-ignore: sparkline weeks always read oldest to newest
          // within the row, matching the table's own row order.
          x={x(index) - step / 2}
          y={0}
          width={Math.max(1, step)}
          height={HEIGHT}
          className="fill-accent"
        />
      ))}

      {path !== null && <path d={path} className="fill-none stroke-data-5" strokeWidth={1.25} />}
    </svg>
  )
}
