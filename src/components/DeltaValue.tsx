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
 * anyone reading a single one. And every delta carries its own explanation:
 * "Normal variation here: ±1.4 pts. Changes are flagged when they exceed this
 * and are at least 3 pts."
 *
 * Muting is `--color-muted-foreground`, which was checked at 4.54:1 against
 * the muted surface — quiet, still AA. The visual state is backed by hidden
 * text saying "within normal variation", because a colour difference is not a
 * fact a screen reader can report.
 *
 * ## Why this is not focusable
 *
 * It was, briefly, so the tooltip could be opened by keyboard. That put a tab
 * stop on every delta in the Intents table — about fifty extra stops in one
 * widget, so reaching the row below meant pressing Tab past two numbers that
 * only ever showed a sentence. A keyboard user paid for a convenience aimed
 * at mouse users.
 *
 * The explanation is now *in the DOM* as visually hidden text, which a screen
 * reader reads in document order with the number it belongs to — no
 * navigation, no discovery problem, and strictly more information than a
 * tooltip nobody found. The tooltip remains for pointer users, who lose
 * nothing, and the column header carries one focusable ⓘ stating the rule once
 * for everyone else.
 */

import { useState, type ReactNode } from 'react'

import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  safePolygon,
  shift,
  useDismiss,
  useFloating,
  useHover,
  useInteractions,
  useRole,
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
}

/** The sentence describing this row's noise floor, for hidden text and tooltip. */
export function useDeltaExplanation(comparison: Comparison): string {
  const { lang, t } = useI18n()

  if (comparison.verdict === 'insufficient') return t('delta.tooltipInsufficient')

  return t('delta.tooltip', {
    range: formatDecimal(lang, comparison.normalRange * 100),
    threshold: formatDecimal(lang, comparison.minEffect * 100, 0),
  })
}

export function DeltaValue({
  comparison,
  children,
  notableClassName = 'text-foreground',
}: DeltaValueProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const explanation = useDeltaExplanation(comparison)

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'top',
    strategy: 'fixed',
    whileElementsMounted: autoUpdate,
    middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
  })

  const interactions = useInteractions([
    // Pointer only. safePolygon keeps it open while the pointer travels to it,
    // and Escape still dismisses — the hoverable and dismissible halves of
    // WCAG 1.4.13. The persistent half is moot with no focus trigger.
    useHover(context, { handleClose: safePolygon(), delay: { open: 150, close: 0 } }),
    useDismiss(context, { escapeKey: true }),
    useRole(context, { role: 'tooltip' }),
  ])

  const notable = comparison.verdict === 'notable'
  const insufficient = comparison.verdict === 'insufficient'

  const { setReference, setFloating } = refs

  return (
    <>
      <span
        ref={setReference}
        className={`inline-flex items-baseline gap-1 ${
          notable ? notableClassName : 'text-muted-foreground'
        }`}
        {...interactions.getReferenceProps()}
      >
        {children}
        {/*
          Everything a pointer user gets from hovering, in document order, for
          everyone who is not pointing at anything. The muting is a colour, so
          it is restated in words; the noise floor is otherwise only in a
          tooltip that never opens without a pointer.
        */}
        <span className="sr-only-text">
          {!notable && !insufficient ? `${t('delta.withinNormal')}. ` : ''}
          {explanation}
        </span>
      </span>

      {open && (
        <FloatingPortal>
          <div
            ref={setFloating}
            style={floatingStyles}
            // aria-hidden: the same sentence is already in the DOM above, and
            // announcing it twice is worse than not announcing it at all.
            aria-hidden
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
