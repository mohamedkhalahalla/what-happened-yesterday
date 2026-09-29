/**
 * "Why are calls failing?"
 *
 * Everything is **per 100 calls**, never a raw count. Counts make two periods
 * incomparable the moment their volumes differ: 400 tool-error handoffs in a
 * busy week against 380 in a quiet one is a rise, not the fall the counts
 * suggest. Since the whole widget is a comparison, quoting counts would make
 * every number in it misleading. The ⓘ glossary says so, because "per 100
 * calls" is a phrase a reader can skim past without noticing it changed the
 * meaning.
 *
 * Two bars per reason, this period and the comparison, each labelled in text
 * rather than distinguished only by shade.
 */

import { useMemo, useState } from 'react'

import { ChartFrame, type ChartTableColumn, type LegendItem } from '../charts/ChartFrame'
import { handoffLabel } from '../i18n/dictionary'
import { useI18n } from '../i18n/useI18n'
import { formatDecimal, formatPointsDelta } from '../lib/format'
import { useDrill } from '../state/drill'
import { buildReasonRows, type ReasonRow } from './reasonsData'
import type { WidgetProps } from './types'

export function FailureReasonsWidget({ data, filters, showDelta, coverage }: WidgetProps) {
  const { lang, t } = useI18n()
  const { openDrill } = useDrill()
  const [view, setView] = useState<'chart' | 'table'>('chart')

  const reasons = useMemo(() => (data === null ? null : buildReasonRows(data)), [data])

  if (data === null) {
    return <p className="text-[12.5px] text-muted-foreground">{t('chart.noData')}</p>
  }
  if (reasons === null || reasons.currentCalls === 0) {
    return <p className="text-[12.5px] text-muted-foreground">{t('reasons.summaryEmpty')}</p>
  }

  const { rows, top, notable } = reasons
  const label = (row: ReasonRow): string =>
    row.kind === 'abandoned' ? t('reasons.abandoned') : handoffLabel(lang, row.code)

  /** Both periods share one scale, or the comparison bars would lie. */
  const scaleMax = Math.max(
    ...rows.map((row) => Math.max(row.currentPer100, row.previousPer100)),
    1,
  )

  const summary = (): string => {
    if (top === null) return t('reasons.summaryEmpty')

    const head = {
      top: label(top),
      rate: formatDecimal(lang, top.currentPer100),
    }
    if (coverage === 'none' || !showDelta) return t('reasons.summaryNoComparison', head)

    const biggest = notable[0]
    return t('reasons.summary', {
      ...head,
      notable:
        biggest === undefined
          ? t('reasons.summaryNoNotable')
          : t('reasons.summaryNotable', {
              reason: label(biggest),
              delta: formatPointsDelta(lang, biggest.delta.delta),
            }),
    })
  }

  const drillTo = (row: ReasonRow): void => {
    openDrill({
      range: filters.range,
      constraints: row.kind === 'abandoned' ? { outcome: 2 } : { handoff: row.code },
      source: 'failureReasons',
    })
  }

  const legend: LegendItem[] = [
    { key: 'current', label: t('reasons.col.current'), swatchClass: 'bg-data-6' },
    { key: 'previous', label: t('reasons.col.previous'), swatchClass: 'bg-data-2' },
  ]

  const columns: ChartTableColumn<ReasonRow>[] = [
    { key: 'reason', header: t('reasons.col.reason'), cell: label },
    {
      key: 'current',
      header: t('reasons.col.current'),
      numeric: true,
      cell: (row) => formatDecimal(lang, row.currentPer100),
    },
    {
      key: 'previous',
      header: t('reasons.col.previous'),
      numeric: true,
      cell: (row) => (showDelta ? formatDecimal(lang, row.previousPer100) : '—'),
    },
    {
      key: 'delta',
      header: t('reasons.col.delta'),
      numeric: true,
      cell: (row) => (showDelta ? formatPointsDelta(lang, row.delta.delta) : '—'),
    },
  ]

  const bar = (value: number, tone: string) => (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={`h-full rounded-full ${tone}`}
        style={{ inlineSize: `${Math.min(100, (value / scaleMax) * 100)}%` }}
      />
    </div>
  )

  return (
    <ChartFrame<ReasonRow>
      title={t('reasons.title')}
      summary={summary()}
      legend={legend}
      chartLabel={t('reasons.title')}
      tableCaption={t('reasons.caption')}
      tableColumns={columns}
      tableRows={rows}
      tableRowKey={(row) => row.key}
      view={view}
      onViewChange={setView}
    >
      <ul className="space-y-2.5">
        {rows.map((row) => (
          <li key={row.key}>
            <button
              type="button"
              onClick={() => drillTo(row)}
              aria-label={t('reasons.showCalls', { reason: label(row) })}
              className="w-full rounded-md px-1 py-0.5 text-start hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <div className="flex items-baseline justify-between gap-2 text-[11.5px]">
                <span className="truncate text-foreground">{label(row)}</span>
                <span className="flex shrink-0 items-baseline gap-2">
                  <span className="tabular-nums text-foreground">
                    {formatDecimal(lang, row.currentPer100)}
                  </span>
                  {showDelta && (
                    <span
                      className={`tabular-nums ${
                        row.delta.verdict === 'notable'
                          ? 'text-foreground'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {formatPointsDelta(lang, row.delta.delta)}
                    </span>
                  )}
                </span>
              </div>

              <div className="mt-1 space-y-1">
                {bar(row.currentPer100, 'bg-data-6')}
                {showDelta && bar(row.previousPer100, 'bg-data-2')}
              </div>

              <span className="sr-only-text">
                {t('reasons.barAria', {
                  reason: label(row),
                  current: formatDecimal(lang, row.currentPer100),
                  previous: formatDecimal(lang, row.previousPer100),
                })}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <p className="mt-2 text-[10.5px] text-muted-foreground">{t('reasons.per100')}</p>
    </ChartFrame>
  )
}
