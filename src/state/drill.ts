/**
 * "Show me the calls behind this number."
 *
 * A drill-down is a *view*, not a transient overlay, so it lives in the URL
 * like everything else: a colleague can be sent "the unresolved roaming calls
 * from last week" rather than a screenshot of them, and the browser Back
 * button closes the panel because closing it genuinely is going back.
 *
 * One parameter carries the whole thing —
 * `drill=intent:roaming,outcome:unresolved` — rather than six of them. The
 * drill is one object with one lifetime: it appears and disappears as a unit,
 * and six parameters that must be added and removed together are six chances
 * to leave one behind.
 *
 * Readable ids throughout, for the same reason the filters use them: a link
 * saying `intent:roaming` survives a reordering of the dictionaries, and a
 * link saying `intent:8` silently becomes a different intent.
 *
 * ## What the drill does *not* do
 *
 * It never widens. The dashboard's agent, intent and language filters still
 * apply inside the panel, and the drill narrows further on top of them. If the
 * two contradict — drilling into roaming while the intent filter excludes
 * roaming — the honest answer is an empty list, not a silently widened one. A
 * panel that ignored the filters to show something would be answering a
 * question nobody asked.
 */

import { createContext, useContext } from 'react'

import { AGENTS, HANDOFF_REASONS, INTENTS, OUTCOMES } from '../data/dictionaries'
import type { DrillTarget, Query } from '../engine/types'
import { dayIndexToISO, isoToDayIndex, type DayRange } from '../lib/time/riyadh'
import type { WidgetId } from '../widgets/registry'
import type { DataBounds } from './presets'
import type { FilterState } from './url'

/** The query-string parameter the whole drill lives in. */
export const DRILL_PARAM = 'drill'

/**
 * Outcome as the URL spells it.
 *
 * `unresolved` is not an engine outcome — it is "transferred or abandoned",
 * i.e. every call the agent did not finish. It earns a name here because it is
 * the question a director actually asks, and expressing it as two separate
 * drills would be worse.
 */
export const DRILL_OUTCOMES = ['resolved', 'transferred', 'abandoned', 'unresolved'] as const
export type DrillOutcome = (typeof DRILL_OUTCOMES)[number]

/** The narrowing a drill-down applies on top of the current filters. */
export type DrillConstraints = {
  intent?: number
  agent?: number
  outcome?: DrillOutcome
  handoff?: number
  hasToolErrors?: boolean
}

export type DrillRequest = {
  /** Inclusive Riyadh day range. A single day has `from === to`. */
  range: DayRange
  constraints: DrillConstraints
  /** Which widget asked, so the panel can say where it came from. */
  source: WidgetId
}

export type DrillContextValue = {
  /** Opens the panel and pushes a history entry, so Back closes it. */
  openDrill: (request: DrillRequest) => void
}

const NOOP: DrillContextValue = { openDrill: () => {} }

export const DrillContext = createContext<DrillContextValue>(NOOP)

export function useDrill(): DrillContextValue {
  return useContext(DrillContext)
}

// --- parsing and serializing -----------------------------------------------

/** Key order in the emitted value, so the same drill always spells the same. */
const KEY_ORDER = ['from', 'to', 'intent', 'agent', 'outcome', 'handoff', 'toolerrors'] as const

function indexOfId(ids: readonly string[], id: string): number | null {
  const index = ids.indexOf(id)
  return index === -1 ? null : index
}

const AGENT_IDS: readonly string[] = AGENTS.map((agent) => agent.id)
const INTENT_IDS: readonly string[] = INTENTS.map((intent) => intent.id)

function isDrillOutcome(value: string): value is DrillOutcome {
  return (DRILL_OUTCOMES as readonly string[]).includes(value)
}

export type DrillParseResult = {
  /** The request, or `null` when there is no drill or it could not be read. */
  request: DrillRequest | null
  /** True when a drill was present but unusable, so the UI can say so. */
  invalid: boolean
}

/**
 * Read a drill out of the `drill` parameter.
 *
 * Never throws. Anything unreadable yields `{ request: null, invalid: true }`
 * so the caller closes the panel and shows the same "some link filters were
 * invalid" notice the filters already use — one message for one class of
 * problem, rather than a second notice saying the same thing differently.
 *
 * `fallbackRange` is the dashboard's own range, used when the drill does not
 * name its own days.
 */
export function parseDrill(
  search: string,
  fallbackRange: DayRange,
  bounds: DataBounds,
): DrillParseResult {
  const raw = new URLSearchParams(search).get(DRILL_PARAM)
  if (raw === null || raw.trim() === '') return { request: null, invalid: false }

  const constraints: DrillConstraints = {}
  let from: number | null = null
  let to: number | null = null

  for (const piece of raw.split(',')) {
    const trimmed = piece.trim()
    if (trimmed === '') continue

    const separator = trimmed.indexOf(':')
    if (separator === -1) return { request: null, invalid: true }

    const key = trimmed.slice(0, separator)
    const value = trimmed.slice(separator + 1)
    if (value === '') return { request: null, invalid: true }

    switch (key) {
      case 'from':
      case 'to': {
        let day: number
        try {
          day = isoToDayIndex(value)
        } catch {
          return { request: null, invalid: true }
        }
        if (key === 'from') from = day
        else to = day
        break
      }
      case 'intent': {
        const code = indexOfId(INTENT_IDS, value)
        if (code === null) return { request: null, invalid: true }
        constraints.intent = code
        break
      }
      case 'agent': {
        const code = indexOfId(AGENT_IDS, value)
        if (code === null) return { request: null, invalid: true }
        constraints.agent = code
        break
      }
      case 'outcome': {
        if (!isDrillOutcome(value)) return { request: null, invalid: true }
        constraints.outcome = value
        break
      }
      case 'handoff': {
        const code = indexOfId(HANDOFF_REASONS, value)
        if (code === null) return { request: null, invalid: true }
        constraints.handoff = code
        break
      }
      case 'toolerrors': {
        if (value !== 'yes') return { request: null, invalid: true }
        constraints.hasToolErrors = true
        break
      }
      default:
        return { request: null, invalid: true }
    }
  }

  // A range is a pair or it is nothing: half of one would silently combine
  // with the dashboard's other end and show days nobody selected.
  if ((from === null) !== (to === null)) return { request: null, invalid: true }

  let range: DayRange = from !== null && to !== null ? { from, to } : fallbackRange
  if (range.from > range.to) range = { from: range.to, to: range.from }

  // Entirely outside the data is a link to nothing, not a link to the edge.
  if (range.to < bounds.firstDay || range.from > bounds.lastDay) {
    return { request: null, invalid: true }
  }
  range = {
    from: Math.max(range.from, bounds.firstDay),
    to: Math.min(range.to, bounds.lastDay),
  }

  return { request: { range, constraints, source: 'kpis' }, invalid: false }
}

/**
 * Write a drill into a `drill` value.
 *
 * `from`/`to` are emitted only when they differ from the dashboard range, so
 * the common case — drilling into what is already on screen — produces a short
 * link that keeps meaning the same thing when the dashboard range moves with
 * it.
 */
export function serializeDrill(request: DrillRequest, dashboardRange: DayRange): string {
  const parts = new Map<(typeof KEY_ORDER)[number], string>()

  if (request.range.from !== dashboardRange.from || request.range.to !== dashboardRange.to) {
    parts.set('from', dayIndexToISO(request.range.from))
    parts.set('to', dayIndexToISO(request.range.to))
  }

  const { intent, agent, outcome, handoff, hasToolErrors } = request.constraints
  const intentId = intent === undefined ? undefined : INTENT_IDS[intent]
  const agentId = agent === undefined ? undefined : AGENT_IDS[agent]
  const handoffId = handoff === undefined ? undefined : HANDOFF_REASONS[handoff]

  if (intentId !== undefined) parts.set('intent', intentId)
  if (agentId !== undefined) parts.set('agent', agentId)
  if (outcome !== undefined) parts.set('outcome', outcome)
  if (handoffId !== undefined) parts.set('handoff', handoffId)
  if (hasToolErrors === true) parts.set('toolerrors', 'yes')

  return KEY_ORDER.filter((key) => parts.has(key))
    .map((key) => `${key}:${parts.get(key)!}`)
    .join(',')
}

// --- mapping to the engine --------------------------------------------------

export type DrillQuery = {
  query: Query
  target: DrillTarget
}

/**
 * Turn a request plus the dashboard's filters into something the engine runs.
 *
 * Two decisions live here. `compare: null`, because a list of calls has no
 * previous period — the panel shows what happened, not how it changed. And the
 * dashboard's filters go in unmodified, so a drill can only ever narrow: if
 * the filters exclude the drilled intent the engine returns nothing, which is
 * the truthful answer rather than a helpfully widened one.
 */
export function drillQuery(request: DrillRequest, filters: FilterState): DrillQuery {
  const { intent, agent, outcome, handoff, hasToolErrors } = request.constraints

  const target: DrillTarget = { period: 'current' }
  if (intent !== undefined) target.intent = intent
  if (agent !== undefined) target.agent = agent
  if (handoff !== undefined) target.handoff = handoff
  if (hasToolErrors !== undefined) target.hasToolErrors = hasToolErrors

  if (outcome === 'unresolved') {
    // Not an outcome code: "everything the agent did not finish".
    target.resolved = false
  } else if (outcome !== undefined) {
    target.outcome = OUTCOMES.indexOf(outcome)
  }

  return {
    query: {
      range: request.range,
      compare: null,
      agents: filters.agents,
      intents: filters.intents,
      languages: filters.languages,
    },
    target,
  }
}

/** True when the dashboard filters exclude what the drill asks for. */
export function drillContradictsFilters(request: DrillRequest, filters: FilterState): boolean {
  const { intent, agent } = request.constraints

  if (intent !== undefined && filters.intents.length > 0 && !filters.intents.includes(intent)) {
    return true
  }
  if (agent !== undefined && filters.agents.length > 0 && !filters.agents.includes(agent)) {
    return true
  }
  return false
}

/** The same request with its outcome removed, for counting the chips. */
export function withoutOutcome(request: DrillRequest): DrillRequest {
  const constraints = { ...request.constraints }
  delete constraints.outcome
  return { ...request, constraints }
}
