/**
 * "What should we fix first?"
 *
 * A real `<table>`, because this is tabular data and anything else would be a
 * reimplementation with worse keyboard support. Sortable headers are buttons
 * carrying `aria-sort`, the header is sticky, and scrolling happens inside the
 * widget so the canvas keeps its shape.
 *
 * Ranked by unresolved calls by default — see `intentsData.ts` for why that
 * beats sorting by rate.
 */

import { useMemo, useState } from 'react'

import { ColumnInfo } from '../components/ColumnInfo'
import { DeltaValue } from '../components/DeltaValue'
import { intentLabel } from '../i18n/dictionary'
import { useI18n } from '../i18n/useI18n'
import { formatInt, formatPercent, formatPointsDelta } from '../lib/format'
import { useDrill } from '../state/drill'
import { Sparkline } from './Sparkline'
import {
  MIN_WEEK_CALLS,
  buildIntentRows,
  sortIntentRows,
  type IntentRow,
  type IntentSortKey,
  type SortDirection,
} from './intentsData'
import type { WidgetProps } from './types'

const COLUMNS: {
  key: IntentSortKey
  labelKey: Parameters<ReturnType<typeof useI18n>['t']>[0]
  numeric: boolean
  /**
   * True for the two columns whose values are judged against a noise floor.
   * Their header carries a single ⓘ explaining the rule, which is what
   * replaced a focusable tooltip on every one of their cells.
   */
  explainsFlagging?: boolean
}[] = [
  { key: 'intent', labelKey: 'intents.col.intent', numeric: false },
  { key: 'calls', labelKey: 'intents.col.calls', numeric: true },
  { key: 'resolution', labelKey: 'intents.col.resolution', numeric: true },
  { key: 'delta', labelKey: 'intents.col.delta', numeric: true, explainsFlagging: true },
  { key: 'unresolved', labelKey: 'intents.col.unresolved', numeric: true },
  { key: 'quarter', labelKey: 'intents.col.quarter', numeric: true, explainsFlagging: true },
]

export function IntentTableWidget({ data, filters, bounds, showDelta }: WidgetProps) {
  const { lang, t } = useI18n()
  const { openDrill } = useDrill()

  const [sortKey, setSortKey] = useState<IntentSortKey>('unresolved')
  const [direction, setDirection] = useState<SortDirection>('desc')

  const rows = useMemo(() => {
    if (data === null) return []
    return buildIntentRows(data, {
      weekStarts: data.weekStarts,
      firstDay: bounds.firstDay,
      lastDay: bounds.lastDay,
    }).filter((row) => row.calls > 0)
  }, [data, bounds.firstDay, bounds.lastDay])

  const sorted = useMemo(
    () => sortIntentRows(rows, sortKey, direction, (code) => intentLabel(lang, code)),
    [rows, sortKey, direction, lang],
  )

  /** Which weekly buckets overlap the selected range, for the sparkline band. */
  const selectedWeeks = useMemo(() => {
    if (data === null) return []
    return data.weekStarts
      .map((start, index) => ({ start, index }))
      .filter(({ start }) => start + 6 >= filters.range.from && start <= filters.range.to)
      .map(({ index }) => index)
  }, [data, filters.range])

  if (data === null)
    return <p className="text-[12.5px] text-muted-foreground">{t('chart.noData')}</p>
  if (sorted.length === 0)
    return <p className="text-[12.5px] text-muted-foreground">{t('intents.summaryEmpty')}</p>

  const toggleSort = (key: IntentSortKey): void => {
    if (key === sortKey) {
      setDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    // Numbers are most useful biggest-first; names alphabetically.
    setDirection(key === 'intent' ? 'asc' : 'desc')
  }

  const sparkAria = (row: IntentRow): string => {
    const known = row.weekly.filter((value): value is number => value !== undefined)
    const first = known[0]
    const last = known[known.length - 1]

    if (first === undefined || last === undefined || known.length < 2) {
      return t('intents.sparkAriaEmpty', { intent: intentLabel(lang, row.code) })
    }
    return t('intents.sparkAria', {
      intent: intentLabel(lang, row.code),
      first: formatPercent(lang, first, 0),
      last: formatPercent(lang, last, 0),
      weeks: formatInt(lang, row.weekly.length),
    })
  }

  const headerCell = (column: (typeof COLUMNS)[number]) => {
    const active = sortKey === column.key
    return (
      <th
        key={column.key}
        scope="col"
        aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
        className={`sticky top-0 z-10 border-b border-border bg-card px-2 py-1.5 font-medium ${
          column.numeric ? 'text-end' : 'text-start'
        }`}
      >
        <span className="inline-flex items-center">
          <button
            type="button"
            onClick={() => toggleSort(column.key)}
            aria-label={t('intents.sortBy', { column: t(column.labelKey) })}
            className="inline-flex items-center gap-1 rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span>{t(column.labelKey)}</span>
            <span aria-hidden className="text-[9px]">
              {active ? (direction === 'asc' ? '▲' : '▼') : '⇅'}
            </span>
          </button>

          {column.explainsFlagging === true && (
            <ColumnInfo label={t('intents.aboutColumn', { column: t(column.labelKey) })}>
              {t('glossary.whyFlagged.def')}
            </ColumnInfo>
          )}
        </span>
      </th>
    )
  }

  return (
    // `relative` so anything positioned inside is clipped by this scroller
    // rather than by the page. See SortableWidget's body for what that cost.
    <div className="relative h-full overflow-auto">
      <table className="w-full border-collapse text-[11.5px]">
        <caption className="sr-only-text">{t('intents.caption')}</caption>
        <thead>
          <tr>
            {COLUMNS.map(headerCell)}
            <th
              scope="col"
              className="sticky top-0 z-10 border-b border-border bg-card px-2 py-1.5 text-start font-medium text-muted-foreground"
            >
              {t('intents.col.sparkline')}
            </th>
          </tr>
        </thead>

        <tbody>
          {sorted.map((row) => {
            const trend = row.quarterTrend
            return (
              <tr key={row.code} className="border-b border-border/60">
                <td className="px-2 py-1 text-start">
                  <button
                    type="button"
                    onClick={() =>
                      openDrill({
                        range: filters.range,
                        constraints: { intent: row.code },
                        source: 'intentTable',
                      })
                    }
                    aria-label={t('intents.showCalls', { intent: intentLabel(lang, row.code) })}
                    className="rounded-md text-foreground underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {intentLabel(lang, row.code)}
                  </button>
                </td>

                <td className="px-2 py-1 text-end tabular-nums text-foreground">
                  {formatInt(lang, row.calls)}
                </td>

                <td
                  className={`px-2 py-1 text-end tabular-nums ${
                    row.fewCalls ? 'text-muted-foreground' : 'text-foreground'
                  }`}
                >
                  {row.resolutionRate === undefined ? '—' : formatPercent(lang, row.resolutionRate)}
                  {row.fewCalls && (
                    <span className="ms-1 text-[10px] text-muted-foreground">
                      ({t('intents.fewCalls')})
                    </span>
                  )}
                </td>

                <td className="px-2 py-1 text-end tabular-nums">
                  {showDelta ? (
                    <DeltaValue comparison={row.delta}>
                      {formatPointsDelta(lang, row.delta.delta)}
                    </DeltaValue>
                  ) : (
                    '—'
                  )}
                </td>

                {/*
                  Plain text, not a button. It was a second drill-down path per
                  row, which cost a tab stop on all 25 rows to reach a view the
                  intent name already opens — the drill panel has an
                  "Unresolved" chip, so the narrowing lives there instead.
                */}
                <td className="px-2 py-1 text-end font-medium tabular-nums text-foreground">
                  {formatInt(lang, row.unresolved)}
                </td>

                <td className="px-2 py-1 text-end tabular-nums">
                  {trend === null ? (
                    '—'
                  ) : (
                    <DeltaValue comparison={trend.comparison}>
                      <span aria-hidden className="text-[9px]">
                        {trend.delta < 0 ? '▼' : trend.delta > 0 ? '▲' : '—'}
                      </span>
                      <span>{formatPointsDelta(lang, trend.delta)}</span>
                      {/*
                        A badge only where there is something to do. Improvements
                        get the arrow and the number and nothing else: a badge on
                        every improving row is what buried the one declining row
                        in review.
                      */}
                      {trend.declining && (
                        <span className="ms-1 rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                          {t('intents.declining')}
                        </span>
                      )}
                    </DeltaValue>
                  )}
                </td>

                <td className="px-2 py-1 text-start">
                  <Sparkline
                    values={row.weekly}
                    selectedWeeks={selectedWeeks}
                    ariaLabel={sparkAria(row)}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <p className="px-2 py-1 text-[10.5px] text-muted-foreground">
        {t('trend.summaryNoisy', { threshold: MIN_WEEK_CALLS })}
      </p>
    </div>
  )
}
