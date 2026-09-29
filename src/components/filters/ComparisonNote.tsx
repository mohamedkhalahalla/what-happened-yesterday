/**
 * The sentence that says what is being compared with what.
 *
 * The honesty rule of this whole dashboard lives here. When the previous
 * period is not in the data, this says so in words rather than letting the KPI
 * row render a −100% delta — which would read as a catastrophic collapse in
 * service rather than as the absence of history.
 */

import { useI18n } from '../../i18n/useI18n'
import { formatDayRange, formatInt } from '../../lib/format'
import type { DayRangeQuery } from '../../engine/types'
import {
  comparisonIsShifted,
  comparisonRange,
  comparisonWeeksBack,
  type ComparisonCoverage,
} from '../../state/presets'

export type ComparisonNoteProps = {
  range: DayRangeQuery
  coverage: ComparisonCoverage
  /** Whether the user asked for a comparison at all. */
  compare: boolean
}

export function ComparisonNote({ range, coverage, compare }: ComparisonNoteProps) {
  const { lang, t } = useI18n()

  const current = formatDayRange(lang, range.from, range.to)
  const previous = comparisonRange(range)
  const previousLabel = formatDayRange(lang, previous.from, previous.to)

  /**
   * When the comparison sits further back than the range is long — a 10-day
   * range compares against 14 days earlier, to keep the weekday mix identical
   * — the gap is deliberate and has to be said out loud. A reader who works
   * out for themselves that the dates do not abut will assume a bug.
   */
  const weeksBack = comparisonWeeksBack(range)
  const weeksLabel =
    weeksBack === 1
      ? t('filters.weeksOne')
      : weeksBack === 2
        ? t('filters.weeksTwo')
        : t('filters.weeksMany', { count: formatInt(lang, weeksBack) })

  const comparingSentence = comparisonIsShifted(range)
    ? t('filters.comparingShifted', {
        current,
        weeks: weeksLabel,
        previous: previousLabel,
      })
    : t('filters.comparing', { current, previous: previousLabel })

  if (!compare) {
    return (
      <p className="text-[12.5px] text-muted-foreground">
        {t('filters.comparisonOff', { current })}
      </p>
    )
  }

  if (coverage === 'none') {
    return (
      <p className="text-[12.5px]">
        <span className="font-medium text-foreground">{t('filters.noComparison')}</span>{' '}
        <span className="text-muted-foreground">{t('filters.noComparisonWhy', { current })}</span>
      </p>
    )
  }

  return (
    <p className="text-[12.5px] text-muted-foreground">
      {comparingSentence}
      {coverage === 'partial' && (
        <>
          {' · '}
          <span className="font-medium text-foreground">{t('filters.partialComparison')}</span>{' '}
          <span>{t('filters.partialComparisonWhy', { previous: previousLabel })}</span>
        </>
      )}
    </p>
  )
}
