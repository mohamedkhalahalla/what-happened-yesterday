/**
 * "Add widget": the widgets that are not on the canvas, listed by the question
 * each one answers.
 *
 * The description is the important half. Someone opens this because they want
 * to know which agent is failing, not because they want a thing called "Agent
 * comparison" — so the list is searchable by the question, and a title alone
 * would make them add widgets one at a time to find out what they contain.
 */

import { useEffect, useRef } from 'react'

import { useI18n } from '../../i18n/useI18n'
import { WIDGETS, WIDGET_IDS, type WidgetId } from '../../widgets/registry'

export type WidgetCatalogProps = {
  /** Widgets already on the canvas, which are therefore not offered. */
  present: readonly WidgetId[]
  onAdd: (id: WidgetId) => void
  onClose: () => void
}

export function WidgetCatalog({ present, onAdd, onClose }: WidgetCatalogProps) {
  const { t } = useI18n()
  const panelRef = useRef<HTMLDivElement>(null)
  const firstRef = useRef<HTMLButtonElement>(null)

  const available = WIDGET_IDS.filter((id) => !present.includes(id))

  useEffect(() => {
    firstRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      onClose()
    }
    const onPointerDown = (event: PointerEvent): void => {
      if (panelRef.current?.contains(event.target as Node) === true) return
      onClose()
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [onClose])

  return (
    <div
      ref={panelRef}
      className="absolute z-30 mt-1 max-h-96 w-80 overflow-auto rounded-lg border border-border bg-card p-3 shadow-card-hover"
    >
      <h3 className="text-[12.5px] font-semibold text-card-foreground">
        {t('canvas.catalogTitle')}
      </h3>

      {available.length === 0 ? (
        <p className="mt-2 text-[12px] text-muted-foreground">{t('canvas.catalogEmpty')}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {available.map((id, index) => (
            <li key={id}>
              <button
                ref={index === 0 ? firstRef : undefined}
                type="button"
                onClick={() => onAdd(id)}
                className="w-full rounded-md border border-border p-2.5 text-start hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <span className="block text-[12.5px] font-medium text-foreground">
                  {t(WIDGETS[id].titleKey)}
                </span>
                <span className="mt-0.5 block text-[11.5px] leading-[1.5] text-muted-foreground">
                  {t(WIDGETS[id].descriptionKey)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
