/**
 * A small ⓘ in a column header, explaining that column's rule once.
 *
 * The alternative was a focusable tooltip on every cell, which is what this
 * replaces: fifty tab stops in the Intents table, all showing variations of
 * the same sentence. One stop per column says it once, at the place a reader
 * looks when they want to know what a column means.
 *
 * Reuses the shared Popover, so Escape, outside-press, focus return and
 * collision handling all behave the same as every other popover in the app.
 */

import { useState } from 'react'

import { useI18n } from '../i18n/useI18n'
import { Popover } from './Popover'

export type ColumnInfoProps = {
  /** Accessible name, e.g. "About the Change column". */
  label: string
  /** The explanation shown when it opens. */
  children: React.ReactNode
}

export function ColumnInfo({ label, children }: ColumnInfoProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      placement="bottom-end"
      panelClassName="w-64 p-3"
      // Nothing inside is interactive, so focus goes to the panel itself.
      initialFocus={-1}
      renderTrigger={({ ref, props }) => (
        <button
          ref={ref}
          type="button"
          aria-label={label}
          className="ms-1 rounded-full px-1 text-[11px] leading-none text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          {...props}
        >
          <span aria-hidden>ⓘ</span>
        </button>
      )}
    >
      <h4 className="text-[12px] font-semibold text-card-foreground">{t('glossary.whyFlagged')}</h4>
      <p className="mt-1 text-[11.5px] leading-[1.5] text-muted-foreground">{children}</p>
    </Popover>
  )
}
