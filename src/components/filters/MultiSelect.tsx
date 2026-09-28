/**
 * A checkbox popover for one filter dimension.
 *
 * Built from a `<fieldset>` and real `<input type="checkbox">` elements rather
 * than a listbox of divs: checkboxes already announce their state, already
 * toggle with Space, and already work with the browser's own find-on-page.
 * Reimplementing that with ARIA roles is how a filter ends up unusable by
 * keyboard.
 *
 * `bottom-start` — these triggers sit in a left-to-right (or right-to-left)
 * row at the *start* of the filter bar, so the panel hangs from their leading
 * edge. Floating UI flips the alignment on its own for the last trigger in the
 * row, where opening outward would leave the viewport.
 */

import { useState } from 'react'

import { useI18n } from '../../i18n/useI18n'
import { formatInt } from '../../lib/format'
import { Popover } from '../Popover'

export type MultiSelectOption = {
  /** Engine code. */
  code: number
  label: string
}

export type MultiSelectProps = {
  /** Button text, e.g. "Agents". */
  label: string
  options: readonly MultiSelectOption[]
  selected: readonly number[]
  onChange: (codes: number[]) => void
  /** Show a filter box inside the panel. Worth it past ~10 options. */
  searchable?: boolean
  searchLabel?: string
}

export function MultiSelect({
  label,
  options,
  selected,
  onChange,
  searchable = false,
  searchLabel,
}: MultiSelectProps) {
  const { lang, t } = useI18n()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selectedSet = new Set(selected)
  const visible =
    searchable && query.trim() !== ''
      ? options.filter((option) => option.label.toLowerCase().includes(query.trim().toLowerCase()))
      : options

  const toggle = (code: number): void => {
    const next = selectedSet.has(code)
      ? selected.filter((c) => c !== code)
      : [...selected, code].sort((a, b) => a - b)
    onChange(next)
  }

  const summary =
    selected.length === 0
      ? t('filters.allOf', { dimension: label })
      : t('filters.nSelected', { count: formatInt(lang, selected.length) })

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      placement="bottom-start"
      panelClassName="w-64 p-3"
      renderTrigger={({ ref, props }) => (
        <button
          ref={ref}
          type="button"
          className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-[12.5px] text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          {...props}
        >
          <span className="font-medium">{label}</span>
          <span className="text-muted-foreground">{summary}</span>
        </button>
      )}
    >
      <fieldset className="border-0 p-0">
        <legend className="sr-only-text">{label}</legend>

        {searchable && (
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchLabel ?? ''}
            aria-label={searchLabel ?? label}
            className="mb-2 w-full rounded-md border border-border bg-background px-2 py-1.5 text-[12.5px] text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        )}

        <div className="mb-2 flex gap-2">
          <button
            type="button"
            onClick={() => onChange(options.map((option) => option.code))}
            className="rounded-md border border-border px-2 py-1 text-[11.5px] text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {t('filters.selectAll')}
          </button>
          <button
            type="button"
            onClick={() => onChange([])}
            className="rounded-md border border-border px-2 py-1 text-[11.5px] text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {t('filters.clear')}
          </button>
        </div>

        {visible.length === 0 ? (
          <p className="py-2 text-[12px] text-muted-foreground">{t('filters.noMatches')}</p>
        ) : (
          <ul className="space-y-1">
            {visible.map((option) => (
              <li key={option.code}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-[12.5px] text-foreground hover:bg-muted">
                  <input
                    type="checkbox"
                    checked={selectedSet.has(option.code)}
                    onChange={() => toggle(option.code)}
                    className="size-3.5 accent-primary"
                  />
                  <span>{option.label}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>
    </Popover>
  )
}
