/**
 * Public shape of a single AI-agent call, plus the columnar store the
 * dashboard actually reads.
 *
 * `Call` is the "row" view: convenient, but 200k of them would be 200k heap
 * objects. The generator therefore writes {@link Dataset}, a struct-of-arrays
 * store of typed arrays, and {@link getCall} rebuilds a `Call` on demand.
 */

/** Language the call was conducted in. */
export type Language = 'ar' | 'en' | 'mixed'

/** How the call ended. */
export type Outcome = 'resolved' | 'transferred' | 'abandoned'

/** Why the AI agent handed the call to a human. Only set on transfers. */
export type HandoffReason = 'customer_request' | 'low_confidence' | 'policy' | 'tool_error'

export type Call = {
  id: string
  startedAt: string // ISO 8601, UTC
  durationSec: number
  language: 'ar' | 'en' | 'mixed'
  agentId: string
  intent: string
  outcome: 'resolved' | 'transferred' | 'abandoned'
  handoffReason?: 'customer_request' | 'low_confidence' | 'policy' | 'tool_error'
  sentimentStart: number // -1 .. 1
  sentimentEnd: number // -1 .. 1
  toolErrors: number
}

/** Stored in the `handoff` column for calls that were not transferred. */
export const NO_HANDOFF = 255

/**
 * Columnar ("struct of arrays") store of the whole dataset.
 *
 * Every column has length {@link Dataset.n} and index `i` refers to the same
 * call in all of them. Rows are sorted by `startedAt` ascending, which is what
 * makes {@link Dataset.dayStartRow} a valid index for date-range slicing.
 */
export interface Dataset {
  n: number
  startedAt: Uint32Array // epoch seconds UTC
  dayIdx: Uint16Array // absolute Riyadh day index from riyadh.ts
  hour: Uint8Array // Riyadh hour 0..23
  durationSec: Uint16Array
  language: Uint8Array // index into LANGUAGES
  agent: Uint8Array // index into AGENTS
  intent: Uint8Array // index into INTENTS
  outcome: Uint8Array // index into OUTCOMES
  handoff: Uint8Array // index into HANDOFF_REASONS, 255 = none
  sentStart: Int8Array // sentiment x 100, -100..100
  sentEnd: Int8Array
  toolErrors: Uint8Array
  /** Length `days + 1`; rows of day `d` are `[dayStartRow[d], dayStartRow[d + 1])`. */
  dayStartRow: Uint32Array
  /** Absolute Riyadh day index of the first data day. */
  firstDay: number
  days: number
}
