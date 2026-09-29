/**
 * A change, shown with its own noise floor attached.
 *
 * The problem this solves came out of review: "+1.9 pts" carried an
 * "Improving" badge on one intent and nothing on another. That is statistically
 * correct — noise shrinks with volume and with distance from a 50% rate — but
 * from the reader's side it is arbitrary, and arbitrary rules get ignored or,
 * worse, worked around.
 *
 * So two things happen here. Non-notable changes are **muted**, which sorts a
 * table of forty numbers into "look at these" and "these are weather" without
 * anyone reading a single one. And every delta can explain itself on hover or
 * focus: "Normal variation here: ±1.4 pts. Changes are flagged when they
 * exceed this and are at least 3 pts."
 *
 * Muting is `--color-muted-foreground`, which was checked at 4.54:1 against
 * the muted surface — quiet, still AA. The visual state is backed by hidden
 * text saying "within normal variation", because a colour difference is not a
 * fact a screen reader can report.
 *
 * The tooltip follows WCAG 1.4.13: Escape dismisses it, the pointer can move
 * into it, and it stays until focus or hover leaves rather than timing out.
 */

import { useId, useState, type ReactNode } from 'react'

import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole,
  safePolygon,
} from '@floating-ui/react'

import { useI18n } from '../i18n/useI18n'
import { formatDecimal } from '../lib/format'
import type { Comparison } from '../lib/stats'

export type DeltaValueProps = {
  comparison: Comparison
  /** The formatted delta, e.g. "+1.9 pts". */
  children: ReactNode
  /** Extra classes applied when the change *is* notable (tone colour). */
  notableClassName?: string
  /**
   * True when this sits inside something already focusable (a table cell in a
   * row button, say). The trigger is then a plain span rather than adding a
   * second tab stop for the same information.
   */
  insideFocusable?: boolean
}

export function DeltaValue({
  comparison,
  children,
  notableClassName = 'text-foreground',
  insideFocusable = false,
}: DeltaValueProps) {
  const { lang, t } = useI18n()
  const [open, setOpen] = useState(false)
  const describedBy = useId()

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'top',
    strategy: 'fixed',
    whileElementsMounted: autoUpdate,
    middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
  })

  const interactions = useInteractions([
    // safePolygon keeps the tooltip open while the pointer travels to it,
    // which is the "hoverable" half of WCAG 1.4.13.
    useHover(context, { handleClose: safePolygon(), delay: { open: 150, close: 0 } }),
    useFocus(context),
    useDismiss(context, { escapeKey: true }),
    useRole(context, { role: 'tooltip' }),
  ])

  const notable = comparison.verdict === 'notable'
  const insufficient = comparison.verdict === 'insufficient'

  const explanation = insufficient
    ? t('delta.tooltipInsufficient')
    : t('delta.tooltip', {
        range: formatDecimal(lang, comparison.normalRange * 100),
        threshold: formatDecimal(lang, comparison.minEffect * 100, 0),
      })

  const { setReference, setFloating } = refs

  return (
    <>
      <span
        ref={setReference}
        // Only add a tab stop when there is not already one wrapping this.
        tabIndex={insideFocusable ? undefined : 0}
        aria-describedby={open ? describedBy : undefined}
        className={`inline-flex items-baseline gap-1 rounded-sm ${
          notable ? notableClassName : 'text-muted-foreground'
        } ${insideFocusable ? '' : 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'}`}
        {...interactions.getReferenceProps()}
      >
        {children}
        {/* The visual mute is a colour; this is the same fact in words. */}
        {!notable && !insufficient && (
          <span className="sr-only-text">{t('delta.withinNormal')}</span>
        )}
      </span>

      {open && (
        <FloatingPortal>
          <div
            ref={setFloating}
            id={describedBy}
            style={floatingStyles}
            className="z-50 max-w-64 rounded-md border border-border bg-card px-2.5 py-1.5 text-[11.5px] leading-[1.5] text-card-foreground shadow-card-hover"
            {...interactions.getFloatingProps()}
          >
            {explanation}
          </div>
        </FloatingPortal>
      )}
    </>
  )
}
