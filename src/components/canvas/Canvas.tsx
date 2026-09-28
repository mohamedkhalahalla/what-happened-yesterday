/**
 * The widget canvas: a CSS grid whose order is a sortable list.
 *
 * ## Why dnd-kit and a CSS grid rather than react-grid-layout
 *
 * react-grid-layout positions every item with an absolute physical `left`
 * (its shipped CSS animates `left, top, width, height` and pins resize handles
 * with `right`/`border-right`), and it has no RTL mode — the open PR proposing
 * one has sat unmerged since 2018. An Arabic-first dashboard would have to
 * mirror every coordinate by hand. It also ships no keyboard path: the whole
 * package contains no `onKeyDown`, no `tabIndex` and no roles, and neither do
 * react-draggable or react-resizable, which own its drag and resize gestures.
 *
 * A CSS grid mirrors by itself under `dir="rtl"` because grid flow follows
 * writing direction, and dnd-kit ships a KeyboardSensor with real
 * announcements. Both problems disappear rather than being worked around.
 *
 * ## Why the grid is not dense
 *
 * `grid-auto-flow: dense` would backfill the gap a half-width widget leaves at
 * the end of a row — and would make the visual order differ from the DOM
 * order, so the sequence a screen reader reads and the sequence Tab follows
 * would both disagree with what everyone else sees. A trailing gap is the
 * cheaper problem.
 */

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type ScreenReaderInstructions,
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'

import { useI18n } from '../../i18n/useI18n'
import { GRID_ROW_HEIGHT_PX, type Layout } from '../../state/layout'
import { WIDGETS, type WidgetHeight, type WidgetId, type WidgetWidth } from '../../widgets/registry'
import type { WidgetProps } from '../../widgets/types'
import { SortableWidget } from './SortableWidget'

export type CanvasProps = {
  layout: Layout
  widgetProps: WidgetProps
  onMove: (id: WidgetId, delta: number) => void
  onReorder: (from: number, to: number) => void
  onResize: (id: WidgetId, size: { w?: WidgetWidth; h?: WidgetHeight }) => void
  onRemove: (id: WidgetId) => void
}

export function Canvas({
  layout,
  widgetProps,
  onMove,
  onReorder,
  onResize,
  onRemove,
}: CanvasProps) {
  const { t } = useI18n()

  const sensors = useSensors(
    // A few pixels of slop so a click on a header control is a click, not a
    // one-pixel drag that swallows it.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const ids = layout.items.map((item) => item.id)
  const titleOf = (id: string): string => {
    const definition = WIDGETS[id as WidgetId] as (typeof WIDGETS)[WidgetId] | undefined
    return definition === undefined ? String(id) : t(definition.titleKey)
  }
  const positionOf = (id: string): number => ids.indexOf(id as WidgetId) + 1

  /**
   * dnd-kit reads these out as the drag progresses. Translating them is not
   * optional: a keyboard user in Arabic would otherwise be the only person on
   * the page being spoken to in English.
   */
  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      t('dnd.onDragStart', {
        title: titleOf(String(active.id)),
        index: positionOf(String(active.id)),
        total: ids.length,
      }),
    onDragOver: ({ active, over }) =>
      over === null
        ? undefined
        : t('dnd.onDragOver', {
            title: titleOf(String(active.id)),
            index: positionOf(String(over.id)),
            total: ids.length,
          }),
    onDragEnd: ({ active, over }) =>
      over === null
        ? undefined
        : t('dnd.onDragEnd', {
            title: titleOf(String(active.id)),
            index: positionOf(String(over.id)),
            total: ids.length,
          }),
    onDragCancel: ({ active }) =>
      t('dnd.onDragCancel', {
        title: titleOf(String(active.id)),
        index: positionOf(String(active.id)),
        total: ids.length,
      }),
  }

  const screenReaderInstructions: ScreenReaderInstructions = {
    draggable: t('dnd.instructions'),
  }

  const onDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event
    if (over === null || active.id === over.id) return

    const from = ids.indexOf(active.id as WidgetId)
    const to = ids.indexOf(over.id as WidgetId)
    if (from === -1 || to === -1) return

    onReorder(from, to)
  }

  if (layout.items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-8 text-center text-[12.5px] text-muted-foreground">
        {t('canvas.empty')}
      </p>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{ announcements, screenReaderInstructions }}
    >
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div
          className="grid grid-cols-12 gap-4"
          style={{ gridAutoRows: `${GRID_ROW_HEIGHT_PX}px` }}
        >
          {layout.items.map((item, index) => (
            <SortableWidget
              key={item.id}
              item={item}
              index={index}
              total={layout.items.length}
              widgetProps={widgetProps}
              onMove={(delta) => onMove(item.id, delta)}
              onResize={(size) => onResize(item.id, size)}
              onRemove={() => onRemove(item.id)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
