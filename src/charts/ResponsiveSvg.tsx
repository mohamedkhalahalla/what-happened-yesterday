/**
 * An SVG that knows how big it is.
 *
 * Charts need pixel dimensions to compute scales, and dimensions that come
 * from CSS are not available until after layout. A `ResizeObserver` is the
 * only way to get them without measuring on every render — and it also covers
 * the cases a window resize listener misses, which is most of them here: a
 * widget resized from ⅓ to ½ via the size menu, the canvas reflowing when
 * another widget is removed, or a sidebar opening.
 *
 * ## Height
 *
 * A fixed `height` is right for a chart whose shape does not depend on the
 * room it is given. `height="fill"` is for one that does: it takes the height
 * of the box it is in, so a widget made taller draws a taller chart rather
 * than the same chart with more white space under it — or, as the daily trend
 * did, the same chart with its bottom half hidden below the fold.
 *
 * `minHeight` is the floor. Below it the SVG keeps its minimum and overflows,
 * which the chart frame's own scroll container then handles: a visibly
 * too-small widget the reader can scroll is better than a chart silently drawn
 * at four pixels a panel.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'

export type ResponsiveSvgProps = {
  /** A fixed pixel height, or `'fill'` to take the height available. */
  height: number | 'fill'
  /** Smallest height to draw at when filling. Below it, the parent scrolls. */
  minHeight?: number
  /** Called with the measured inner size; returns the SVG children. */
  children: (width: number, height: number) => ReactNode
  /** Width below which nothing is rendered, to avoid nonsense scales. */
  minWidth?: number
  className?: string
}

export function ResponsiveSvg({
  height,
  minHeight = 0,
  children,
  minWidth = 120,
  className = '',
}: ResponsiveSvgProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const host = hostRef.current
    if (host === null) return

    // Set once immediately: the observer fires asynchronously, and without
    // this the first paint is an empty box.
    setSize({ width: host.clientWidth, height: host.clientHeight })

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry === undefined) return
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  const filling = height === 'fill'
  const drawnHeight = filling ? Math.max(minHeight, Math.round(size.height)) : height

  return (
    <div
      ref={hostRef}
      className={`w-full ${className}`}
      /*
       * Filling means "be the size of the box", so the host takes the box's
       * height and the SVG inside it is what overflows when there is not
       * enough room — never the host, which would stop the parent from
       * knowing how much room there was in the first place.
       */
      style={filling ? { blockSize: '100%', minBlockSize: 0 } : { height }}
    >
      {size.width >= minWidth && drawnHeight > 0 && (
        <svg
          width={size.width}
          height={drawnHeight}
          viewBox={`0 0 ${size.width} ${drawnHeight}`}
          // The chart is described by its ChartFrame summary and its table
          // view; the SVG itself is decoration as far as assistive tech goes.
          aria-hidden
          focusable="false"
        >
          {children(size.width, drawnHeight)}
        </svg>
      )}
    </div>
  )
}
