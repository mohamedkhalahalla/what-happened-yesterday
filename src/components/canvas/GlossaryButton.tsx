/**
 * The ⓘ button: what the numbers in this widget actually mean.
 *
 * "Resolution rate" sounds self-explanatory and is not — resolved over *all*
 * calls, or over *answered* calls? A director making a staffing decision on
 * the wrong reading is precisely the failure a dashboard exists to prevent, so
 * the definition is one keystroke away from the number rather than in a wiki
 * nobody opens.
 *
 * `bottom-end` for the same reason as the ⋮ menu beside it: both sit at the
 * header's inline end, so both must open inward.
 */

import { useState } from 'react'

import { useI18n } from '../../i18n/useI18n'
import { termsFor, type GlossaryTermId } from '../../widgets/glossary'
import { Popover } from '../Popover'

export type GlossaryButtonProps = {
  title: string
  terms: readonly GlossaryTermId[]
}

export function GlossaryButton({ title, terms }: GlossaryButtonProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)

  if (terms.length === 0) return null

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      placement="bottom-end"
      panelClassName="w-72 p-3"
      // Definitions are not interactive, so focus goes to the panel itself
      // rather than hunting for a tabbable that does not exist.
      initialFocus={-1}
      renderTrigger={({ ref, props }) => (
        <button
          ref={ref}
          type="button"
          aria-label={t('widget.glossaryFor', { title })}
          className="rounded-full px-1.5 py-1 text-[12px] leading-none text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          {...props}
        >
          <span aria-hidden>ⓘ</span>
        </button>
      )}
    >
      <h3 className="text-[12px] font-semibold text-card-foreground">{t('widget.glossary')}</h3>
      <dl className="mt-2 space-y-2">
        {termsFor(terms).map((term) => (
          <div key={term.id}>
            <dt className="text-[12px] font-medium text-foreground">{t(term.termKey)}</dt>
            <dd className="text-[11.5px] leading-[1.5] text-muted-foreground">
              {t(term.definitionKey)}
            </dd>
          </div>
        ))}
      </dl>
    </Popover>
  )
}
