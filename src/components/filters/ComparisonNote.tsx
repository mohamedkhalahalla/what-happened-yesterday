/**
 * The sentence that says what is being compared with what.
 *
 * The honesty rule of this whole dashboard lives here. When the previous
 * period is not in the data, this says so in words rather than letting the KPI
 * row render a −100% delta — which would read as a catastrophic collapse in
 * service rather than as the absence of history.
 */

import { useI18n } from '../../i18n/useI18n'
import { formatDayRange } from '../../lib/format'
import type { DayRangeQuery } from '../../engine/types'
import { comparisonRange, type ComparisonCoverage } from '../../state/presets'

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
      {t('filters.comparing', { current, previous: previousLabel })}
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
