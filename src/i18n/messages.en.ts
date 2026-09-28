/**
 * English UI strings, and the source of truth for the key set.
 *
 * `messages.ar.ts` is typed as `Record<MessageKey, string>`, so TypeScript
 * fails if Arabic is missing a key *or* has one English does not — no
 * translation-key linter needed, and no silent fallback to a raw key at
 * runtime.
 *
 * Domain vocabulary (intent labels, agent names, outcome and handoff names)
 * is deliberately **not** here. It lives in `src/data/dictionaries.ts` beside
 * the codes it names and is read through `src/i18n/dictionary.ts`; duplicating
 * 25 intent labels into two message files is how they drift apart.
 */

export const en = {
  'app.title': 'What happened yesterday?',
  'app.dataAsOf': 'Data as of {date}',

  'lang.toggle': 'العربية',
  'lang.toggleAria': 'Switch to Arabic',

  'user.switcher': 'Viewing as',
  'user.abdullah.name': 'Abdullah',
  'user.abdullah.role': 'Director of Customer Care',
  'user.vp.name': 'Layla',
  'user.vp.role': 'VP Customer Experience',

  'kpi.resolutionRate': 'Resolution rate',
  'kpi.transferRate': 'Transfer rate',
  'kpi.abandonmentRate': 'Abandonment rate',
  'kpi.calls': 'Calls',
  'kpi.vsPrevious': 'vs. previous period',

  'outcome.breakdown': 'Outcome breakdown',

  'state.loading': 'Loading…',
  'state.empty': 'No calls in this period',
  'state.error': 'Could not load this',
  'state.retry': 'Try again',

  'filters.preset.lastWeek': 'Last week',
  'filters.preset.last30Days': 'Last 30 days',
  'filters.preset.quarter': 'Whole quarter',
  'filters.preset.custom': 'Custom',
  'filters.presetsLegend': 'Date range',
  'filters.from': 'From',
  'filters.to': 'To',

  'filters.agents': 'Agents',
  'filters.intents': 'Intents',
  'filters.languages': 'Languages',
  'filters.allOf': 'All {dimension}',
  'filters.nSelected': '{count} selected',
  'filters.selectAll': 'Select all',
  'filters.clear': 'Clear',
  'filters.clearAll': 'Clear all',
  'filters.searchIntents': 'Search intents',
  'filters.noMatches': 'No matches',
  'filters.activeFilters': 'Active filters',
  'filters.remove': 'Remove {label}',

  'filters.compare': 'Compare with previous period',
  'filters.comparing': 'Comparing {current} with {previous}',
  'filters.comparisonOff': 'Showing {current} without a comparison',
  'filters.noComparison': 'No comparison data',
  'filters.noComparisonWhy': 'The period before {current} is outside this dataset.',
  'filters.partialComparison': 'Partial comparison',
  'filters.partialComparisonWhy': 'Only part of {previous} is in this dataset.',

  'filters.correctedNotice': 'Some link filters were invalid and were reset',
  'filters.dismiss': 'Dismiss',

  'state.updating': 'Updating…',

  'kpi.deltaIncreased': 'increased by {delta}',
  'kpi.deltaDecreased': 'decreased by {delta}',
  'kpi.deltaUnchanged': 'unchanged',

  'widget.comingSoon': 'This widget is being built.',
  'widget.kpis.title': 'Headline numbers',
  'widget.kpis.description':
    'Resolution, transfer and abandonment rates against the previous period. Answers: are we resolving more than last week?',
  'widget.dailyTrend.title': 'Daily trend',
  'widget.dailyTrend.description':
    'Volume and resolution rate day by day across the whole quarter. Answers: when did things go wrong?',
  'widget.intentTable.title': 'Intents',
  'widget.intentTable.description':
    'Every intent by volume and resolution rate, with its trend. Answers: what should we fix first?',
  'widget.agentComparison.title': 'Agents',
  'widget.agentComparison.description':
    'Transfer and resolution rates for each agent, side by side. Answers: which agent is failing?',
  'widget.failureReasons.title': 'Failure reasons',
  'widget.failureReasons.description':
    'Why calls were handed to a human, and how often tools failed. Answers: why are calls failing?',
  'widget.peakHours.title': 'Peak hours',
  'widget.peakHours.description':
    'Call volume by weekday and hour in Riyadh time. Answers: when are calls coming in?',
  'widget.move': 'Move {title}',
  'widget.menu': 'Options for {title}',
  'widget.glossary': 'What these numbers mean',
  'widget.glossaryFor': 'What these numbers mean: {title}',
  'widget.moveEarlier': 'Move earlier',
  'widget.moveLater': 'Move later',
  'widget.width': 'Width',
  'widget.width.4': 'One third',
  'widget.width.6': 'Half',
  'widget.width.8': 'Two thirds',
  'widget.width.12': 'Full width',
  'widget.height': 'Height',
  'widget.height.S': 'Short',
  'widget.height.M': 'Medium',
  'widget.height.L': 'Tall',
  'widget.remove': 'Remove',
  'widget.removed': 'Widget removed',
  'widget.undo': 'Undo',
  'widget.position': 'Widget {index} of {total}',
  'canvas.addWidget': 'Add widget',
  'canvas.catalogTitle': 'Add a widget',
  'canvas.catalogEmpty': 'Every widget is already on the canvas.',
  'canvas.add': 'Add',
  'canvas.close': 'Close',
  'canvas.resetLayout': 'Reset layout',
  'canvas.resetConfirm': 'Reset the layout to its default widgets and sizes?',
  'canvas.resetCancel': 'Cancel',
  'canvas.resetConfirmAction': 'Reset',
  'canvas.empty': 'No widgets on the canvas. Add one to get started.',
  'dnd.instructions':
    'Press Space or Enter to start moving the widget. Use the arrow keys to move it. Press Space or Enter again to drop it, or Escape to cancel.',
  'dnd.onDragStart': 'Picked up {title}. It is in position {index} of {total}.',
  'dnd.onDragOver': 'Moved {title} to position {index} of {total}.',
  'dnd.onDragEnd': 'Dropped {title} in position {index} of {total}.',
  'dnd.onDragCancel': 'Cancelled. {title} returned to position {index} of {total}.',
  'glossary.resolved': 'Resolved',
  'glossary.resolved.def': 'The AI agent finished the call without handing it to a person.',
  'glossary.transferred': 'Transferred',
  'glossary.transferred.def': 'The AI agent handed the call to a human agent.',
  'glossary.abandoned': 'Abandoned',
  'glossary.abandoned.def': 'The customer hung up before the call reached an outcome.',
  'glossary.resolutionRate': 'Resolution rate',
  'glossary.resolutionRate.def':
    'Resolved calls divided by all calls in the period, including abandoned ones.',
  'glossary.transferRate': 'Transfer rate',
  'glossary.transferRate.def': 'Transferred calls divided by all calls in the period.',
  'glossary.abandonmentRate': 'Abandonment rate',
  'glossary.abandonmentRate.def': 'Abandoned calls divided by all calls in the period.',
  'glossary.toolError': 'Tool error',
  'glossary.toolError.def':
    'A backend system the AI agent called returned an error during the call.',
  'glossary.handoffReason': 'Handoff reason',
  'glossary.handoffReason.def':
    'Why a call was transferred: the customer asked, the agent was unsure, policy required it, or a tool failed.',
  'glossary.previousPeriod': 'Previous period',
  'glossary.previousPeriod.def': 'The same number of days immediately before the selected range.',
  'glossary.points': 'Percentage points',
  'glossary.points.def':
    'The plain difference between two percentages. From 70% to 72% is +2 points, not +2%.',

  'kpi.verdict.notable': 'Notable change',
  'kpi.verdict.normal': 'Within normal variation',
  'kpi.verdict.insufficient': 'Too few calls to compare',
  'kpi.verdict.noComparison': 'No comparison data',
  'kpi.showCalls': 'Show the calls behind {label}',
  'chart.view.chart': 'Chart',
  'chart.view.table': 'Table',
  'chart.viewToggle': 'View as',
  'chart.keyboardHelp':
    'Use the arrow keys to move between days, Home and End for the first and last day, and Enter to open the calls for that day.',
  'chart.noData': 'No data for these filters.',
  'chart.legend': 'Legend',
  'trend.title': 'Daily trend',
  'trend.resolutionPanel': 'Resolution rate',
  'trend.toolErrorPanel': 'Tool-error rate',
  'trend.band.weekend': 'Weekend (Fri-Sat)',
  'trend.band.ramadan': 'Ramadan-style month',
  'trend.band.selected': 'Selected period',
  'trend.band.previous': 'Previous period',
  'trend.series.resolution': 'Resolution rate',
  'trend.series.toolError': 'Tool-error rate',
  'trend.point':
    '{date}, {weekday}: resolution {resolution}, tool-error rate {toolError}, {calls} calls',
  'trend.pointNoCalls': '{date}, {weekday}: no calls',
  'trend.summary':
    'Across the quarter resolution averaged {quarterAverage}; the selected period averaged {selectedAverage}. The lowest day was {lowDate} at {lowRate}, and tool errors peaked on {errorDate} at {errorRate}.',
  'trend.summaryNoSelection':
    'Across the quarter resolution averaged {quarterAverage}. The lowest day was {lowDate} at {lowRate}, and tool errors peaked on {errorDate} at {errorRate}.',
  'trend.summaryEmpty': 'No calls match these filters, so there is no trend to show.',
  'trend.summaryNoisy':
    'Some days have fewer than {threshold} calls at this filter level, so daily rates are noisy.',
  'trend.tableCaption': 'Resolution and tool-error rate by day',
  'trend.col.date': 'Date',
  'trend.col.weekday': 'Weekday',
  'trend.col.calls': 'Calls',
  'trend.col.resolution': 'Resolution rate',
  'trend.col.toolError': 'Tool-error rate',
  'trend.noCalls': 'No calls',

  'perf.readout': 'Computed in {worker} ms (worker) · {roundTrip} ms round-trip',
} as const

/** Every key the UI may ask for. Both message files must cover exactly these. */
export type MessageKey = keyof typeof en
