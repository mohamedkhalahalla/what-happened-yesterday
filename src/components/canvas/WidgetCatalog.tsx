/**
 * "Add widget": the widgets that are not on the canvas, listed by the question
 * each one answers.
 *
 * The description is the important half. Someone opens this because they want
 * to know which agent is failing, not because they want a thing called "Agent
 * comparison" — so a title alone would make them add widgets one at a time to
 * find out what they contain.
 *
 * The trigger lives here rather than in the toolbar so that the button and its
 * panel share one popover, which is what makes focus return and
 * outside-dismiss work without the toolbar coordinating them.
 */

import { useI18n } from '../../i18n/useI18n'
import { WIDGETS, WIDGET_IDS, type WidgetId } from '../../widgets/registry'
import { Popover } from '../Popover'

export type WidgetCatalogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Widgets already on the canvas, which are therefore not offered. */
  present: readonly WidgetId[]
  onAdd: (id: WidgetId) => void
}

export function WidgetCatalog({ open, onOpenChange, present, onAdd }: WidgetCatalogProps) {
  const { t } = useI18n()
  const available = WIDGET_IDS.filter((id) => !present.includes(id))

  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      // The toolbar sits at the inline end of its row, so the catalog opens
      // inward from the trigger's trailing edge.
      placement="bottom-end"
      panelClassName="w-80 p-3"
      initialFocus={available.length === 0 ? -1 : 0}
      renderTrigger={({ ref, props }) => (
        <button
          ref={ref}
          type="button"
          className="rounded-md border border-border bg-background px-2.5 py-1.5 text-[12.5px] font-medium text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          {...props}
        >
          {t('canvas.addWidget')}
        </button>
      )}
    >
      <h3 className="text-[12.5px] font-semibold text-card-foreground">
        {t('canvas.catalogTitle')}
      </h3>

      {available.length === 0 ? (
        <p className="mt-2 text-[12px] text-muted-foreground">{t('canvas.catalogEmpty')}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {available.map((id) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false)
                  onAdd(id)
                }}
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
    </Popover>
  )
}
