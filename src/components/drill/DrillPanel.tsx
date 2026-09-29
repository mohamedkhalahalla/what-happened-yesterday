/**
 * The calls behind a number, as a side sheet.
 *
 * ## Why the dashboard stays mounted
 *
 * Unmounting it would throw away scroll position, open popovers, sort order
 * and every other piece of local state, so closing the panel would land the
 * reader somewhere subtly different from where they left. Instead the
 * dashboard keeps rendering behind the sheet and receives `inert`, which takes
 * it out of the tab order and hides it from assistive tech in one attribute.
 * `inert` is doing the job a focus trap would otherwise do by hand, and doing
 * it for pointer and screen-reader users at the same time.
 *
 * ## Closing
 *
 * Opening a drill pushes a history entry, so Back closes the panel — which is
 * what Back *means* here. The close button therefore calls `history.back()`
 * when the panel was opened in-app, so the entry is consumed rather than
 * stranded. On a direct load there is no entry to go back to, so it strips the
 * parameter instead; going "back" there would leave the app entirely.
 */

import { useEffect, useRef } from 'react'

import { useI18n } from '../../i18n/useI18n'
import { agentName, intentLabel, languageLabel, outcomeLabel } from '../../i18n/dictionary'
import { OUTCOMES } from '../../data/dictionaries'
import type { Dataset } from '../../data/types'
import type { SortDirection, SortKey } from '../../engine/sort'
import { formatDayRange, formatInt } from '../../lib/format'
import type { DrillRequest } from '../../state/drill'
import type { FilterState } from '../../state/url'
import { CallsTable } from './CallsTable'
import { OutcomeChips, type ChipValue, type OutcomeCounts } from './OutcomeChips'

export type DrillPanelProps = {
  ds: Dataset
  request: DrillRequest
  filters: FilterState
  rows: Uint32Array
  counts: OutcomeCounts
  loading: boolean
  /** True when the engine could not answer at all. */
  failed: boolean
  /** True when the dashboard filters exclude what the drill asks for. */
  contradicts: boolean
  sortKey: SortKey
  sortDirection: SortDirection
  onSort: (key: SortKey) => void
  onOutcome: (value: ChipValue) => void
  onClose: () => void
}

export function DrillPanel({
  ds,
  request,
  filters,
  rows,
  counts,
  loading,
  failed,
  contradicts,
  sortKey,
  sortDirection,
  onSort,
  onOutcome,
  onClose,
}: DrillPanelProps) {
  const { lang, t } = useI18n()
  const headingRef = useRef<HTMLHeadingElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  // Focus the heading, not the close button: the heading is what the panel
  // is, and a screen reader then reads the description before the controls.
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  /*
   * Escape closes, and Tab is contained. `inert` on the dashboard already
   * removes everything behind the sheet from the tab order, so this only has
   * to wrap focus at the panel's own two ends.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const panel = panelRef.current
      if (panel === null) return

      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (first === undefined || last === undefined) return

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  /** "Roaming · Unresolved · 17–26 Sept · 523 calls" */
  const description = (): string => {
    const parts: string[] = []
    const { intent, agent, outcome, handoff, hasToolErrors } = request.constraints

    if (intent !== undefined) parts.push(intentLabel(lang, intent))
    if (agent !== undefined) parts.push(agentName(lang, agent))
    if (outcome === 'unresolved') parts.push(t('drill.chip.unresolved'))
    else if (outcome !== undefined) parts.push(outcomeLabel(lang, OUTCOMES.indexOf(outcome)))
    if (handoff !== undefined) parts.push(t('calls.col.handoff'))
    if (hasToolErrors === true) parts.push(t('drill.toolErrorsOnly'))

    if (parts.length === 0) parts.push(t('drill.allCalls'))

    parts.push(formatDayRange(lang, request.range.from, request.range.to))
    parts.push(t('drill.count', { count: formatInt(lang, rows.length) }))

    return parts.join(' · ')
  }

  /**
   * The dashboard filters, spelled out.
   *
   * Not decoration: the panel shows a subset of a subset, and a reader who
   * has forgotten they filtered to one agent will read the count as the whole
   * truth. Saying it here is cheaper than them finding out later.
   */
  const activeFilters = (): string[] => {
    const lines: string[] = []
    const join = (codes: readonly number[], label: (code: number) => string): string =>
      codes.map(label).join(', ')

    if (filters.agents.length > 0) {
      lines.push(
        t('drill.filter.agents', { names: join(filters.agents, (c) => agentName(lang, c)) }),
      )
    }
    if (filters.intents.length > 0) {
      lines.push(
        t('drill.filter.intents', { names: join(filters.intents, (c) => intentLabel(lang, c)) }),
      )
    }
    if (filters.languages.length > 0) {
      lines.push(
        t('drill.filter.languages', {
          names: join(filters.languages, (c) => languageLabel(lang, c)),
        }),
      )
    }
    return lines
  }

  const filterLines = activeFilters()

  return (
    <>
      {/*
        A scrim, not a close affordance by itself — Escape and the button are
        the documented ways out, and both are reachable without a pointer.
      */}
      <div className="fixed inset-0 z-40 bg-foreground/20" aria-hidden onClick={onClose} />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drill-heading"
        /*
          Anchored to the inline end, so it enters from the right in English
          and the left in Arabic without a line of direction-specific code.
        */
        className="fixed inset-block-0 inset-inline-end-0 z-50 flex h-full w-full flex-col border-border bg-background shadow-card-hover md:w-[80%] md:border-s"
        style={{ insetBlockStart: 0, insetBlockEnd: 0, insetInlineEnd: 0 }}
      >
        <header className="shrink-0 border-b border-border px-5 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2
                ref={headingRef}
                id="drill-heading"
                // -1: focusable programmatically on open, but never a tab stop.
                tabIndex={-1}
                className="text-[15px] font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {description()}
              </h2>

              {filterLines.length > 0 && (
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                  {filterLines.join(' · ')}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-md border border-border px-2.5 py-1.5 text-[12.5px] text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {t('drill.back')}
            </button>
          </div>

          <div className="mt-3">
            <OutcomeChips
              counts={counts}
              active={request.constraints.outcome}
              onSelect={onOutcome}
            />
          </div>
        </header>

        <div className="min-h-0 flex-1">
          {contradicts ? (
            <p className="px-5 py-8 text-center text-[12.5px] text-muted-foreground">
              {t('drill.contradiction')}
            </p>
          ) : loading ? (
            <p className="px-5 py-8 text-center text-[12.5px] text-muted-foreground" role="status">
              {t('drill.loading')}
            </p>
          ) : failed ? (
            <p className="px-5 py-8 text-center text-[12.5px] text-foreground" role="alert">
              {t('drill.failed')}
            </p>
          ) : (
            <CallsTable
              ds={ds}
              rows={rows}
              sortKey={sortKey}
              sortDirection={sortDirection}
              onSort={onSort}
            />
          )}
        </div>
      </div>
    </>
  )
}
