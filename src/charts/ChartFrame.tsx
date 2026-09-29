/**
 * Everything around a chart that makes it readable without seeing it.
 *
 * Four things, and none of them is optional:
 *
 * - **A sentence.** Generated from the data, stating what the chart shows. It
 *   doubles as the accessible description, so the same words serve a reader
 *   skimming the page and one using a screen reader. A chart whose point can
 *   only be got by looking at it has no point for a large minority of readers.
 * - **A legend with text and shape**, never colour alone. Colour is how the
 *   series are told apart at a glance; the label is how they are told apart at
 *   all.
 * - **A table view** of the same numbers, as a real `<table>` with a caption
 *   and header cells. Not a fallback — a peer. It is how anyone copies a
 *   figure into an email, and how a screen reader reads values rather than
 *   being told a summary.
 * - **A keyboard cursor.** The container is focusable and its `aria-label`
 *   says which keys do what, because a control whose interaction is
 *   undiscoverable is not keyboard-accessible, it is merely keyboard-operable.
 *
 * The live region is the other half of that cursor: moving it announces the
 * day being inspected, so the chart is navigable point by point rather than
 * only summarised.
 */

import { useId, type ReactNode } from 'react'

import { useI18n } from '../i18n/useI18n'

export type LegendItem = {
  key: string
  label: string
  /** A Tailwind background class — the swatch fill. */
  swatchClass: string
  /** Drawn as a line rather than a block, for line series. */
  shape?: 'block' | 'line'
}

export type ChartTableColumn<Row> = {
  key: string
  header: string
  /** Right-aligned in LTR, left in RTL — i.e. numeric. */
  numeric?: boolean
  cell: (row: Row) => ReactNode
}

export type ChartFrameProps<Row> = {
  title: string
  /** One sentence, generated from the data. Also the accessible description. */
  summary: string
  /** Extra sentence shown under the summary, e.g. a noisy-data caveat. */
  caveat?: string
  legend: readonly LegendItem[]
  /** Announced when the keyboard cursor moves. */
  liveMessage?: string
  /** `aria-label` for the focusable chart container. */
  chartLabel: string
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void
  onFocus?: () => void
  onBlur?: () => void
  children: ReactNode
  tableCaption: string
  tableColumns: readonly ChartTableColumn<Row>[]
  tableRows: readonly Row[]
  tableRowKey: (row: Row) => string
  view: 'chart' | 'table'
  onViewChange: (view: 'chart' | 'table') => void
}

export function ChartFrame<Row>({
  title,
  summary,
  caveat,
  legend,
  liveMessage,
  chartLabel,
  onKeyDown,
  onFocus,
  onBlur,
  children,
  tableCaption,
  tableColumns,
  tableRows,
  tableRowKey,
  view,
  onViewChange,
}: ChartFrameProps<Row>) {
  const { t } = useI18n()
  const summaryId = useId()

  return (
    <figure className="m-0 flex h-full flex-col">
      <figcaption className="mb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="text-[12.5px] font-semibold text-card-foreground">{title}</h3>

          <div
            role="group"
            aria-label={t('chart.viewToggle')}
            className="flex shrink-0 overflow-hidden rounded-md border border-border"
          >
            {(['chart', 'table'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={view === option}
                onClick={() => onViewChange(option)}
                className={`px-2 py-0.5 text-[11.5px] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring ${
                  view === option
                    ? 'bg-accent font-medium text-accent-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {t(option === 'chart' ? 'chart.view.chart' : 'chart.view.table')}
              </button>
            ))}
          </div>
        </div>

        <p id={summaryId} className="mt-1 text-[11.5px] leading-[1.55] text-muted-foreground">
          {summary}
        </p>
        {caveat !== undefined && (
          <p className="mt-0.5 text-[11.5px] leading-[1.55] font-medium text-muted-foreground">
            {caveat}
          </p>
        )}
      </figcaption>

      {view === 'chart' ? (
        <>
          <div
            // Focusable so the cursor exists at all; the label says how to
            // drive it, since nothing on screen advertises arrow keys.
            tabIndex={0}
            role="application"
            aria-label={`${chartLabel} ${t('chart.keyboardHelp')}`}
            aria-describedby={summaryId}
            onKeyDown={onKeyDown}
            onFocus={onFocus}
            onBlur={onBlur}
            /*
              min-h-32 rather than min-h-0 is a floor the chart cannot be
              squeezed below. The registry stops a chart being *set* to a
              height it cannot draw at, but a widget can still end up short —
              a narrow viewport, a future size step — and a plot collapsed to
              zero pixels renders as a title with nothing under it. With a
              floor the widget body scrolls instead, which is visibly a
              too-small widget rather than a broken one.

              overflow-auto matters as much as the styling here. Without it
              the chart view establishes no scroll container, so a tall chart
              overflows the whole <figure> into the widget body and the title,
              the view toggle and the legend all scroll away with it — while
              the table view, which does scroll internally, keeps them pinned.
              The two views have to behave the same way or switching between
              them moves the furniture.
            */
            className="min-h-32 flex-1 overflow-auto rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {children}
          </div>

          {/* Polite, not assertive: the reader is driving, so this should
              follow their keystroke rather than interrupt anything. */}
          <div aria-live="polite" className="sr-only-text">
            {liveMessage}
          </div>
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse text-[11.5px]">
            <caption className="sr-only-text">{tableCaption}</caption>
            <thead>
              <tr>
                {tableColumns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    className={`sticky top-0 border-b border-border bg-card px-2 py-1 font-medium text-muted-foreground ${
                      column.numeric === true ? 'text-end' : 'text-start'
                    }`}
                  >
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row) => (
                <tr key={tableRowKey(row)} className="border-b border-border/60">
                  {tableColumns.map((column) => (
                    <td
                      key={column.key}
                      className={`px-2 py-1 text-foreground ${
                        column.numeric === true ? 'text-end tabular-nums' : 'text-start'
                      }`}
                    >
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1" aria-label={t('chart.legend')}>
        {legend.map((item) => (
          <li key={item.key} className="inline-flex items-center gap-1.5 text-[11px]">
            <span
              aria-hidden
              className={`inline-block shrink-0 rounded-[2px] ${item.swatchClass} ${
                item.shape === 'line' ? 'h-[3px] w-4' : 'h-2.5 w-2.5'
              }`}
            />
            <span className="text-muted-foreground">{item.label}</span>
          </li>
        ))}
      </ul>
    </figure>
  )
}
