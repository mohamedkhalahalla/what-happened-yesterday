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

  'perf.readout': 'Computed in {worker} ms (worker) · {roundTrip} ms round-trip',
} as const

/** Every key the UI may ask for. Both message files must cover exactly these. */
export type MessageKey = keyof typeof en
