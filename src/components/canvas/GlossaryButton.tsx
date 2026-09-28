/**
 * The ⓘ button: what the numbers in this widget actually mean.
 *
 * "Resolution rate" sounds self-explanatory and is not — resolved over *all*
 * calls, or over *answered* calls? A director making a staffing decision on
 * the wrong reading is precisely the failure a dashboard exists to prevent, so
 * the definition is one keystroke away from the number rather than in a wiki
 * nobody opens.
 */

import { useEffect, useId, useRef, useState } from 'react'

import { useI18n } from '../../i18n/useI18n'
import { termsFor, type GlossaryTermId } from '../../widgets/glossary'

export type GlossaryButtonProps = {
  title: string
  terms: readonly GlossaryTermId[]
}

export function GlossaryButton({ title, terms }: GlossaryButtonProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)

  const panelId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

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

  if (terms.length === 0) return null

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={t('widget.glossaryFor', { title })}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        className="rounded-full px-1.5 py-1 text-[12px] leading-none text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span aria-hidden>ⓘ</span>
      </button>

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          className="absolute z-30 mt-1 max-h-72 w-72 overflow-auto rounded-lg border border-border bg-card p-3 shadow-card-hover"
          onPointerDown={(event) => event.stopPropagation()}
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
        </div>
      )}
    </div>
  )
}
