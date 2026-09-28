/**
 * A checkbox popover for one filter dimension.
 *
 * Built from a `<fieldset>` and real `<input type="checkbox">` elements rather
 * than a listbox of divs: checkboxes already announce their state, already
 * toggle with Space, and already work with the browser's own find-on-page.
 * Reimplementing that with ARIA roles is how a filter ends up unusable by
 * keyboard.
 *
 * Focus management is the part worth reading: opening moves focus into the
 * panel, Escape closes it and returns focus to the trigger, and clicking
 * outside closes it without stealing focus. Nothing here traps focus — Tab
 * leaving the panel closes it, which is what a non-modal popover should do.
 */

import { useEffect, useId, useRef, useState } from 'react'

import { useI18n } from '../../i18n/useI18n'
import { formatInt } from '../../lib/format'

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

  const panelId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const firstFieldRef = useRef<HTMLInputElement>(null)

  /** Close and put focus back where the user left it. */
  const closeAndRestoreFocus = (): void => {
    setOpen(false)
    triggerRef.current?.focus()
  }

  // Move focus into the panel when it opens, so the keyboard path continues
  // where the eye already went.
  useEffect(() => {
    if (open) firstFieldRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        closeAndRestoreFocus()
      }
    }
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node
      if (panelRef.current?.contains(target) === true) return
      if (triggerRef.current?.contains(target) === true) return
      // Clicked elsewhere: close, but do not yank focus to the trigger — the
      // user is already on their way somewhere else.
      setOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

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
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-[12.5px] text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{summary}</span>
      </button>

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          className="absolute z-20 mt-1 max-h-80 w-64 overflow-auto rounded-lg border border-border bg-card p-3 shadow-card-hover"
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
                {visible.map((option, index) => (
                  <li key={option.code}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-[12.5px] text-foreground hover:bg-muted">
                      <input
                        ref={index === 0 ? firstFieldRef : undefined}
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
        </div>
      )}
    </div>
  )
}
