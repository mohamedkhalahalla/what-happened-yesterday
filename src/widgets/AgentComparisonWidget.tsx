/**
 * "Which agent is failing?"
 *
 * Bars in HTML rather than SVG, sized with `inline-size`, so they mirror under
 * RTL for free and the labels are real text a browser can find and a screen
 * reader can read without an accessibility layer bolted on.
 *
 * The comparison is against the **median of the agents shown**, drawn as a
 * marked line. "Is 47% bad?" is unanswerable in isolation; "2.6× the median"
 * answers it. Median rather than mean because one extreme agent is precisely
 * what is being looked for, and a mean would be dragged toward them and hide
 * the thing it was supposed to reveal.
 */

import { useMemo, useState } from 'react'

import { ChartFrame, type ChartTableColumn, type LegendItem } from '../charts/ChartFrame'
import { DeltaValue } from '../components/DeltaValue'
import { agentName } from '../i18n/dictionary'
import { useI18n } from '../i18n/useI18n'
import { formatDecimal, formatInt, formatPercent, formatPointsDelta } from '../lib/format'
import { useDrill } from '../state/drill'
import { OUTLIER_MULTIPLE, buildAgentRows, type AgentRow } from './agentsData'
import type { WidgetProps } from './types'

export function AgentComparisonWidget({ data, filters, showDelta }: WidgetProps) {
  const { lang, t } = useI18n()
  const { openDrill } = useDrill()
  const [view, setView] = useState<'chart' | 'table'>('chart')

  const view_ = useMemo(() => (data === null ? null : buildAgentRows(data)), [data])

  if (data === null) {
    return <p className="text-[12.5px] text-muted-foreground">{t('chart.noData')}</p>
  }
  if (view_ === null || view_.rows.length === 0) {
    return <p className="text-[12.5px] text-muted-foreground">{t('agents.summaryEmpty')}</p>
  }

  const { rows, median, worst } = view_
  /** Bars are scaled against the worst agent, so differences stay visible. */
  const scaleMax = Math.max(median * 2, worst?.transferRate ?? 0, 0.01)

  const summary = (): string => {
    const count = formatInt(lang, rows.length)
    const medianLabel = formatPercent(lang, median)

    if (worst === null || !worst.outlier) {
      return t('agents.summaryNoOutlier', { count, median: medianLabel })
    }
    return t('agents.summary', {
      count,
      median: medianLabel,
      outlier: agentName(lang, worst.code),
      rate: formatPercent(lang, worst.transferRate),
      ratio: formatDecimal(lang, worst.ratioToMedian),
    })
  }

  const drillToAgent = (row: AgentRow): void => {
    openDrill({
      range: filters.range,
      // The calls he handed over: the question the bar raises.
      constraints: { agent: row.code, outcome: 'transferred' },
      source: 'agentComparison',
    })
  }

  const legend: LegendItem[] = [
    { key: 'transfer', label: t('agents.col.transferRate'), swatchClass: 'bg-data-1' },
    {
      key: 'outlier',
      label: t('agents.aboveMedian', { ratio: formatDecimal(lang, OUTLIER_MULTIPLE) }),
      swatchClass: 'bg-data-6',
    },
    {
      key: 'median',
      label: t('agents.median', { rate: formatPercent(lang, median) }),
      swatchClass: 'bg-foreground',
      shape: 'line',
    },
  ]

  const columns: ChartTableColumn<AgentRow>[] = [
    { key: 'agent', header: t('agents.col.agent'), cell: (row) => agentName(lang, row.code) },
    {
      key: 'transfer',
      header: t('agents.col.transferRate'),
      numeric: true,
      cell: (row) => formatPercent(lang, row.transferRate),
    },
    {
      key: 'resolution',
      header: t('agents.col.resolution'),
      numeric: true,
      cell: (row) => formatPercent(lang, row.resolutionRate),
    },
    {
      key: 'calls',
      header: t('agents.col.calls'),
      numeric: true,
      cell: (row) => formatInt(lang, row.calls),
    },
    {
      key: 'delta',
      header: t('agents.col.delta'),
      numeric: true,
      cell: (row) =>
        showDelta ? (
          <DeltaValue comparison={row.delta}>{formatPointsDelta(lang, row.delta.delta)}</DeltaValue>
        ) : (
          '—'
        ),
    },
  ]

  return (
    <ChartFrame<AgentRow>
      title={t('agents.title')}
      summary={summary()}
      legend={legend}
      chartLabel={t('agents.title')}
      tableCaption={t('agents.caption')}
      tableColumns={columns}
      tableRows={rows}
      tableRowKey={(row) => String(row.code)}
      view={view}
      onViewChange={setView}
    >
      <ul className="space-y-1.5">
        {rows.map((row) => (
          <li key={row.code}>
            <button
              type="button"
              onClick={() => drillToAgent(row)}
              aria-label={t('agents.showCalls', { agent: agentName(lang, row.code) })}
              className="w-full rounded-md px-1 py-0.5 text-start hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <div className="flex items-baseline justify-between gap-2 text-[11.5px]">
                <span className="truncate text-foreground">{agentName(lang, row.code)}</span>
                <span className="flex shrink-0 items-baseline gap-1.5">
                  {row.outlier && (
                    <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                      {t('agents.aboveMedian', { ratio: formatDecimal(lang, row.ratioToMedian) })}
                    </span>
                  )}
                  <span className="tabular-nums text-foreground">
                    {formatPercent(lang, row.transferRate)}
                  </span>
                </span>
              </div>

              {/* The bar track, with the median drawn across it. */}
              <div className="relative mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${row.outlier ? 'bg-data-6' : 'bg-data-1'}`}
                  style={{ inlineSize: `${Math.min(100, (row.transferRate / scaleMax) * 100)}%` }}
                />
                <div
                  aria-hidden
                  className="absolute top-0 h-full w-px bg-foreground"
                  style={{ insetInlineStart: `${Math.min(100, (median / scaleMax) * 100)}%` }}
                />
              </div>

              <span className="sr-only-text">
                {t('agents.barAria', {
                  agent: agentName(lang, row.code),
                  rate: formatPercent(lang, row.transferRate),
                  calls: formatInt(lang, row.calls),
                })}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <p className="mt-2 text-[10.5px] text-muted-foreground">
        {t('agents.median', { rate: formatPercent(lang, median) })}
      </p>
    </ChartFrame>
  )
}
