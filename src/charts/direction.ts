/**
 * Which way time runs, and which side the value axis sits on.
 *
 * In an Arabic dashboard the reader's eye starts at the **right**. A time axis
 * that still runs left-to-right asks them to read the chart against the
 * direction they read everything else on the page, and the usual result is
 * that a decline gets read as an improvement. So under RTL the earliest date
 * is at the right edge and time flows leftward, and the value axis moves to
 * the right — the inline start in both languages.
 *
 * SVG has no logical properties, so this is the one place allowed to think in
 * left and right. Everything downstream asks for `start`/`end` and gets the
 * correct physical side back.
 */

import type { UiLang } from '../lib/format'

export type ChartDirection = {
  isRtl: boolean
  /**
   * Maps a domain position to a pixel range that runs in reading order:
   * ascending in LTR, descending in RTL.
   */
  timeRange: (innerWidth: number) => [number, number]
  /** Pixel x of the value axis, on the inline-start side. */
  valueAxisX: (innerWidth: number) => number
  /** `text-anchor` for a label hanging off the inline-start side. */
  startAnchor: 'start' | 'end'
  /** `text-anchor` for a label hanging off the inline-end side. */
  endAnchor: 'start' | 'end'
  /** Sign to nudge by, so `+1 * n` always moves toward the inline end. */
  towardEnd: 1 | -1
}

export function chartDirection(lang: UiLang): ChartDirection {
  const isRtl = lang === 'ar'

  return {
    isRtl,
    // The whole RTL story is this one reversal: in Arabic the first day is at
    // x = innerWidth and time flows toward x = 0.
    timeRange: (innerWidth) => (isRtl ? [innerWidth, 0] : [0, innerWidth]),
    valueAxisX: (innerWidth) => (isRtl ? innerWidth : 0),
    startAnchor: isRtl ? 'start' : 'end',
    endAnchor: isRtl ? 'end' : 'start',
    towardEnd: isRtl ? -1 : 1,
  }
}
