/**
 * The ⋮ menu on each widget: move, resize, remove.
 *
 * This menu is not a convenience. WCAG 2.2 SC 2.5.7 (Dragging Movements)
 * requires that anything achievable by dragging is also achievable without it,
 * and "Move earlier / Move later" is that path — it works with a mouse, a
 * keyboard, or a switch, and unlike a keyboard drag it needs no spatial model
 * of the grid.
 *
 * Same popover pattern as the filter multi-selects: a real button, focus moved
 * in on open, Escape closes and returns focus, outside click closes without
 * stealing focus. Repeating the pattern rather than abstracting it keeps both
 * readable; there are two of them, not twelve.
 */

import { useEffect, useId, useRef, useState } from 'react'

import { useI18n } from '../../i18n/useI18n'
import { WIDGETS, type WidgetHeight, type WidgetId, type WidgetWidth } from '../../widgets/registry'
import { HEIGHT_ROWS } from '../../state/layout'

const WIDTHS: readonly WidgetWidth[] = [4, 6, 8, 12]
const HEIGHTS: readonly WidgetHeight[] = ['S', 'M', 'L']

const WIDTH_LABEL = {
  4: 'widget.width.4',
  6: 'widget.width.6',
  8: 'widget.width.8',
  12: 'widget.width.12',
} as const

const HEIGHT_LABEL = {
  S: 'widget.height.S',
  M: 'widget.height.M',
  L: 'widget.height.L',
} as const

export type WidgetMenuProps = {
  id: WidgetId
  title: string
  width: WidgetWidth
  height: WidgetHeight
  canMoveEarlier: boolean
  canMoveLater: boolean
  onMove: (delta: number) => void
  onResize: (size: { w?: WidgetWidth; h?: WidgetHeight }) => void
  onRemove: () => void
}

export function WidgetMenu({
  id,
  title,
  width,
  height,
  canMoveEarlier,
  canMoveLater,
  onMove,
  onResize,
  onRemove,
}: WidgetMenuProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)

  const panelId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const firstItemRef = useRef<HTMLButtonElement>(null)

  const closeAndRestoreFocus = (): void => {
    setOpen(false)
    triggerRef.current?.focus()
  }

  useEffect(() => {
    if (open) firstItemRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setOpen(false)
      triggerRef.current?.focus()
    }
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node
      if (panelRef.current?.contains(target) === true) return
      if (triggerRef.current?.contains(target) === true) return
      setOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  const definition = WIDGETS[id]
  const itemClass =
    'w-full rounded-md px-2 py-1.5 text-start text-[12.5px] text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:bg-transparent'

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={t('widget.menu', { title })}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        className="rounded-md px-1.5 py-1 text-[14px] leading-none text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span aria-hidden>⋮</span>
      </button>

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          className="absolute z-30 mt-1 w-52 rounded-lg border border-border bg-card p-2 shadow-card-hover"
          // The menu sits inside a draggable card; without this a pointer press
          // on a menu item would start a drag instead of pressing the item.
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            ref={firstItemRef}
            type="button"
            className={itemClass}
            disabled={!canMoveEarlier}
            onClick={() => {
              onMove(-1)
              closeAndRestoreFocus()
            }}
          >
            {t('widget.moveEarlier')}
          </button>
          <button
            type="button"
            className={itemClass}
            disabled={!canMoveLater}
            onClick={() => {
              onMove(1)
              closeAndRestoreFocus()
            }}
          >
            {t('widget.moveLater')}
          </button>

          <fieldset className="mt-2 border-0 p-0">
            <legend className="px-2 text-[11px] font-medium text-muted-foreground">
              {t('widget.width')}
            </legend>
            <div className="mt-1 flex gap-1">
              {WIDTHS.map((w) => (
                <button
                  key={w}
                  type="button"
                  aria-pressed={width === w}
                  // A width the widget cannot be read at is not offered.
                  disabled={w < definition.minSize.w}
                  onClick={() => onResize({ w })}
                  className={`flex-1 rounded-md border px-1 py-1 text-[11.5px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-40 ${
                    width === w
                      ? 'border-primary bg-accent font-medium text-accent-foreground'
                      : 'border-border text-foreground hover:bg-muted'
                  }`}
                >
                  {t(WIDTH_LABEL[w])}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="mt-2 border-0 p-0">
            <legend className="px-2 text-[11px] font-medium text-muted-foreground">
              {t('widget.height')}
            </legend>
            <div className="mt-1 flex gap-1">
              {HEIGHTS.map((h) => (
                <button
                  key={h}
                  type="button"
                  aria-pressed={height === h}
                  disabled={HEIGHT_ROWS[h] < HEIGHT_ROWS[definition.minSize.h]}
                  onClick={() => onResize({ h })}
                  className={`flex-1 rounded-md border px-1 py-1 text-[11.5px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-40 ${
                    height === h
                      ? 'border-primary bg-accent font-medium text-accent-foreground'
                      : 'border-border text-foreground hover:bg-muted'
                  }`}
                >
                  {t(HEIGHT_LABEL[h])}
                </button>
              ))}
            </div>
          </fieldset>

          <hr className="my-2 border-border" />

          <button
            type="button"
            className={`${itemClass} text-destructive`}
            onClick={() => {
              setOpen(false)
              onRemove()
            }}
          >
            {t('widget.remove')}
          </button>
        </div>
      )}
    </div>
  )
}
