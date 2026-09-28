/**
 * The canvas-level controls: add a widget, reset the layout.
 *
 * Reset asks first. Unlike removing one widget — which the undo toast covers —
 * reset discards every size and position at once, and there is no single
 * action to put that back. An action that destroys more than it can undo is
 * the one that earns a confirmation.
 */

import { useEffect, useRef, useState } from 'react'

import { useI18n } from '../../i18n/useI18n'
import type { WidgetId } from '../../widgets/registry'
import { WidgetCatalog } from './WidgetCatalog'

export type CanvasToolbarProps = {
  present: readonly WidgetId[]
  onAdd: (id: WidgetId) => void
  onReset: () => void
}

export function CanvasToolbar({ present, onAdd, onReset }: CanvasToolbarProps) {
  const { t } = useI18n()
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [confirmingReset, setConfirmingReset] = useState(false)

  const addRef = useRef<HTMLButtonElement>(null)
  const resetRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (confirmingReset) confirmRef.current?.focus()
  }, [confirmingReset])

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <button
          ref={addRef}
          type="button"
          aria-expanded={catalogOpen}
          onClick={() => setCatalogOpen((open) => !open)}
          className="rounded-md border border-border bg-background px-2.5 py-1.5 text-[12.5px] font-medium text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {t('canvas.addWidget')}
        </button>

        {catalogOpen && (
          <WidgetCatalog
            present={present}
            onAdd={(id) => {
              setCatalogOpen(false)
              onAdd(id)
            }}
            onClose={() => {
              setCatalogOpen(false)
              addRef.current?.focus()
            }}
          />
        )}
      </div>

      {confirmingReset ? (
        <div
          role="group"
          aria-label={t('canvas.resetLayout')}
          className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted px-2.5 py-1.5"
        >
          <span className="text-[12.5px] text-foreground">{t('canvas.resetConfirm')}</span>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => {
              setConfirmingReset(false)
              onReset()
            }}
            className="rounded-md border border-border bg-background px-2 py-1 text-[12px] font-medium text-destructive hover:bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {t('canvas.resetConfirmAction')}
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirmingReset(false)
              resetRef.current?.focus()
            }}
            className="rounded-md px-2 py-1 text-[12px] text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {t('canvas.resetCancel')}
          </button>
        </div>
      ) : (
        <button
          ref={resetRef}
          type="button"
          onClick={() => setConfirmingReset(true)}
          className="rounded-md border border-border bg-background px-2.5 py-1.5 text-[12.5px] text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {t('canvas.resetLayout')}
        </button>
      )}
    </div>
  )
}
