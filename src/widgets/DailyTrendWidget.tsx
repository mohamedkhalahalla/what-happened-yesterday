/**
 * "When did things go wrong?"
 *
 * Always the whole quarter, never just the selected range. That is the point
 * of the widget: a slow decline is invisible inside a one-week window, and the
 * only way to see that roaming has been rotting since June is to draw all
 * ninety days at once with the selected week marked on them. The date filter
 * moves the highlight; it does not crop the chart.
 *
 * The callouts come from the same detectors the Fix-first widget reads, not
 * from a second calculation done locally. Two answers to "was Tuesday an
 * incident?" on one screen is a contradiction the reader has no way to settle,
 * and the local one would be the version nobody had tested.
 *
 * Two stacked panels sharing one time axis rather than a dual-axis chart. A
 * second y-axis lets the reader infer any correlation they like by rescaling
 * one series against the other — the crossing point is an artefact of the
 * scales, not the data. Stacked panels make the comparison honest: same x, two
 * separate y, no implied relationship that is not there.
 */

import { useMemo, useState } from 'react'
import { scaleLinear } from 'd3-scale'
import { line } from 'd3-shape'

import { TimeAxis, ValueAxis, thinTicks } from '../charts/Axis'
import { clampCalloutX } from '../charts/callout'
import { ChartFrame, type ChartTableColumn, type LegendItem } from '../charts/ChartFrame'
import { ResponsiveSvg } from '../charts/ResponsiveSvg'
import { moveCursor } from '../charts/cursor'
import { chartDirection } from '../charts/direction'
import { RAMADAN } from '../data/config'
import { useI18n } from '../i18n/useI18n'
import {
  formatDay,
  formatInt,
  formatPercent,
  formatPointsMagnitude,
  formatSignificant,
  formatWeekdayShort,
} from '../lib/format'
import { isoToDayIndex, weekday } from '../lib/time/riyadh'
import { detectInsights, incidentsOf } from '../insights/detect'
import { comparisonRange } from '../state/presets'
import { useDrill } from '../state/drill'
import {
  LOW_VOLUME_THRESHOLD,
  niceRateMax,
  prepareDaily,
  summarizeTrend,
  type DailyPoint,
} from './dailyTrendData'
import type { WidgetProps } from './types'

const PANEL_TITLE_HEIGHT = 13
/** Blank band between the panels, so two plots do not read as one. */
const PANEL_GAP = 10
const AXIS_HEIGHT = 16

/** Where an incident's label sits inside the resolution panel, from its top. */
const CALLOUT_LABEL_Y = 10

/** Everything in the chart that is not a plot: two titles, the gap, the axis. */
const CHART_CHROME = PANEL_TITLE_HEIGHT * 2 + PANEL_GAP + AXIS_HEIGHT

/**
 * The smallest each plot can be drawn at.
 *
 * Small, deliberately. The alternative to a cramped tool-error panel is no
 * tool-error panel, which is what this widget used to do at its default
 * height: draw a fixed 286-pixel chart into the 128 pixels it had and leave
 * the rest below the fold — the second panel, the time axis, and the
 * deploy-day spike the widget exists to show. A short panel still shows a
 * spike. A hidden one shows nothing.
 */
const MIN_RESOLUTION_PLOT = 44
const MIN_TOOL_ERROR_PLOT = 28

/**
 * Vertical room one axis label needs before it starts touching the next.
 *
 * The labels are 10px text; 26px apart is comfortable. Without this the tick
 * count was fixed, so a short panel drew five labels over 44 pixels and they
 * printed on top of each other — legible in the design, illegible at the size
 * the widget actually gets.
 */
const AXIS_LABEL_SPACING = 26

/** How many value ticks fit in a plot of this height, never fewer than two. */
export function tickCountFor(plotHeight: number): number {
  return Math.max(2, Math.min(5, Math.floor(plotHeight / AXIS_LABEL_SPACING)))
}

/** Below this there is no honest way to draw two panels and an axis. */
const MIN_CHART_HEIGHT = CHART_CHROME + MIN_RESOLUTION_PLOT + MIN_TOOL_ERROR_PLOT

/**
 * Share of the plot area the resolution panel takes.
 *
 * The larger share, because it carries the line everyone reads first against
 * a full 0–100% axis. The tool-error panel is bars against a small number and
 * stays readable when short.
 */
const RESOLUTION_SHARE = 0.6

export type PanelLayout = {
  resolutionTop: number
  resolutionHeight: number
  toolErrorTitleTop: number
  toolErrorTop: number
  toolErrorHeight: number
  axisTop: number
}

/**
 * Divide the height the widget actually has between the two panels.
 *
 * Exported because "both panels and the axis fit" is arithmetic, and proving
 * it by rendering would mean asserting against pixels in a browser for every
 * height the widget can be given.
 */
export function panelLayout(totalHeight: number): PanelLayout {
  const available = Math.max(totalHeight, MIN_CHART_HEIGHT) - CHART_CHROME

  // Floors first, then the share — a tight box spends what it has on the
  // minimums rather than giving one panel a share of nothing.
  const resolutionHeight = Math.max(
    MIN_RESOLUTION_PLOT,
    Math.min(available - MIN_TOOL_ERROR_PLOT, Math.round(available * RESOLUTION_SHARE)),
  )
  const toolErrorHeight = Math.max(MIN_TOOL_ERROR_PLOT, available - resolutionHeight)

  const resolutionTop = PANEL_TITLE_HEIGHT
  const toolErrorTitleTop = resolutionTop + resolutionHeight + PANEL_GAP
  const toolErrorTop = toolErrorTitleTop + PANEL_TITLE_HEIGHT

  return {
    resolutionTop,
    resolutionHeight,
    toolErrorTitleTop,
    toolErrorTop,
    toolErrorHeight,
    axisTop: toolErrorTop + toolErrorHeight,
  }
}

/** Room for the value-axis labels on the inline-start side. */
const GUTTER = 42

export function DailyTrendWidget({ data, filters, bounds }: WidgetProps) {
  const { lang, t } = useI18n()
  const { openDrill } = useDrill()

  const [view, setView] = useState<'chart' | 'table'>('chart')
  const [cursor, setCursor] = useState<number | null>(null)

  const direction = chartDirection(lang)

  const points = useMemo<DailyPoint[]>(
    () => (data === null ? [] : prepareDaily(data.daily, bounds.firstDay)),
    [data, bounds.firstDay],
  )

  const summary = useMemo(() => summarizeTrend(points, filters.range), [points, filters.range])

  /*
   * The same pass the Fix-first widget runs. Incidents are found over the
   * whole daily series regardless of the selected range, which is why a
   * callout can appear outside the highlighted band — the chart draws the
   * quarter, so it marks the quarter.
   */
  const incidents = useMemo(
    () => incidentsOf(detectInsights(data, { range: filters.range, bounds })),
    [data, filters.range, bounds],
  )

  /** The short note for each day an incident covers, keyed by day index. */
  const notes = useMemo(() => {
    const byDay = new Map<number, string>()

    for (const incident of incidents) {
      const note =
        incident.params.toolErrorRatio !== null
          ? t('trend.noteIncident', {
              ratio: formatSignificant(lang, incident.params.toolErrorRatio),
            })
          : t('trend.noteIncidentResolution', {
              points: formatPointsMagnitude(lang, incident.params.resolutionDrop ?? 0),
            })

      // Every day of a merged incident carries the note, so the table does
      // not show Tuesday as remarkable and Wednesday as ordinary.
      for (let day = incident.evidence.range.from; day <= incident.evidence.range.to; day++) {
        byDay.set(day, note)
      }
    }
    return byDay
  }, [incidents, lang, t])

  const toolErrorMax = useMemo(() => niceRateMax(points, (p) => p.toolErrorRate), [points])

  const ramadan = useMemo(
    () => ({ from: isoToDayIndex(RAMADAN.fromISO), to: isoToDayIndex(RAMADAN.toISO) }),
    [],
  )
  // The weekday-aligned comparison, not merely the days before.
  const previous = useMemo(() => comparisonRange(filters.range), [filters.range])

  /** Sundays, for the time axis. */
  const sundays = useMemo(
    () => points.filter((point) => weekday(point.dayIndex) === 0).map((point) => point.dayIndex),
    [points],
  )

  const activePoint = cursor === null ? null : (points[cursor] ?? null)

  const describePoint = (point: DailyPoint): string => {
    const date = formatDay(lang, point.dayIndex)
    const day = formatWeekdayShort(lang, weekday(point.dayIndex))

    if (point.calls === 0) return t('trend.pointNoCalls', { date, weekday: day })

    const sentence = t('trend.point', {
      date,
      weekday: day,
      resolution: formatPercent(lang, point.resolutionRate ?? 0),
      toolError: formatPercent(lang, point.toolErrorRate ?? 0),
      calls: formatInt(lang, point.calls),
    })

    // The marker is a visual cue; someone arriving by keyboard gets the same
    // fact in the same breath as the day's numbers, not instead of them.
    const note = notes.get(point.dayIndex)
    return note === undefined ? sentence : `${sentence} ${note}.`
  }

  /** "2 days flagged as incidents: 25 Aug, 3 Sep." Empty when there are none. */
  const incidentSentence = (): string => {
    if (incidents.length === 0) return ''

    const days = incidents
      .map((incident) => formatDay(lang, incident.day))
      .reverse() // oldest first, which is how a sentence reads
      .join(', ')

    const key = incidents.length === 1 ? 'trend.summaryIncidents' : 'trend.summaryIncidentsPlural'
    return t(key, { count: formatInt(lang, incidents.length), days })
  }

  const summarySentence = (): string => {
    if (summary.empty) return t('trend.summaryEmpty')

    const common = {
      quarterAverage: formatPercent(lang, summary.quarterAverage ?? 0),
      lowDate:
        summary.lowestResolution === null ? '' : formatDay(lang, summary.lowestResolution.dayIndex),
      lowRate: formatPercent(lang, summary.lowestResolution?.rate ?? 0),
      errorDate:
        summary.highestToolError === null ? '' : formatDay(lang, summary.highestToolError.dayIndex),
      errorRate: formatPercent(lang, summary.highestToolError?.rate ?? 0),
    }

    // No calls in the selected window: promising an average for it would be a
    // number invented out of nothing.
    const base =
      summary.selectedAverage === undefined
        ? t('trend.summaryNoSelection', common)
        : t('trend.summary', {
            ...common,
            selectedAverage: formatPercent(lang, summary.selectedAverage),
          })

    const incidentsLine = incidentSentence()
    return incidentsLine === '' ? base : `${base} ${incidentsLine}`
  }

  const drillToDay = (point: DailyPoint): void => {
    openDrill({
      range: { from: point.dayIndex, to: point.dayIndex },
      constraints: {},
      source: 'dailyTrend',
    })
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Enter' && activePoint !== null) {
      event.preventDefault()
      drillToDay(activePoint)
      return
    }

    const next = moveCursor(event.key, cursor ?? 0, points.length, direction.isRtl)
    if (next === null) return

    event.preventDefault()
    setCursor(next)
  }

  const legend: LegendItem[] = [
    {
      key: 'resolution',
      label: t('trend.series.resolution'),
      swatchClass: 'bg-data-5',
      shape: 'line',
    },
    { key: 'toolError', label: t('trend.series.toolError'), swatchClass: 'bg-data-6' },
    { key: 'selected', label: t('trend.band.selected'), swatchClass: 'bg-accent' },
    { key: 'previous', label: t('trend.band.previous'), swatchClass: 'bg-muted' },
    { key: 'ramadan', label: t('trend.band.ramadan'), swatchClass: 'bg-data-3/20' },
    { key: 'weekend', label: t('trend.band.weekend'), swatchClass: 'bg-foreground/[0.04]' },
  ]

  const columns: ChartTableColumn<DailyPoint>[] = [
    { key: 'date', header: t('trend.col.date'), cell: (row) => formatDay(lang, row.dayIndex) },
    {
      key: 'weekday',
      header: t('trend.col.weekday'),
      cell: (row) => formatWeekdayShort(lang, weekday(row.dayIndex)),
    },
    {
      key: 'calls',
      header: t('trend.col.calls'),
      numeric: true,
      cell: (row) => formatInt(lang, row.calls),
    },
    {
      key: 'resolution',
      header: t('trend.col.resolution'),
      numeric: true,
      cell: (row) =>
        row.resolutionRate === undefined
          ? t('trend.noCalls')
          : formatPercent(lang, row.resolutionRate),
    },
    {
      key: 'toolError',
      header: t('trend.col.toolError'),
      numeric: true,
      cell: (row) =>
        row.toolErrorRate === undefined
          ? t('trend.noCalls')
          : formatPercent(lang, row.toolErrorRate),
    },
    {
      // The table view is a peer of the chart, not a fallback, so anything
      // the chart marks has to be readable here too.
      key: 'note',
      header: t('trend.note'),
      cell: (row) => notes.get(row.dayIndex) ?? '—',
    },
  ]

  if (data === null || points.length === 0) {
    return <p className="text-[12.5px] text-muted-foreground">{t('chart.noData')}</p>
  }

  const firstDay = points[0]!.dayIndex
  const lastDay = points[points.length - 1]!.dayIndex

  return (
    <ChartFrame<DailyPoint>
      title={t('trend.title')}
      summary={summarySentence()}
      caveat={
        summary.noisy ? t('trend.summaryNoisy', { threshold: LOW_VOLUME_THRESHOLD }) : undefined
      }
      legend={legend}
      liveMessage={activePoint === null ? undefined : describePoint(activePoint)}
      chartLabel={t('trend.title')}
      onKeyDown={onKeyDown}
      onFocus={() => setCursor((current) => current ?? points.length - 1)}
      onBlur={() => setCursor(null)}
      tableCaption={t('trend.tableCaption')}
      tableColumns={columns}
      tableRows={points}
      tableRowKey={(row) => String(row.dayIndex)}
      view={view}
      onViewChange={setView}
    >
      <ResponsiveSvg height="fill" minHeight={MIN_CHART_HEIGHT}>
        {(width, totalHeight) => {
          /*
           * Recomputed per render rather than per resize: it is six additions
           * over a number the observer already measured, and keeping it here
           * means the panels cannot be drawn from a layout the SVG no longer
           * has.
           */
          const panels = panelLayout(totalHeight)
          const { resolutionTop, resolutionHeight, toolErrorTitleTop, toolErrorTop } = panels
          const { toolErrorHeight } = panels

          const innerWidth = Math.max(10, width - GUTTER)
          // The gutter sits on the inline-start side, which is the right in RTL.
          const originX = direction.isRtl ? 0 : GUTTER

          const x = scaleLinear().domain([firstDay, lastDay]).range(direction.timeRange(innerWidth))

          const resolutionY = scaleLinear()
            .domain([0, 1]) // rates always span the full axis
            .range([resolutionHeight - 8, 8])

          const toolErrorY = scaleLinear()
            .domain([0, toolErrorMax]) // zero-based, top adapts
            .range([toolErrorHeight - 6, 6])

          const dayWidth = innerWidth / Math.max(1, points.length - 1)

          /** A shaded band covering an inclusive day range. */
          const band = (from: number, to: number, className: string, height: number) => {
            const a = x(Math.max(from, firstDay))
            const b = x(Math.min(to, lastDay))
            const left = Math.min(a, b) - dayWidth / 2
            const bandWidth = Math.abs(b - a) + dayWidth
            if (to < firstDay || from > lastDay) return null
            return (
              // logical-css-ignore: SVG x is a coordinate, and the scale it
              // comes from is already mirrored by chartDirection.
              <rect x={left} y={0} width={bandWidth} height={height} className={className} />
            )
          }

          const resolutionPath = line<DailyPoint>()
            .defined((point) => point.resolutionRate !== undefined)
            .x((point) => x(point.dayIndex))
            .y((point) => resolutionY(point.resolutionRate ?? 0))(points)

          const weekends = points.filter((point) => weekday(point.dayIndex) >= 5)

          return (
            <>
              {/*
                Each panel is titled in the chart itself. Manual testing found
                two stacked plots with one shared legend ambiguous: nothing on
                screen said which was which.
              */}
              <text
                x={originX}
                y={PANEL_TITLE_HEIGHT - 4}
                textAnchor={direction.endAnchor}
                className="fill-card-foreground text-[10.5px] font-medium"
              >
                {t('trend.resolutionPanel')}
              </text>

              {/* Panel 1: resolution rate */}
              <g transform={`translate(${originX}, ${resolutionTop})`}>
                {weekends.map((point) => (
                  <rect
                    key={point.dayIndex}
                    // logical-css-ignore: mirrored scale, see band() above.
                    x={x(point.dayIndex) - dayWidth / 2}
                    y={0}
                    width={dayWidth}
                    height={resolutionHeight}
                    className="fill-foreground/[0.04]"
                  />
                ))}
                {band(ramadan.from, ramadan.to, 'fill-data-3/10', resolutionHeight)}
                {band(previous.from, previous.to, 'fill-muted', resolutionHeight)}
                {band(filters.range.from, filters.range.to, 'fill-accent', resolutionHeight)}

                <ValueAxis
                  scale={resolutionY}
                  direction={direction}
                  innerWidth={innerWidth}
                  lang={lang}
                  tickCount={tickCountFor(resolutionHeight)}
                  asPercent
                />

                {resolutionPath !== null && (
                  <path d={resolutionPath} className="fill-none stroke-data-5" strokeWidth={1.75} />
                )}

                {activePoint?.resolutionRate !== undefined && (
                  <circle
                    // logical-css-ignore: mirrored scale, see band() above.
                    cx={x(activePoint.dayIndex)}
                    cy={resolutionY(activePoint.resolutionRate)}
                    r={3.5}
                    className="fill-data-5 stroke-card"
                    strokeWidth={1.5}
                  />
                )}
              </g>

              {/* A hairline between the panels, reinforcing the blank gap. */}
              <line
                x1={originX}
                x2={originX + innerWidth}
                y1={resolutionTop + resolutionHeight + PANEL_GAP / 2}
                y2={resolutionTop + resolutionHeight + PANEL_GAP / 2}
                className="stroke-border"
                strokeWidth={1}
              />

              <text
                x={originX}
                y={toolErrorTitleTop + PANEL_TITLE_HEIGHT - 4}
                textAnchor={direction.endAnchor}
                className="fill-card-foreground text-[10.5px] font-medium"
              >
                {t('trend.toolErrorPanel')}
              </text>

              {/* Panel 2: tool-error rate */}
              <g transform={`translate(${originX}, ${toolErrorTop})`}>
                {band(filters.range.from, filters.range.to, 'fill-accent', toolErrorHeight)}

                <ValueAxis
                  scale={toolErrorY}
                  direction={direction}
                  innerWidth={innerWidth}
                  lang={lang}
                  tickCount={tickCountFor(toolErrorHeight)}
                  asPercent
                />

                {points.map((point) =>
                  point.toolErrorRate === undefined ? null : (
                    <rect
                      key={point.dayIndex}
                      // logical-css-ignore: mirrored scale, see band() above.
                      x={x(point.dayIndex) - dayWidth * 0.35}
                      y={toolErrorY(point.toolErrorRate)}
                      width={Math.max(1, dayWidth * 0.7)}
                      height={Math.max(0, toolErrorY(0) - toolErrorY(point.toolErrorRate))}
                      className={
                        point.dayIndex === activePoint?.dayIndex ? 'fill-data-8' : 'fill-data-6'
                      }
                    />
                  ),
                )}
              </g>

              {/* Shared time axis */}
              <g transform={`translate(${originX}, ${panels.axisTop + 2})`}>
                <TimeAxis
                  ticks={thinTicks(sundays, innerWidth)}
                  x={(dayIndex) => x(dayIndex)}
                  y={0}
                  lang={lang}
                />
              </g>

              {/*
                Incident callouts: a rule through both panels at every day an
                incident covers, and one label per incident at its worst day.
                Drawn after the series so the rule reads as an annotation over
                the data, and before the hit targets so the pointer still
                reaches them.
              */}
              {incidents.map((incident) => {
                const { range } = incident.evidence
                const days: number[] = []
                for (let day = range.from; day <= range.to; day++) days.push(day)

                const label = notes.get(incident.day) ?? ''
                // Clamped into the plot, in the plot's own (already mirrored)
                // coordinates — see `charts/callout.ts`.
                const labelX = clampCalloutX(x(incident.day), label, innerWidth)

                return (
                  <g key={incident.id} transform={`translate(${originX}, ${resolutionTop})`}>
                    {days.map((day) => (
                      <line
                        key={day}
                        x1={x(day)}
                        x2={x(day)}
                        y1={0}
                        y2={toolErrorTop + toolErrorHeight - resolutionTop}
                        className="stroke-data-6"
                        strokeWidth={1}
                        strokeDasharray="3 3"
                      />
                    ))}

                    <text
                      // A stable hook for the clamping test: "the text that
                      // happens to contain these words" matched a panel title
                      // in Arabic and passed for the wrong reason.
                      data-callout
                      x={labelX}
                      y={CALLOUT_LABEL_Y}
                      textAnchor="middle"
                      className="fill-card-foreground text-[9.5px] font-medium"
                    >
                      {label}
                    </text>
                  </g>
                )
              })}

              {/* Invisible hit targets: one per day, for hover and click. */}
              <g transform={`translate(${originX}, ${resolutionTop})`}>
                {points.map((point, index) => (
                  <rect
                    key={point.dayIndex}
                    // logical-css-ignore: mirrored scale, see band() above.
                    x={x(point.dayIndex) - dayWidth / 2}
                    y={0}
                    width={Math.max(1, dayWidth)}
                    height={toolErrorTop + toolErrorHeight - resolutionTop}
                    className="fill-transparent"
                    onMouseEnter={() => setCursor(index)}
                    onClick={() => drillToDay(point)}
                  />
                ))}
              </g>
            </>
          )
        }}
      </ResponsiveSvg>

      {activePoint !== null && (
        <p className="mt-1 text-[11.5px] text-foreground" data-numeric>
          {describePoint(activePoint)}
        </p>
      )}
    </ChartFrame>
  )
}
