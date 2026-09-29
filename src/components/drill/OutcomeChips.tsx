/**
 * All, Resolved, Transferred, Abandoned, Unresolved, each with its count.
 *
 * The counts are the point. A chip reading "Transferred" says nothing about
 * whether pressing it is worth the click; "Transferred 3,296" gives the shape
 * of the answer before the reader asks for it, and makes an empty chip
 * visibly empty rather than a dead end they have to discover by pressing it.
 *
 * They are counted on the main thread by walking the drill's own rows once
 * over `ds.outcome`. That is one pass over at most 200,000 bytes, cheaper than
 * four more round trips to the worker, and it keeps the chips and the table
 * guaranteed consistent because both come from the same array.
 */

import { OUTCOMES } from '../../data/dictionaries'
import type { Dataset } from '../../data/types'
import type { MessageKey } from '../../i18n/messages.en'
import { useI18n } from '../../i18n/useI18n'
import { formatInt } from '../../lib/format'
import { DRILL_OUTCOMES, type DrillOutcome } from '../../state/drill'

const RESOLVED = OUTCOMES.indexOf('resolved')
const TRANSFERRED = OUTCOMES.indexOf('transferred')
const ABANDONED = OUTCOMES.indexOf('abandoned')

/** `undefined` is the "All" chip. */
export type ChipValue = DrillOutcome | undefined

const CHIP_LABEL: Record<DrillOutcome, MessageKey> = {
  resolved: 'drill.chip.resolved',
  transferred: 'drill.chip.transferred',
  abandoned: 'drill.chip.abandoned',
  unresolved: 'drill.chip.unresolved',
}

export type OutcomeCounts = Record<DrillOutcome | 'all', number>

export const EMPTY_COUNTS: OutcomeCounts = {
  all: 0,
  resolved: 0,
  transferred: 0,
  abandoned: 0,
  unresolved: 0,
}

/**
 * Tally the base rows by outcome.
 *
 * `baseRows` must be the drill *without* its outcome constraint, or every chip
 * except the active one would read zero and the counts would be useless.
 */
export function countOutcomes(ds: Dataset, baseRows: Uint32Array): OutcomeCounts {
  let resolved = 0
  let transferred = 0
  let abandoned = 0

  for (const row of baseRows) {
    const outcome = ds.outcome[row]
    if (outcome === RESOLVED) resolved++
    else if (outcome === TRANSFERRED) transferred++
    else if (outcome === ABANDONED) abandoned++
  }

  return {
    all: baseRows.length,
    resolved,
    transferred,
    abandoned,
    // Everything the agent did not finish.
    unresolved: transferred + abandoned,
  }
}

/**
 * The subset of `baseRows` matching one chip.
 *
 * The rows for a chip are a filter of the rows for "All", so they are taken
 * here rather than asked of the worker a second time: one pass over a byte
 * column on the main thread against a second full drill, and — more
 * importantly — the chips and the table can no longer disagree, because the
 * table is literally a slice of what the chips counted.
 *
 * Returns `baseRows` itself for the "All" chip. Callers hand the result to the
 * worker, which takes ownership of the buffer, so neither array may be used
 * afterwards.
 */
export function selectOutcome(
  ds: Dataset,
  baseRows: Uint32Array,
  outcome: DrillOutcome | undefined,
): Uint32Array {
  if (outcome === undefined) return baseRows

  // 'unresolved' is not an outcome code but a pair of them: whatever the agent
  // did not finish. Same rule as `DrillTarget.resolved === false`.
  const matches =
    outcome === 'unresolved'
      ? (code: number | undefined): boolean => code === TRANSFERRED || code === ABANDONED
      : (code: number | undefined): boolean => code === OUTCOMES.indexOf(outcome)

  const picked = new Uint32Array(baseRows.length)
  let n = 0
  for (const row of baseRows) {
    if (matches(ds.outcome[row])) picked[n++] = row
  }

  // `slice`, not `subarray`: a view would keep the full-size buffer alive and
  // hand the worker far more than it was given. The row count the virtualizer
  // reads comes straight off this length, so it has to be exact either way.
  return picked.slice(0, n)
}

export type OutcomeChipsProps = {
  counts: OutcomeCounts
  active: ChipValue
  onSelect: (value: ChipValue) => void
}

export function OutcomeChips({ counts, active, onSelect }: OutcomeChipsProps) {
  const { lang, t } = useI18n()

  const chip = (value: ChipValue, label: string, count: number) => {
    const selected = value === active

    return (
      <button
        key={value ?? 'all'}
        type="button"
        // aria-pressed rather than a tablist: these filter one view instead of
        // switching between several, and nothing changes identity when pressed.
        aria-pressed={selected}
        onClick={() => onSelect(value)}
        className={`rounded-full border px-3 py-1 text-[12px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
          selected
            ? 'border-primary bg-accent font-medium text-accent-foreground'
            : 'border-border text-foreground hover:bg-muted'
        }`}
      >
        {label} <span className="tabular-nums text-muted-foreground">{formatInt(lang, count)}</span>
      </button>
    )
  }

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={t('drill.chipsLabel')}>
      {chip(undefined, t('drill.chip.all'), counts.all)}
      {DRILL_OUTCOMES.map((outcome) => chip(outcome, t(CHIP_LABEL[outcome]), counts[outcome]))}
    </div>
  )
}
