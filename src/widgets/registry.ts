/**
 * Every widget the canvas can show, and what question it answers.
 *
 * `descriptionKey` is not decoration. Abdullah opens this dashboard with a
 * specific question in his head — "which agent is failing?" — and the catalog
 * has to let him find the widget by that question rather than by guessing what
 * "Agent comparison" contains. Each description names the question it answers.
 *
 * Sizes are expressed in the layout's own vocabulary (12-column widths, S/M/L
 * heights) so the registry is the single place that knows how big a widget
 * wants to be, and `minSize` is what stops the size menu from offering a width
 * at which the widget is unreadable.
 */

import type { ComponentType } from 'react'

import type { MessageKey } from '../i18n/messages.en'
import type { GlossaryTermId } from './glossary'
import { AgentComparisonWidget } from './AgentComparisonWidget'
import { DailyTrendWidget } from './DailyTrendWidget'
import { FailureReasonsWidget } from './FailureReasonsWidget'
import { IntentTableWidget } from './IntentTableWidget'
import { KpisWidget } from './KpisWidget'
import { PeakHoursWidget } from './PeakHoursWidget'
import type { WidgetProps } from './types'

export type WidgetId =
  'kpis' | 'dailyTrend' | 'intentTable' | 'agentComparison' | 'failureReasons' | 'peakHours'

/** Column span on the 12-column grid: a third, a half, two thirds, full. */
export type WidgetWidth = 4 | 6 | 8 | 12

/** Height in row-span steps. */
export type WidgetHeight = 'S' | 'M' | 'L'

export type WidgetSize = { w: WidgetWidth; h: WidgetHeight }

export type WidgetDefinition = {
  id: WidgetId
  titleKey: MessageKey
  /** What it shows, and which of Abdullah's questions it answers. */
  descriptionKey: MessageKey
  defaultSize: WidgetSize
  minSize: WidgetSize
  /** Metrics whose definitions the ⓘ button should offer. */
  glossary: readonly GlossaryTermId[]
  component: ComponentType<WidgetProps>
}

export const WIDGETS: Record<WidgetId, WidgetDefinition> = {
  kpis: {
    id: 'kpis',
    titleKey: 'widget.kpis.title',
    descriptionKey: 'widget.kpis.description',
    defaultSize: { w: 12, h: 'M' },
    minSize: { w: 6, h: 'S' },
    glossary: [
      'resolutionRate',
      'transferRate',
      'abandonmentRate',
      'resolved',
      'transferred',
      'abandoned',
      'previousPeriod',
      'points',
    ],
    component: KpisWidget,
  },
  dailyTrend: {
    id: 'dailyTrend',
    titleKey: 'widget.dailyTrend.title',
    descriptionKey: 'widget.dailyTrend.description',
    defaultSize: { w: 8, h: 'M' },
    minSize: { w: 6, h: 'S' },
    glossary: ['resolutionRate', 'resolved', 'previousPeriod'],
    component: DailyTrendWidget,
  },
  intentTable: {
    id: 'intentTable',
    titleKey: 'widget.intentTable.title',
    descriptionKey: 'widget.intentTable.description',
    defaultSize: { w: 12, h: 'L' },
    minSize: { w: 6, h: 'M' },
    glossary: [
      'unresolved',
      'resolutionRate',
      'resolved',
      'transferred',
      'points',
      'notable',
      'previousPeriod',
    ],
    component: IntentTableWidget,
  },
  agentComparison: {
    id: 'agentComparison',
    titleKey: 'widget.agentComparison.title',
    descriptionKey: 'widget.agentComparison.description',
    defaultSize: { w: 6, h: 'M' },
    minSize: { w: 4, h: 'S' },
    glossary: ['transferRate', 'transferred', 'median', 'notable', 'previousPeriod'],
    component: AgentComparisonWidget,
  },
  failureReasons: {
    id: 'failureReasons',
    titleKey: 'widget.failureReasons.title',
    descriptionKey: 'widget.failureReasons.description',
    defaultSize: { w: 6, h: 'M' },
    minSize: { w: 4, h: 'S' },
    glossary: ['per100', 'handoffReason', 'toolError', 'abandoned', 'notable', 'previousPeriod'],
    component: FailureReasonsWidget,
  },
  peakHours: {
    id: 'peakHours',
    titleKey: 'widget.peakHours.title',
    descriptionKey: 'widget.peakHours.description',
    defaultSize: { w: 6, h: 'M' },
    minSize: { w: 4, h: 'S' },
    glossary: ['resolved', 'transferred', 'abandoned'],
    component: PeakHoursWidget,
  },
}

/** Every widget id, in registry order. */
export const WIDGET_IDS = Object.keys(WIDGETS) as WidgetId[]

export function isWidgetId(value: unknown): value is WidgetId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(WIDGETS, value)
}

/**
 * The widgets on a fresh canvas.
 *
 * `peakHours` is deliberately absent: it answers a capacity-planning question
 * rather than a "what happened yesterday" one, so it lives in the catalog for
 * whoever wants it instead of taking space from everyone who does not.
 */
export const DEFAULT_WIDGET_IDS: readonly WidgetId[] = [
  'kpis',
  'dailyTrend',
  'intentTable',
  'agentComparison',
  'failureReasons',
]
