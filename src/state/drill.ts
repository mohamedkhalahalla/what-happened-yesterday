/**
 * "Show me the calls behind this number."
 *
 * Every widget can ask for a drill-down, and none of them knows what happens
 * next. That is the whole point of the interface: the KPI card and the trend
 * chart describe *what was clicked* in the vocabulary of the data, and
 * whatever renders the result — a table, a drawer, a new route — is free to
 * change without touching a single widget.
 *
 * The implementation lands in a later step. Until then `openDrill` logs, which
 * keeps every call site exercised and honest rather than leaving dead
 * placeholders that have never run.
 */

import { createContext, useContext } from 'react'

import type { DayRange } from '../lib/time/riyadh'
import type { WidgetId } from '../widgets/registry'

/**
 * The narrowing a drill-down applies on top of the current filters.
 *
 * Deliberately the same shape as the engine's `DrillTarget` minus `period`,
 * because the range already says which days are meant — a widget should not
 * have to know whether the day it clicked was in the current or previous
 * period.
 */
export type DrillConstraints = {
  intent?: number
  agent?: number
  outcome?: number
  handoff?: number
  /** 0 = Sunday … 6 = Saturday. */
  weekday?: number
  /** Riyadh hour, 0..23. */
  hour?: number
  hasToolErrors?: boolean
  /** True for resolved calls only, false for unresolved ones. */
  resolved?: boolean
}

export type DrillRequest = {
  /** Inclusive Riyadh day range. A single day has `from === to`. */
  range: DayRange
  constraints: DrillConstraints
  /** Which widget asked, so the drill-down can say where it came from. */
  source: WidgetId
}

export type DrillContextValue = {
  openDrill: (request: DrillRequest) => void
}

/**
 * The default is a working no-op rather than a thrown error: a widget rendered
 * outside a provider (in a test, or a screenshot harness) should still render.
 */
const NOOP: DrillContextValue = {
  openDrill: (request) => {
    // Placeholder until the drill-down lands; keeps every call site exercised.
    console.debug('openDrill', request)
  },
}

export const DrillContext = createContext<DrillContextValue>(NOOP)

export function useDrill(): DrillContextValue {
  return useContext(DrillContext)
}
