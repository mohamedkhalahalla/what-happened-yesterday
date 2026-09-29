/**
 * Which synthetic quarter is on screen.
 *
 * The seed belongs in the URL for the same reason the date range does: a
 * colleague sent "look at this" has to see what the sender saw. With the seed
 * deciding where the anomalies hide, a link without it is a link to a
 * different quarter with different problems in it — which is worse than no
 * link, because it looks like it worked.
 *
 * It is deliberately a **demo control**, not a product feature. Nothing about
 * a real contact centre has a seed; this exists so the detectors can be shown
 * finding anomalies they were not built around, and the footer says so in
 * words rather than leaving a stray number for somebody to wonder about.
 */

import { SEED } from '../data/config'

/** The query-string parameter. */
export const SEED_PARAM = 'seed'

/** The largest seed the generator accepts: `mulberry32` takes 32 bits. */
const MAX_SEED = 0xffffffff

export type SeedParseResult = {
  seed: number
  /** True when the parameter was present but unusable. */
  invalid: boolean
}

/**
 * Read the seed from a query string.
 *
 * Strict on purpose. A seed is an exact integer identity, not a quantity, so
 * there is nothing sensible to round `1e9` or `12.5` or `0x2a` to — and a
 * silently coerced seed would show a quarter nobody asked for while the URL
 * claimed otherwise. Anything unreadable falls back to the default and says
 * so through the same notice a bad date uses.
 */
export function parseSeed(search: string): SeedParseResult {
  const raw = new URLSearchParams(search).get(SEED_PARAM)
  if (raw === null || raw.trim() === '') return { seed: SEED, invalid: false }

  // Digits only: `Number()` would accept '0x2a', ' 42 ', '1e3' and '4.0'.
  if (!/^\d+$/.test(raw)) return { seed: SEED, invalid: true }

  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value > MAX_SEED) return { seed: SEED, invalid: true }

  return { seed: value, invalid: false }
}

/** The parameter value for a seed, or `null` when it is the default. */
export function serializeSeed(seed: number): string | null {
  return seed >>> 0 === SEED >>> 0 ? null : String(seed >>> 0)
}

/** True when this is the quarter the app ships with. */
export function isDefaultSeed(seed: number): boolean {
  return seed >>> 0 === SEED >>> 0
}

/**
 * A new seed to look at.
 *
 * `crypto.getRandomValues` rather than `Math.random`: not for secrecy, but
 * because a shuffle that lands on the same handful of quarters is a shuffle
 * that stops demonstrating anything. Falls back where the API is missing,
 * because failing to shuffle is worse than shuffling predictably.
 */
export function randomSeed(): number {
  const crypto = globalThis.crypto
  if (crypto?.getRandomValues !== undefined) {
    const values = new Uint32Array(1)
    crypto.getRandomValues(values)
    return values[0]!
  }
  return Math.floor(Math.random() * (MAX_SEED + 1))
}

/**
 * Replace just the seed parameter, leaving everything else in the URL alone.
 *
 * Changing the quarter must not clear the filters or close a drill-down: the
 * reader asked to see other data through the view they had set up, not to
 * start again.
 */
export function searchWithSeed(search: string, seed: number): string {
  const params = new URLSearchParams(search)
  const value = serializeSeed(seed)

  if (value === null) params.delete(SEED_PARAM)
  else params.set(SEED_PARAM, value)

  const query = params.toString()
  return query === '' ? '' : `?${query}`
}
