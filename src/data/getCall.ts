/**
 * Row view over the columnar dataset.
 *
 * The dashboard aggregates over the typed arrays directly; this is for the
 * places that genuinely need one whole call — a details drawer, a tooltip, a
 * CSV export — where materialising a single object is cheap.
 */

import { AGENTS, HANDOFF_REASONS, INTENTS, LANGUAGES, OUTCOMES } from './dictionaries'
import { NO_HANDOFF, type Call, type Dataset } from './types'

/** `'C-000042'` — stable, sortable, and the same for a given row and seed. */
function callId(index: number): string {
  return `C-${String(index).padStart(6, '0')}`
}

/**
 * Epoch seconds as an ISO 8601 UTC string.
 *
 * `toISOString` always formats in UTC regardless of the host time zone, so it
 * is safe here — unlike the local getters the ESLint guardrail bans.
 */
function toIsoUtc(epochSec: number): string {
  return new Date(epochSec * 1000).toISOString()
}

/**
 * Rebuild call `i` from the columns.
 *
 * @throws {RangeError} if `i` is not a valid row index.
 */
export function getCall(ds: Dataset, i: number): Call {
  if (!Number.isInteger(i) || i < 0 || i >= ds.n) {
    throw new RangeError(`Row index out of range: ${i} (dataset has ${ds.n} rows)`)
  }

  // Every code below was written by the generator from these same dictionaries,
  // so the lookups cannot miss.
  const language = LANGUAGES[ds.language[i]!]!
  const outcome = OUTCOMES[ds.outcome[i]!]!
  const handoffCode = ds.handoff[i]!

  const call: Call = {
    id: callId(i),
    startedAt: toIsoUtc(ds.startedAt[i]!),
    durationSec: ds.durationSec[i]!,
    language,
    agentId: AGENTS[ds.agent[i]!]!.id,
    intent: INTENTS[ds.intent[i]!]!.id,
    outcome,
    sentimentStart: ds.sentStart[i]! / 100,
    sentimentEnd: ds.sentEnd[i]! / 100,
    toolErrors: ds.toolErrors[i]!,
  }

  // Optional by design: a resolved or abandoned call was never handed over.
  if (handoffCode !== NO_HANDOFF) {
    call.handoffReason = HANDOFF_REASONS[handoffCode]!
  }

  return call
}
