/**
 * One widget on the canvas: the card, its header controls, and its grid cell.
 *
 * Dragging is bound to a **handle button**, not the whole card. A card full of
 * numbers, links and menus cannot also be a drag surface — every attempt to
 * select a figure would start a drag. The handle is a real `<button>` so it is
 * in the tab order and dnd-kit's KeyboardSensor can pick it up.
 *
 * Grid placement uses `grid-column: span N` and `grid-row: span N`. A CSS grid
 * mirrors on its own under `dir="rtl"`, so the first item is top-right in
 * Arabic and top-left in English with no code and no physical properties.
 */

import { useEffect, useRef } from 'react'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import { useI18n } from '../../i18n/useI18n'
import { HEIGHT_ROWS, type LayoutItem } from '../../state/layout'
import { WIDGETS, type WidgetHeight, type WidgetId, type WidgetWidth } from '../../widgets/registry'
import type { WidgetProps } from '../../widgets/types'
import { GlossaryButton } from './GlossaryButton'
import { WidgetMenu } from './WidgetMenu'

export type SortableWidgetProps = {
  item: LayoutItem
  index: number
  total: number
  widgetProps: WidgetProps
  onMove: (delta: number) => void
  onResize: (size: { w?: WidgetWidth; h?: WidgetHeight }) => void
  onRemove: () => void
  /** True for a widget that was just added, so focus follows it. */
  shouldFocus?: boolean
}

export function SortableWidget({
  item,
  index,
  total,
  widgetProps,
  onMove,
  onResize,
  onRemove,
  shouldFocus = false,
}: SortableWidgetProps) {
  const { t } = useI18n()
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })

  const definition = WIDGETS[item.id]
  const title = t(definition.titleKey)
  const Body = definition.component

  /*
   * Adding a widget from the catalog appends it below the fold, so moving
   * focus to it is what tells a keyboard or screen-reader user that anything
   * happened at all. tabIndex -1 makes the section focusable programmatically
   * without adding a stop to the tab order for everyone else.
   */
  const sectionRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (shouldFocus) sectionRef.current?.focus()
  }, [shouldFocus])

  return (
    <section
      ref={(node) => {
        setNodeRef(node)
        sectionRef.current = node
      }}
      tabIndex={-1}
      aria-label={title}
      style={{
        // dnd-kit's own transform, which is already direction-agnostic: it is
        // a translate in the element's own resolved coordinates.
        transform: CSS.Translate.toString(transform),
        transition,
        // Saved widths are a desktop concern; below md every widget is full
        // width, which the class list handles. The inline span takes over at
        // md via a CSS custom property the grid reads.
        ['--widget-span' as string]: String(item.w),
        gridRow: `span ${HEIGHT_ROWS[item.h]}`,
        zIndex: isDragging ? 10 : undefined,
      }}
      className={`col-span-12 flex flex-col rounded-lg border border-border bg-card shadow-card md:[grid-column:span_var(--widget-span)] ${
        isDragging ? 'opacity-60 shadow-card-hover' : ''
      }`}
    >
      <header className="flex items-start justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <button
            ref={setActivatorNodeRef}
            type="button"
            aria-label={t('widget.move', { title })}
            className="cursor-grab rounded-md px-1.5 py-1 text-[13px] leading-none text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            {...attributes}
            {...listeners}
          >
            <span aria-hidden>⠿</span>
          </button>

          <h2 className="truncate text-[13.5px] font-semibold text-card-foreground">{title}</h2>
          {/* Position is announced to assistive tech but not shown: the eye
              can see where the card is, a screen reader cannot. */}
          <span className="sr-only-text">{t('widget.position', { index: index + 1, total })}</span>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <GlossaryButton title={title} terms={definition.glossary} />
          <WidgetMenu
            id={item.id}
            title={title}
            width={item.w}
            height={item.h}
            canMoveEarlier={index > 0}
            canMoveLater={index < total - 1}
            onMove={onMove}
            onResize={onResize}
            onRemove={onRemove}
          />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <Body {...widgetProps} />
      </div>
    </section>
  )
}

/** Ids re-exported for the canvas to build its sortable context from. */
export type { WidgetId }
