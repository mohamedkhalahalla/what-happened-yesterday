/**
 * The one popover every menu, glossary and filter panel is built from.
 *
 * ## The bug this exists to fix
 *
 * Every popover used to be `position: absolute` under its trigger with a fixed
 * width, which is fine in the middle of the page and wrong at its edge. On a
 * full-width widget the ⋮ button sits against the viewport edge, so a 208px
 * panel hung off the side and gave the whole page a horizontal scrollbar — to
 * the right in English, to the left in Arabic.
 *
 * Floating UI fixes the class of bug rather than that one instance:
 *
 * - `flip()` swaps to the opposite alignment when the preferred one would not
 *   fit, so the menu opens inward at the edge.
 * - `shift({ padding: 8 })` nudges it back on screen when flipping is not
 *   enough, keeping 8px of breathing room.
 * - `size()` caps the panel to the space actually available, so on a narrow
 *   phone a 320px catalog becomes as wide as the viewport allows instead of
 *   overflowing it.
 * - `autoUpdate` recomputes on scroll and resize, so a panel that was fine
 *   when it opened does not drift off screen when the page moves under it.
 *
 * ## Two choices worth stating
 *
 * **`strategy: 'fixed'` plus a portal.** A fixed-position element is out of
 * flow, so it cannot contribute to the document's scroll width — the page
 * physically cannot gain a horizontal scrollbar because of a popover, rather
 * than merely being unlikely to. The portal additionally escapes the
 * `overflow: auto` on widget bodies, which would otherwise clip a panel.
 *
 * **Alignment is logical, not physical.** `bottom-end` means the *inline* end,
 * and Floating UI mirrors it under `dir="rtl"` — see the note on RTL below.
 * So the widget menu is `bottom-end` (anchored to the trigger's trailing edge,
 * opening inward) and the filter popovers are `bottom-start` in both
 * languages, with no direction-specific code anywhere.
 *
 * ## RTL, verified rather than assumed
 *
 * `@floating-ui/core` computes the alignment offset as
 * `commonAlign * (alignment === 'end' ? 1 : -1) * (rtl && isVertical ? -1 : 1)`
 * — the sign is negated under RTL for top/bottom placements, which is exactly
 * the mirroring wanted. `rtl` comes from `platform.isRTL`, implemented in
 * `@floating-ui/dom` as `getComputedStyle(element).direction === 'rtl'`, read
 * from the *floating* element. Since `dir` is set on `<html>`, a panel
 * portalled into `<body>` still inherits it. `flip()` and `size()` take the
 * same flag, so collision handling mirrors too.
 */

import {
  FloatingFocusManager,
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  size,
  useDismiss,
  useFloating,
  useInteractions,
  type Placement,
} from '@floating-ui/react'
import { useId, type ReactNode } from 'react'

/** Gap between the trigger and the panel. */
const OFFSET_PX = 4

/** Kept clear of the viewport edge, so `size()` caps width at viewport − 16. */
const VIEWPORT_PADDING_PX = 8

/** A panel shorter than this is not worth showing; scroll it instead. */
const MIN_PANEL_HEIGHT_PX = 140

export type PopoverTriggerArgs = {
  ref: (node: HTMLElement | null) => void
  /** Spread onto the trigger element. Carries aria-expanded and aria-controls. */
  props: Record<string, unknown>
  open: boolean
}

export type PopoverProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Logical placement. `-start` / `-end` mirror under RTL. */
  placement?: Placement
  renderTrigger: (args: PopoverTriggerArgs) => ReactNode
  children: ReactNode
  /** Classes for the panel, minus positioning — this component owns that. */
  panelClassName?: string
  /**
   * Which tabbable inside the panel takes focus on open. `-1` focuses the
   * panel itself, for panels whose content is not interactive.
   */
  initialFocus?: number
}

export function Popover({
  open,
  onOpenChange,
  placement = 'bottom-start',
  renderTrigger,
  children,
  panelClassName = '',
  initialFocus = 0,
}: PopoverProps) {
  const panelId = useId()

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange,
    placement,
    // See the module note: fixed positioning cannot extend the document's
    // scroll width, which is what makes the horizontal overflow impossible
    // rather than merely unlikely.
    strategy: 'fixed',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(OFFSET_PX),
      flip({ padding: VIEWPORT_PADDING_PX }),
      shift({ padding: VIEWPORT_PADDING_PX }),
      size({
        padding: VIEWPORT_PADDING_PX,
        apply({ availableWidth, availableHeight, elements }) {
          elements.floating.style.maxWidth = `${Math.max(0, availableWidth)}px`
          elements.floating.style.maxHeight = `${Math.max(MIN_PANEL_HEIGHT_PX, availableHeight)}px`
        },
      }),
    ],
  })

  // Escape and outside-press, both of which previously lived as hand-rolled
  // document listeners in five separate components.
  const dismiss = useDismiss(context, { outsidePress: true, escapeKey: true })
  const { getReferenceProps, getFloatingProps } = useInteractions([dismiss])

  /*
   * Destructured out of `refs` because these are *setter callbacks*, not ref
   * values — Floating UI's documented API for attaching elements.
   */
  const { setReference, setFloating } = refs

  const triggerProps = {
    ...getReferenceProps({ onClick: () => onOpenChange(!open) }),
    'aria-expanded': open,
    'aria-controls': open ? panelId : undefined,
  }

  return (
    <>
      {renderTrigger({ ref: setReference, props: triggerProps, open })}

      {open && (
        <FloatingPortal>
          {/*
            modal={false}: this is a non-modal popover, so the rest of the page
            stays reachable. returnFocus sends focus back to the trigger on
            close, and closeOnFocusOut closes it when Tab leaves — which is what
            a non-modal popover should do.
          */}
          <FloatingFocusManager
            context={context}
            modal={false}
            initialFocus={initialFocus}
            returnFocus
            closeOnFocusOut
          >
            <div
              ref={setFloating}
              id={panelId}
              style={floatingStyles}
              className={`z-50 overflow-auto rounded-lg border border-border bg-card shadow-card-hover ${panelClassName}`}
              {...getFloatingProps()}
            >
              {children}
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  )
}
