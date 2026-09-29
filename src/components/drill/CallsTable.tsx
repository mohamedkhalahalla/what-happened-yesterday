/**
 * The calls themselves: up to 200,000 rows, about forty of them in the DOM.
 *
 * ## Why the rows are not focusable
 *
 * Two hundred thousand tab stops is not an accessible table, it is a trap.
 * Instead the **scroll container** is focusable and the browser's own
 * arrow-key and Page Up/Down scrolling does the work, which is what a sighted
 * keyboard user expects from a long list anyway and costs exactly one stop.
 * The header's sort buttons are the only other stops.
 *
 * ARIA carries the size the DOM cannot: `aria-rowcount` is the real total and
 * each row's `aria-rowindex` is its real position, so a screen reader reports
 * "row 8,431 of 200,001" rather than "row 12 of 40". That is the whole
 * contract for a virtualized table, and getting it wrong is worse than not
 * virtualizing at all.
 *
 * `role="table"` rather than `grid`: nothing here is editable or individually
 * focusable, and `grid` would promise cell navigation that does not exist.
 */

import { useEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

import { AGENTS, HANDOFF_REASONS, INTENTS, LANGUAGES, OUTCOMES } from '../../data/dictionaries'
import { getCall } from '../../data/getCall'
import type { Call, Dataset } from '../../data/types'
import type { SortDirection, SortKey } from '../../engine/sort'
import {
  agentName,
  handoffLabel,
  intentLabel,
  languageLabel,
  outcomeLabel,
} from '../../i18n/dictionary'
import type { MessageKey } from '../../i18n/messages.en'
import { useI18n } from '../../i18n/useI18n'
import {
  formatDurationSec,
  formatInstant,
  formatInt,
  formatSentimentPair,
  type UiLang,
} from '../../lib/format'

/** Fixed, so the virtualizer needs no measurement pass. */
const ROW_HEIGHT = 36

/** Rows rendered beyond the viewport, so a fast scroll does not show gaps. */
const OVERSCAN = 12

/**
 * A size to assume before the container has been measured.
 *
 * Without it the first paint renders nothing, and a headless render renders
 * nothing at all, which would make the virtualization untestable outside a
 * browser.
 */
const INITIAL_RECT = { width: 900, height: 600 }

/** Shown where a column has nothing to report for this call. */
const EM_DASH = '—'

/**
 * The table is never narrower than its columns' floors added together.
 *
 * `fit-content` rather than a number, so the floor is whatever the tracks
 * below actually ask for and a constant cannot drift away from them. Above it
 * every column gets its share of the space; below it — a phone, or the panel
 * at its narrowest — the columns keep their floors and the *table* scrolls
 * sideways. The page never does: a dashboard that slides under your thumb
 * because one panel is too wide is a broken dashboard, not a wide table.
 */
const TABLE_MIN_WIDTH = 'fit-content'

const AGENT_IDS: readonly string[] = AGENTS.map((agent) => agent.id)
const INTENT_IDS: readonly string[] = INTENTS.map((intent) => intent.id)

type Column = {
  key: string
  labelKey: MessageKey
  /** Sortable columns name the engine key they sort by. */
  sort?: SortKey
  numeric?: boolean
  /**
   * The column's grid track: `minmax(floor, share)`.
   *
   * Declared once and used by the header and every body row, because two
   * lists of widths drift the moment a column is added and a header that no
   * longer lines up with its cells is worse than no header.
   *
   * They used to be percentages, and they summed to 106% — so the last column
   * hung off the end of the panel in both languages. Percentages of a width
   * nobody had measured could only ever add up by accident; tracks cannot
   * overflow their container, and `fr` shares out whatever space is left
   * after every column has its floor.
   */
  track: string
  /** Renders the cell for one call. `muted` columns are context, not answer. */
  cell: (call: Call, lang: UiLang) => string
  muted?: boolean
}

const COLUMNS: Column[] = [
  {
    key: 'time',
    labelKey: 'calls.col.time',
    sort: 'time',
    track: 'minmax(6.5rem, 1.4fr)',
    muted: true,
    cell: (call, lang) => formatInstant(lang, Date.parse(call.startedAt) / 1000),
  },
  {
    key: 'agent',
    labelKey: 'calls.col.agent',
    sort: 'agent',
    track: 'minmax(4.5rem, 1fr)',
    cell: (call, lang) => agentName(lang, AGENT_IDS.indexOf(call.agentId)),
  },
  {
    key: 'intent',
    labelKey: 'calls.col.intent',
    sort: 'intent',
    track: 'minmax(7rem, 1.7fr)',
    cell: (call, lang) => intentLabel(lang, INTENT_IDS.indexOf(call.intent)),
  },
  {
    key: 'language',
    labelKey: 'calls.col.language',
    sort: 'language',
    track: 'minmax(3.75rem, 0.9fr)',
    muted: true,
    cell: (call, lang) => languageLabel(lang, LANGUAGES.indexOf(call.language)),
  },
  {
    // Text, never a coloured dot: the outcome is the point of the row.
    key: 'outcome',
    labelKey: 'calls.col.outcome',
    sort: 'outcome',
    track: 'minmax(5.25rem, 1.1fr)',
    cell: (call, lang) => outcomeLabel(lang, OUTCOMES.indexOf(call.outcome)),
  },
  {
    key: 'handoff',
    labelKey: 'calls.col.handoff',
    sort: 'handoff',
    track: 'minmax(6.5rem, 1.3fr)',
    muted: true,
    cell: (call, lang) =>
      call.handoffReason === undefined
        ? EM_DASH
        : handoffLabel(lang, HANDOFF_REASONS.indexOf(call.handoffReason)),
  },
  {
    key: 'duration',
    labelKey: 'calls.col.duration',
    sort: 'duration',
    numeric: true,
    track: 'minmax(5rem, 1fr)',
    cell: (call, lang) => formatDurationSec(lang, call.durationSec),
  },
  {
    key: 'sentiment',
    labelKey: 'calls.col.sentiment',
    sort: 'sentimentChange',
    numeric: true,
    track: 'minmax(6.5rem, 1.1fr)',
    muted: true,
    cell: (call, lang) => formatSentimentPair(lang, call.sentimentStart, call.sentimentEnd),
  },
  {
    key: 'toolErrors',
    labelKey: 'calls.col.toolErrors',
    sort: 'toolErrors',
    numeric: true,
    track: 'minmax(4.25rem, 0.8fr)',
    cell: (call, lang) => (call.toolErrors === 0 ? EM_DASH : formatInt(lang, call.toolErrors)),
  },
]

export type CallsTableProps = {
  ds: Dataset
  rows: Uint32Array
  sortKey: SortKey
  sortDirection: SortDirection
  onSort: (key: SortKey) => void
}

export function CallsTable({ ds, rows, sortKey, sortDirection, onSort }: CallsTableProps) {
  const { lang, t } = useI18n()
  const scrollRef = useRef<HTMLDivElement | null>(null)

  /*
   * The React Compiler lint rule flags `useVirtualizer` because it returns
   * functions that must not be memoized — their results change as the user
   * scrolls, without any prop or state this component can see changing.
   * That is fine here: nothing it returns leaves this component, so there is
   * no memoized consumer downstream to go stale. Silenced rather than left as
   * a standing warning, because a warning nobody acts on trains people to
   * ignore the next one.
   */
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
    initialRect: INITIAL_RECT,
  })

  /*
   * A new sort or a new chip is a new list, and leaving the viewport at row
   * 8,000 of a list the reader has not seen shows them an arbitrary middle.
   * Back to the top, which is where the answer to "what changed" is.
   */
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [rows, sortKey, sortDirection])

  const items = virtualizer.getVirtualItems()

  const headerCell = (column: Column) => {
    const active = column.sort !== undefined && column.sort === sortKey
    const label = t(column.labelKey)

    return (
      <div
        key={column.key}
        role="columnheader"
        aria-sort={active ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
        className={`min-w-0 px-2 py-1.5 text-[11px] font-medium ${
          column.numeric === true ? 'text-end' : 'text-start'
        }`}
      >
        {column.sort === undefined ? (
          <span className="text-muted-foreground">{label}</span>
        ) : (
          <button
            type="button"
            onClick={() => onSort(column.sort as SortKey)}
            aria-label={t('calls.sortBy', { column: label })}
            className="inline-flex items-center gap-1 rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span>{label}</span>
            <span aria-hidden className="text-[9px]">
              {active ? (sortDirection === 'asc' ? '▲' : '▼') : '⇅'}
            </span>
          </button>
        )}
      </div>
    )
  }

  /** One template, shared by the header and every row: the only alignment. */
  const template = COLUMNS.map((column) => column.track).join(' ')

  return (
    <div
      role="table"
      aria-rowcount={rows.length + 1}
      aria-label={t('calls.tableLabel')}
      className="flex h-full flex-col"
    >
      {rows.length === 0 ? (
        <>
          <div
            role="row"
            aria-rowindex={1}
            className="grid border-b border-border bg-card"
            style={{ gridTemplateColumns: template }}
          >
            {COLUMNS.map(headerCell)}
          </div>
          <p className="px-4 py-8 text-center text-[12.5px] text-muted-foreground">
            {t('calls.empty')}
          </p>
        </>
      ) : (
        /*
         * One scroll container for both axes, with the header inside it.
         * The header used to sit outside, which was invisible until the table
         * was narrow enough to scroll sideways — and then the header stayed
         * put while the rows moved under it.
         */
        <div
          ref={scrollRef}
          tabIndex={0}
          aria-label={t('calls.scrollLabel')}
          className="min-h-0 flex-1 overflow-auto focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
        >
          <div style={{ minInlineSize: TABLE_MIN_WIDTH }}>
            <div
              role="row"
              aria-rowindex={1}
              /*
               * Sticky, so the column names survive scrolling a hundred
               * thousand rows — the one thing that makes a long table
               * readable rather than merely long.
               */
              className="sticky top-0 z-10 grid border-b border-border bg-card"
              style={{ gridTemplateColumns: template }}
            >
              {COLUMNS.map(headerCell)}
            </div>

            <div style={{ blockSize: virtualizer.getTotalSize(), position: 'relative' }}>
              {items.map((item) => {
                const row = rows[item.index]
                if (row === undefined) return null
                // The spec's contract: one Call per visible row, and nothing
                // reaches around it into the raw columns.
                const call = getCall(ds, row)

                return (
                  <div
                    key={item.key}
                    role="row"
                    // Real position in the full list, not in the rendered window.
                    aria-rowindex={item.index + 2}
                    style={{
                      position: 'absolute',
                      insetInlineStart: 0,
                      insetBlockStart: 0,
                      inlineSize: '100%',
                      blockSize: ROW_HEIGHT,
                      transform: `translateY(${item.start}px)`,
                      gridTemplateColumns: template,
                    }}
                    className="grid items-center border-b border-border/60 text-[11.5px]"
                  >
                    {COLUMNS.map((column) => (
                      <div
                        key={column.key}
                        role="cell"
                        className={`min-w-0 truncate px-2 ${
                          column.numeric === true ? 'text-end tabular-nums' : 'text-start'
                        } ${column.muted === true ? 'text-muted-foreground' : 'text-foreground'}`}
                      >
                        {column.cell(call, lang)}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
