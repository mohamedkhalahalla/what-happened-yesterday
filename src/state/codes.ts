/**
 * The one place that maps between readable ids and engine codes.
 *
 * The engine stores `5`; a URL should say `agent_06`. A numeric code in a
 * shared link is unreadable, and worse, it silently means something different
 * the moment the dictionaries are reordered. Readable ids survive that —
 * `intentIndex('roaming')` finds roaming wherever it now sits.
 *
 * Every lookup returns `null` rather than `-1` for an unknown id, so callers
 * cannot accidentally use a sentinel as an array index.
 */

import { AGENTS, INTENTS, LANGUAGES } from '../data/dictionaries'

/** The dimensions a filter can constrain. */
export type Dimension = 'agents' | 'intents' | 'languages'

function codeOf(ids: readonly string[], id: string): number | null {
  const index = ids.indexOf(id)
  return index === -1 ? null : index
}

const AGENT_IDS: readonly string[] = AGENTS.map((agent) => agent.id)
const INTENT_IDS: readonly string[] = INTENTS.map((intent) => intent.id)
const LANGUAGE_IDS: readonly string[] = LANGUAGES

/** Readable ids for each dimension, in code order. */
export const IDS: Record<Dimension, readonly string[]> = {
  agents: AGENT_IDS,
  intents: INTENT_IDS,
  languages: LANGUAGE_IDS,
}

/** Engine code for a readable id, or `null` if the id is unknown. */
export function codeFor(dimension: Dimension, id: string): number | null {
  return codeOf(IDS[dimension], id)
}

/** Readable id for an engine code, or `null` if the code is out of range. */
export function idFor(dimension: Dimension, code: number): string | null {
  return IDS[dimension][code] ?? null
}

/** How many distinct codes a dimension has. Used for "all selected" checks. */
export function sizeOf(dimension: Dimension): number {
  return IDS[dimension].length
}
