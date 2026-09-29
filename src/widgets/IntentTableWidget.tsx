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

import { intentLabel } from '../i18n/dictionary'
import { useI18n } from '../i18n/useI18n'
import { formatInt, formatPercent, formatPointsDelta } from '../lib/format'
import type { Verdict } from '../lib/stats'
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
}[] = [
  { key: 'intent', labelKey: 'intents.col.intent', numeric: false },
  { key: 'calls', labelKey: 'intents.col.calls', numeric: true },
  { key: 'resolution', labelKey: 'intents.col.resolution', numeric: true },
  { key: 'delta', labelKey: 'intents.col.delta', numeric: true },
  { key: 'unresolved', labelKey: 'intents.col.unresolved', numeric: true },
  { key: 'quarter', labelKey: 'intents.col.quarter', numeric: true },
]

/** Only a notable verdict is worth ink; the rest stay quiet but still readable. */
function verdictClass(verdict: Verdict): string {
  return verdict === 'notable' ? 'text-foreground' : 'text-muted-foreground'
}

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
      </th>
    )
  }

  return (
    <div className="h-full overflow-auto">
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

                <td
                  className={`px-2 py-1 text-end tabular-nums ${verdictClass(row.delta.verdict)}`}
                >
                  {showDelta ? formatPointsDelta(lang, row.delta.delta) : '—'}
                </td>

                <td className="px-2 py-1 text-end tabular-nums">
                  <button
                    type="button"
                    onClick={() =>
                      openDrill({
                        range: filters.range,
                        // The calls the agent did not finish, for this intent.
                        constraints: { intent: row.code, resolved: false },
                        source: 'intentTable',
                      })
                    }
                    aria-label={t('intents.showUnresolved', {
                      intent: intentLabel(lang, row.code),
                    })}
                    className="rounded-md font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {formatInt(lang, row.unresolved)}
                  </button>
                </td>

                <td className="px-2 py-1 text-end tabular-nums">
                  {trend === null ? (
                    '—'
                  ) : (
                    <span className={verdictClass(trend.comparison.verdict)}>
                      <span aria-hidden className="text-[9px]">
                        {trend.delta < 0 ? '▼' : trend.delta > 0 ? '▲' : '—'}
                      </span>{' '}
                      {formatPointsDelta(lang, trend.delta)}
                      {/* A word, not just a colour or an arrow. */}
                      {trend.declining && (
                        <span className="ms-1 rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                          {t('intents.declining')}
                        </span>
                      )}
                      {trend.improving && (
                        <span className="ms-1 rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {t('intents.improving')}
                        </span>
                      )}
                    </span>
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
