/**
 * A number rendered so the bidi algorithm cannot rearrange it.
 *
 * `<bdi>` isolates its contents from the surrounding paragraph's direction,
 * which is exactly what a formatted number needs when it sits inside Arabic
 * prose: `15,631` keeps its comma in place, and a trailing `%` or `K` stays on
 * the correct side.
 *
 * Strings that already carry FSI…PDI from `format.ts` (deltas and day ranges)
 * are safe either way; wrapping them again is harmless.
 */

import type { ReactNode } from 'react'

export function Num({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <bdi className={className} data-numeric>
      {children}
    </bdi>
  )
}
