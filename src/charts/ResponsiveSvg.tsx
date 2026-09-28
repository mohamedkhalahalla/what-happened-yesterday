/**
 * An SVG that knows how wide it is.
 *
 * Charts need a pixel width to compute scales, and a width that comes from CSS
 * is not available until after layout. A `ResizeObserver` is the only way to
 * get it without measuring on every render — and it also covers the cases a
 * window resize listener misses, which is most of them here: a widget being
 * resized from ⅓ to ½ via the size menu, the canvas reflowing when another
 * widget is removed, or a sidebar opening.
 *
 * Height is fixed per panel rather than measured. A chart that changes height
 * as data loads makes the whole page jump.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'

export type ResponsiveSvgProps = {
  height: number
  /** Called with the measured inner width; returns the SVG children. */
  children: (width: number) => ReactNode
  /** Width below which nothing is rendered, to avoid nonsense scales. */
  minWidth?: number
  className?: string
}

export function ResponsiveSvg({
  height,
  children,
  minWidth = 120,
  className = '',
}: ResponsiveSvgProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const host = hostRef.current
    if (host === null) return

    // Set once immediately: the observer fires asynchronously, and without
    // this the first paint is an empty box.
    setWidth(host.clientWidth)

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry === undefined) return
      setWidth(entry.contentRect.width)
    })
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={hostRef} className={`w-full ${className}`} style={{ height }}>
      {width >= minWidth && (
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          // The chart is described by its ChartFrame summary and its table
          // view; the SVG itself is decoration as far as assistive tech goes.
          aria-hidden
          focusable="false"
        >
          {children(width)}
        </svg>
      )}
    </div>
  )
}
