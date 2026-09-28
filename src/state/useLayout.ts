/**
 * The canvas layout as React state, persisted per profile.
 *
 * All the interesting logic lives in the pure reducer in `layout.ts`; this is
 * the thin shell that holds the current value, writes it to storage, and
 * swaps to the other profile's layout when the profile changes.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import type { WidgetHeight, WidgetId, WidgetWidth } from '../widgets/registry'
import {
  add,
  loadLayout,
  move,
  moveBy,
  remove,
  removedRecord,
  reset,
  resize,
  saveLayout,
  undoRemove,
  type Layout,
  type RemovedWidget,
} from './layout'

export type LayoutHandle = {
  layout: Layout
  moveWidget: (id: WidgetId, delta: number) => void
  reorder: (from: number, to: number) => void
  resizeWidget: (id: WidgetId, size: { w?: WidgetWidth; h?: WidgetHeight }) => void
  /** Removes the widget and returns what is needed to undo it. */
  removeWidget: (id: WidgetId) => RemovedWidget | null
  restoreWidget: (removed: RemovedWidget) => void
  addWidget: (id: WidgetId) => void
  resetLayout: () => void
}

export function useLayout(userId: string): LayoutHandle {
  const [layout, setLayout] = useState<Layout>(() => loadLayout(userId))

  // Which profile the current `layout` belongs to. Without this, switching
  // profile would save one person's canvas under the other's key on the next
  // edit.
  const loadedFor = useRef(userId)

  useEffect(() => {
    if (loadedFor.current === userId) return
    loadedFor.current = userId
    setLayout(loadLayout(userId))
  }, [userId])

  /** Apply a reducer and persist the result under the current profile. */
  const commit = useCallback(
    (next: Layout) => {
      setLayout(next)
      saveLayout(userId, next)
    },
    [userId],
  )

  const moveWidget = useCallback(
    (id: WidgetId, delta: number) => commit(moveBy(layout, id, delta)),
    [commit, layout],
  )

  const reorder = useCallback(
    (from: number, to: number) => commit(move(layout, from, to)),
    [commit, layout],
  )

  const resizeWidget = useCallback(
    (id: WidgetId, size: { w?: WidgetWidth; h?: WidgetHeight }) => commit(resize(layout, id, size)),
    [commit, layout],
  )

  const removeWidget = useCallback(
    (id: WidgetId): RemovedWidget | null => {
      // Captured before the removal, so Undo can restore the exact index and
      // size rather than appending a default-sized widget at the end.
      const record = removedRecord(layout, id)
      commit(remove(layout, id))
      return record
    },
    [commit, layout],
  )

  const restoreWidget = useCallback(
    (removed: RemovedWidget) => commit(undoRemove(layout, removed)),
    [commit, layout],
  )

  const addWidget = useCallback((id: WidgetId) => commit(add(layout, id)), [commit, layout])

  const resetLayout = useCallback(() => commit(reset()), [commit])

  return {
    layout,
    moveWidget,
    reorder,
    resizeWidget,
    removeWidget,
    restoreWidget,
    addWidget,
    resetLayout,
  }
}
