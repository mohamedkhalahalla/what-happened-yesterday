/**
 * Definitions for the metrics the widgets show.
 *
 * Every widget's ⓘ button opens the subset of these that it actually uses.
 * The reason this exists: "resolution rate" sounds self-explanatory and is
 * not — it could mean resolved over *all* calls or resolved over *answered*
 * calls, and a director making a staffing decision on the wrong one is the
 * failure mode a dashboard is supposed to prevent.
 *
 * The terms are message keys, so the definitions are translated like anything
 * else rather than living in two hardcoded strings.
 */

import type { MessageKey } from '../i18n/messages.en'

export type GlossaryTermId =
  | 'resolved'
  | 'transferred'
  | 'abandoned'
  | 'resolutionRate'
  | 'transferRate'
  | 'abandonmentRate'
  | 'toolError'
  | 'handoffReason'
  | 'previousPeriod'
  | 'points'
  | 'per100'
  | 'median'
  | 'unresolved'
  | 'notable'
  | 'whyFlagged'
  | 'outlierAgent'
  | 'decliningIntent'
  | 'incidentDay'
  | 'impact'

export type GlossaryTerm = {
  id: GlossaryTermId
  termKey: MessageKey
  definitionKey: MessageKey
}

export const GLOSSARY: Record<GlossaryTermId, GlossaryTerm> = {
  /*
   * The three detector definitions. These matter more than the metric ones:
   * a reader can disagree with "resolution rate" and still trust the number,
   * but a finding the dashboard volunteered is one they cannot check at all
   * unless they are told what rule produced it.
   */
  outlierAgent: {
    id: 'outlierAgent',
    termKey: 'glossary.outlierAgent',
    definitionKey: 'glossary.outlierAgent.def',
  },
  decliningIntent: {
    id: 'decliningIntent',
    termKey: 'glossary.decliningIntent',
    definitionKey: 'glossary.decliningIntent.def',
  },
  incidentDay: {
    id: 'incidentDay',
    termKey: 'glossary.incidentDay',
    definitionKey: 'glossary.incidentDay.def',
  },
  impact: {
    id: 'impact',
    termKey: 'glossary.impact',
    definitionKey: 'glossary.impact.def',
  },
  resolved: {
    id: 'resolved',
    termKey: 'glossary.resolved',
    definitionKey: 'glossary.resolved.def',
  },
  transferred: {
    id: 'transferred',
    termKey: 'glossary.transferred',
    definitionKey: 'glossary.transferred.def',
  },
  abandoned: {
    id: 'abandoned',
    termKey: 'glossary.abandoned',
    definitionKey: 'glossary.abandoned.def',
  },
  resolutionRate: {
    id: 'resolutionRate',
    termKey: 'glossary.resolutionRate',
    definitionKey: 'glossary.resolutionRate.def',
  },
  transferRate: {
    id: 'transferRate',
    termKey: 'glossary.transferRate',
    definitionKey: 'glossary.transferRate.def',
  },
  abandonmentRate: {
    id: 'abandonmentRate',
    termKey: 'glossary.abandonmentRate',
    definitionKey: 'glossary.abandonmentRate.def',
  },
  toolError: {
    id: 'toolError',
    termKey: 'glossary.toolError',
    definitionKey: 'glossary.toolError.def',
  },
  handoffReason: {
    id: 'handoffReason',
    termKey: 'glossary.handoffReason',
    definitionKey: 'glossary.handoffReason.def',
  },
  previousPeriod: {
    id: 'previousPeriod',
    termKey: 'glossary.previousPeriod',
    definitionKey: 'glossary.previousPeriod.def',
  },
  points: {
    id: 'points',
    termKey: 'glossary.points',
    definitionKey: 'glossary.points.def',
  },
  per100: {
    id: 'per100',
    termKey: 'glossary.per100',
    definitionKey: 'glossary.per100.def',
  },
  median: {
    id: 'median',
    termKey: 'glossary.median',
    definitionKey: 'glossary.median.def',
  },
  unresolved: {
    id: 'unresolved',
    termKey: 'glossary.unresolved',
    definitionKey: 'glossary.unresolved.def',
  },
  notable: {
    id: 'notable',
    termKey: 'glossary.notable',
    definitionKey: 'glossary.notable.def',
  },
  whyFlagged: {
    id: 'whyFlagged',
    termKey: 'glossary.whyFlagged',
    definitionKey: 'glossary.whyFlagged.def',
  },
}

/** The terms for one widget, in a stable order. */
export function termsFor(ids: readonly GlossaryTermId[]): GlossaryTerm[] {
  return ids.map((id) => GLOSSARY[id])
}
