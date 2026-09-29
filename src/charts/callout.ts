/**
 * Keeping a label inside the plot it belongs to.
 *
 * Its own module, not a helper inside the chart, for two reasons: a `.tsx`
 * file that exports a function beside a component upsets react-refresh, and
 * the edge cases here are far easier to state as arithmetic than to provoke by
 * rendering. A label runs over the value axis at one end of the chart and off
 * the widget at the other, and in Arabic those two ends swap — which is the
 * kind of bug that ships in the language nobody checked.
 */

/**
 * Assumed width of one character, in pixels, at the callout's font size.
 *
 * SVG text cannot be measured before it is drawn and measuring it afterwards
 * costs a layout pass per frame. An estimate is enough because it is only used
 * to keep the label inside the plot: erring wide costs a few pixels of margin,
 * erring narrow pushes a word over the axis.
 */
export const CALLOUT_CHAR_WIDTH = 5.4

/**
 * Where to anchor a centred label so it stays within `[0, innerWidth]`.
 *
 * Works in the plot's own coordinates, which the chart has already mirrored
 * for RTL — so one clamp serves both directions and the axis, which lives
 * outside those coordinates, is never covered.
 *
 * A label wider than the plot is centred rather than clipped at one end:
 * losing half of it from each side is a legible label with its middle intact,
 * where losing all of one side reads as a different, shorter word.
 */
export function clampCalloutX(x: number, label: string, innerWidth: number): number {
  const half = (label.length * CALLOUT_CHAR_WIDTH) / 2
  if (half * 2 >= innerWidth) return innerWidth / 2

  return Math.min(Math.max(x, half), innerWidth - half)
}
