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
import { DeltaValue } from '../components/DeltaValue'
import { handoffLabel } from '../i18n/dictionary'
import { useI18n } from '../i18n/useI18n'
import { formatDecimal, formatPointsDelta } from '../lib/format'
import { comparisonRange } from '../state/presets'
import { useDrill } from '../state/drill'
import type { DrillConstraints } from '../state/drill'
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

  /*
   * Each bar opens *its own* period. The comparison bar is the only place in
   * the dashboard where a reader is looking at a number from a range they did
   * not select, and sending them to this period's calls would quietly answer
   * a different question from the one they clicked on.
   */
  const drillTo = (row: ReasonRow, period: 'current' | 'previous'): void => {
    const constraints: DrillConstraints =
      row.kind === 'abandoned' ? { outcome: 'abandoned' } : { handoff: row.code }

    openDrill({
      range: period === 'current' ? filters.range : comparisonRange(filters.range),
      constraints,
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
      cell: (row) =>
        showDelta ? (
          <DeltaValue comparison={row.delta}>{formatPointsDelta(lang, row.delta.delta)}</DeltaValue>
        ) : (
          '—'
        ),
    },
  ]

  /**
   * One labelled bar.
   *
   * The period label sits on the bar rather than only in the legend. The
   * legend lives at the foot of the figure and scrolls out of the widget body,
   * so a reader who had scrolled down was left matching two shades against a
   * key they could no longer see — while the table view kept its column
   * headers pinned. The label travelling with the bar removes the dependency
   * entirely.
   */
  const bar = (row: ReasonRow, period: 'current' | 'previous') => {
    const periodLabel = t(period === 'current' ? 'reasons.col.current' : 'reasons.col.previous')
    const value = period === 'current' ? row.currentPer100 : row.previousPer100

    return (
      <button
        type="button"
        onClick={() => drillTo(row, period)}
        aria-label={t('reasons.showCallsIn', { reason: label(row), period: periodLabel })}
        className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span className="w-28 shrink-0 truncate text-[10px] text-muted-foreground">
          {periodLabel}
        </span>
        <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <span
            className={`block h-full rounded-full ${
              period === 'current' ? 'bg-data-6' : 'bg-data-2'
            }`}
            style={{ inlineSize: `${Math.min(100, (value / scaleMax) * 100)}%` }}
          />
        </span>
        <span className="w-8 shrink-0 text-end text-[10px] tabular-nums text-muted-foreground">
          {formatDecimal(lang, value)}
        </span>
      </button>
    )
  }

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
            {/*
              Not one button around the whole row any more: the two bars go to
              different periods, and a control cannot have two destinations.
              The heading line is therefore text, and each bar is its own
              control — which is also what the bar's own label now promises.
            */}
            <div className="px-1 py-0.5">
              <div className="flex items-baseline justify-between gap-2 text-[11.5px]">
                <span className="truncate text-foreground">{label(row)}</span>
                <span className="flex shrink-0 items-baseline gap-2">
                  {showDelta && (
                    <span className="tabular-nums">
                      <DeltaValue comparison={row.delta}>
                        {formatPointsDelta(lang, row.delta.delta)}
                        {/*
                          A badge only when a reason got notably *worse*. A
                          failure reason falling is good news and needs no
                          call to action, so it gets the number alone.
                        */}
                        {row.delta.verdict === 'notable' && row.delta.delta > 0 && (
                          <span className="ms-1 rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                            {t('reasons.worse')}
                          </span>
                        )}
                      </DeltaValue>
                    </span>
                  )}
                </span>
              </div>

              <div className="mt-1 space-y-1">
                {bar(row, 'current')}
                {showDelta && bar(row, 'previous')}
              </div>

              <span className="sr-only-text">
                {t('reasons.barAria', {
                  reason: label(row),
                  current: formatDecimal(lang, row.currentPer100),
                  previous: formatDecimal(lang, row.previousPer100),
                })}
              </span>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-2 text-[10.5px] text-muted-foreground">{t('reasons.per100')}</p>
    </ChartFrame>
  )
}
