/**
 * "What should I do about it?"
 *
 * The only widget that speaks first. Everything else on the canvas waits to be
 * read; this one names what is costing the most calls and puts the evidence
 * next to the claim.
 *
 * ## Evidence, not blame
 *
 * The headline states what the numbers show — "Majed transfers 2.7× the
 * median" — and never what to conclude from it. The dashboard cannot know
 * whether Majed is badly configured, handed the hardest intents, or correctly
 * escalating calls that need a human, and a line reading "Majed is
 * underperforming" would be an accusation dressed up as a measurement. Saying
 * the ratio, the rate, the median and the volume lets the reader draw the
 * conclusion the dashboard is not entitled to draw.
 *
 * Every item therefore carries three things: the headline, the numbers behind
 * it, and a button that opens those exact calls. The footer says out loud that
 * this was detected automatically and should be checked — because the reader
 * has no way to tell an automatic finding from a human one, and the difference
 * matters.
 *
 * ## Two lists, never one
 *
 * Ongoing problems are numbered, because they are ranked: the first one is
 * costing the most calls a week and is where a Monday should start. Incidents
 * are not numbered — they are dated. Ranking a Tuesday in August against a
 * standing agent problem would tell someone to go and fix the past.
 */

import { useMemo, useState } from 'react'

import { ColumnInfo } from '../components/ColumnInfo'
import { agentName, intentLabel } from '../i18n/dictionary'
import { useI18n } from '../i18n/useI18n'
import type { MessageKey } from '../i18n/messages.en'
import {
  formatDay,
  formatDayRange,
  formatInt,
  formatPercent,
  formatPointsMagnitude,
  formatSignificant,
  formatWeekdayShort,
  type UiLang,
} from '../lib/format'
import { MAX_INCIDENTS_SHOWN, MAX_ONGOING_SHOWN } from '../lib/thresholds'
import { weekday } from '../lib/time/riyadh'
import { detectInsights, type Insight } from '../insights/detect'
import { useDrill } from '../state/drill'
import type { WidgetProps } from './types'

type Translate = (key: MessageKey, params?: Record<string, string | number>) => string

/** The kind tag, in words. Never a coloured dot: the kind is not decoration. */
const TAG_KEY: Record<Insight['kind'], MessageKey> = {
  agent: 'fixFirst.tag.agent',
  intent: 'fixFirst.tag.intent',
  incident: 'fixFirst.tag.incident',
}

/** What the finding says, stated as evidence. */
function headlineOf(insight: Insight, lang: UiLang, t: Translate): string {
  switch (insight.kind) {
    case 'agent':
      return t('fixFirst.agent.headline', {
        agent: agentName(lang, insight.params.agent),
        ratio: formatSignificant(lang, insight.params.ratio),
      })

    case 'intent':
      return t('fixFirst.intent.headline', { intent: intentLabel(lang, insight.params.intent) })

    case 'incident': {
      const { range } = insight.evidence
      const multiDay = range.to > range.from
      const date = multiDay
        ? formatDayRange(lang, range.from, range.to)
        : formatDay(lang, insight.day)

      // Tool errors when they are what flagged; otherwise the collapse itself.
      if (insight.params.toolErrorRatio !== null) {
        const ratio = formatSignificant(lang, insight.params.toolErrorRatio)
        return multiDay
          ? t('fixFirst.incident.headlineRange', { range: date, ratio })
          : t('fixFirst.incident.headlineToolErrors', { date, ratio })
      }
      return t('fixFirst.incident.headlineResolution', {
        date,
        points: formatPointsMagnitude(lang, insight.params.resolutionDrop ?? 0),
      })
    }
  }
}

/** The numbers the headline is standing on. */
function evidenceOf(insight: Insight, lang: UiLang, t: Translate): string[] {
  switch (insight.kind) {
    case 'agent':
      return [
        t('fixFirst.agent.evidence', {
          rate: formatPercent(lang, insight.evidence.rate),
          median: formatPercent(lang, insight.evidence.median),
          calls: formatInt(lang, insight.evidence.calls),
        }),
      ]

    case 'intent':
      return [
        t('fixFirst.intent.evidence', {
          recentRate: formatPercent(lang, insight.evidence.recentRate),
          earlyRate: formatPercent(lang, insight.evidence.earlyRate),
        }),
      ]

    case 'incident': {
      const lines: string[] = []
      const { evidence } = insight
      // "A normal Tuesday" — the baseline is the same weekday, and saying so
      // is what stops the comparison looking arbitrary.
      const dayName = formatWeekdayShort(lang, weekday(insight.day))

      if (evidence.toolErrorRate !== null && evidence.toolErrorBaseline !== null) {
        lines.push(
          t('fixFirst.incident.evidenceToolErrors', {
            rate: formatPercent(lang, evidence.toolErrorRate),
            baseline: formatPercent(lang, evidence.toolErrorBaseline),
            weekday: dayName,
          }),
        )
      }
      if (evidence.resolutionRate !== null && evidence.resolutionBaseline !== null) {
        lines.push(
          t('fixFirst.incident.evidenceResolution', {
            rate: formatPercent(lang, evidence.resolutionRate),
            baseline: formatPercent(lang, evidence.resolutionBaseline),
            weekday: dayName,
          }),
        )
      }
      if (evidence.quietDaysSince !== null) {
        lines.push(t('fixFirst.incident.quiet', { days: formatInt(lang, evidence.quietDaysSince) }))
      }
      return lines
    }
  }
}

/** The cost, rounded to two figures because it is an estimate. */
function impactOf(insight: Insight, lang: UiLang, t: Translate): string {
  const count = formatSignificant(lang, insight.impact.extraFailedCalls)

  switch (insight.kind) {
    case 'agent':
      return t('fixFirst.agent.impact', { count })
    case 'intent':
      return t('fixFirst.intent.impact', { count })
    case 'incident':
      return insight.evidence.range.to > insight.evidence.range.from
        ? t('fixFirst.incident.impactRange', { count })
        : t('fixFirst.incident.impact', { count })
  }
}

function InsightItem({ insight }: { insight: Insight }) {
  const { lang, t } = useI18n()
  const { openDrill } = useDrill()

  const headline = headlineOf(insight, lang, t)

  return (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5 py-2">
      <div className="min-w-[14rem] flex-1">
        <p className="text-[12.5px] text-foreground">
          <span className="me-1.5 rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {t(TAG_KEY[insight.kind])}
          </span>
          <span className="font-medium">{headline}</span>
        </p>

        {evidenceOf(insight, lang, t).map((line) => (
          <p key={line} className="mt-0.5 text-[11.5px] text-muted-foreground" data-numeric>
            {line}
          </p>
        ))}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <span className="text-[11.5px] font-medium text-foreground" data-numeric>
          {impactOf(insight, lang, t)}
        </span>

        <button
          type="button"
          onClick={() => openDrill(insight.drill)}
          // The headline is in the name: "Show calls" alone, repeated eight
          // times down a list, tells a screen-reader user nothing about which
          // calls they are about to open.
          aria-label={t('fixFirst.showCallsFor', { headline })}
          className="rounded-md border border-border px-2 py-1 text-[11.5px] text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {t('fixFirst.showCalls')}
        </button>
      </div>
    </div>
  )
}

/** A heading, its list, and the "Show all" that appears only when it is needed. */
function Section({
  titleKey,
  insights,
  limit,
  numbered,
}: {
  titleKey: MessageKey
  insights: readonly Insight[]
  limit: number
  numbered: boolean
}) {
  const { lang, t } = useI18n()
  const [expanded, setExpanded] = useState(false)

  if (insights.length === 0) return null

  const shown = expanded ? insights : insights.slice(0, limit)
  const hasMore = insights.length > limit

  const items = shown.map((insight) => (
    <li key={insight.id} className="border-b border-border/60 last:border-b-0">
      <InsightItem insight={insight} />
    </li>
  ))

  return (
    <section className="mt-1">
      <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {t(titleKey)}
      </h3>

      {/*
        An ordered list where the order is a ranking, and an unordered one
        where it is not. The numbers are the claim on the ongoing list: this
        is what to do first.
      */}
      {numbered ? (
        <ol className="mt-0.5 list-inside list-decimal marker:text-[11px] marker:text-muted-foreground">
          {items}
        </ol>
      ) : (
        <ul className="mt-0.5">{items}</ul>
      )}

      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="mt-1 rounded-md text-[11.5px] font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {expanded
            ? t('fixFirst.showFewer')
            : t('fixFirst.showAll', { count: formatInt(lang, insights.length) })}
        </button>
      )}
    </section>
  )
}

export function FixFirstWidget({ data, filters, bounds }: WidgetProps) {
  const { t } = useI18n()

  const insights = useMemo(
    () => detectInsights(data, { range: filters.range, bounds }),
    [data, filters.range, bounds],
  )

  const ongoing = insights.filter((insight) => insight.group === 'ongoing')
  const incidents = insights.filter((insight) => insight.group === 'incident')

  if (data === null) {
    return <p className="text-[12.5px] text-muted-foreground">{t('chart.noData')}</p>
  }

  /*
   * Silence is a result, and a good one. A reader who filtered down to one
   * agent and one week should be told that nothing stands out there, not
   * shown an empty box that could equally mean the widget is broken.
   */
  if (insights.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-[12.5px] text-muted-foreground">{t('fixFirst.empty')}</p>
        <Footer />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <Section titleKey="fixFirst.ongoing" insights={ongoing} limit={MAX_ONGOING_SHOWN} numbered />
      <Section
        titleKey="fixFirst.incidents"
        insights={incidents}
        limit={MAX_INCIDENTS_SHOWN}
        numbered={false}
      />
      <Footer />
    </div>
  )
}

/** Says where these came from, and that they are not conclusions. */
function Footer() {
  const { t } = useI18n()

  return (
    <p className="flex items-start gap-1 text-[10.5px] text-muted-foreground">
      <span>{t('fixFirst.footer')}</span>
      <ColumnInfo label={t('widget.glossaryFor', { title: t('widget.fixFirst.title') })}>
        <span className="block">
          <strong className="text-card-foreground">{t('glossary.outlierAgent')}</strong>{' '}
          {t('glossary.outlierAgent.def')}
        </span>
        <span className="mt-2 block">
          <strong className="text-card-foreground">{t('glossary.decliningIntent')}</strong>{' '}
          {t('glossary.decliningIntent.def')}
        </span>
        <span className="mt-2 block">
          <strong className="text-card-foreground">{t('glossary.incidentDay')}</strong>{' '}
          {t('glossary.incidentDay.def')}
        </span>
        <span className="mt-2 block">
          <strong className="text-card-foreground">{t('glossary.impact')}</strong>{' '}
          {t('glossary.impact.def')}
        </span>
      </ColumnInfo>
    </p>
  )
}
