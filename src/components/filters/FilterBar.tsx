/**
 * Everything the reader can change about what they are looking at.
 *
 * Assembled from the pieces beside it. The one thing this file decides is the
 * order: dates first (the question is always "when"), then who and what, then
 * the comparison sentence, then the chips summarising the result — so the
 * sentence and the chips sit directly above the numbers they explain.
 */

import { useI18n } from '../../i18n/useI18n'
import { agentName, intentLabel, languageLabel } from '../../i18n/dictionary'
import { AGENTS, INTENTS, LANGUAGES } from '../../data/dictionaries'
import type { DayRangeQuery } from '../../engine/types'
import type { ComparisonCoverage, DataBounds } from '../../state/presets'
import type { Correction, FilterState } from '../../state/url'
import { ComparisonNote } from './ComparisonNote'
import { CorrectionNotice } from './CorrectionNotice'
import { DateRangePicker } from './DateRangePicker'
import { FilterChips } from './FilterChips'
import { MultiSelect } from './MultiSelect'

export type FilterBarProps = {
  state: FilterState
  bounds: DataBounds
  coverage: ComparisonCoverage
  corrections: Correction[]
  onChange: (patch: Partial<FilterState>) => void
}

export function FilterBar({ state, bounds, coverage, corrections, onChange }: FilterBarProps) {
  const { lang, t } = useI18n()

  const agentOptions = AGENTS.map((_, code) => ({ code, label: agentName(lang, code) }))
  const intentOptions = INTENTS.map((_, code) => ({ code, label: intentLabel(lang, code) }))
  const languageOptions = LANGUAGES.map((_, code) => ({ code, label: languageLabel(lang, code) }))

  const setRange = (range: DayRangeQuery): void => onChange({ range })

  return (
    <section
      aria-label={t('filters.presetsLegend')}
      className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-card"
    >
      <CorrectionNotice corrections={corrections} />

      <DateRangePicker range={state.range} bounds={bounds} onChange={setRange} />

      <div className="flex flex-wrap items-center gap-2">
        <MultiSelect
          label={t('filters.agents')}
          options={agentOptions}
          selected={state.agents}
          onChange={(agents) => onChange({ agents })}
        />
        <MultiSelect
          label={t('filters.intents')}
          options={intentOptions}
          selected={state.intents}
          onChange={(intents) => onChange({ intents })}
          searchable
          searchLabel={t('filters.searchIntents')}
        />
        <MultiSelect
          label={t('filters.languages')}
          options={languageOptions}
          selected={state.languages}
          onChange={(languages) => onChange({ languages })}
        />

        <label className="ms-auto flex items-center gap-2 text-[12.5px] text-foreground">
          <input
            type="checkbox"
            checked={state.compare}
            onChange={(event) => onChange({ compare: event.target.checked })}
            className="size-3.5 accent-primary"
          />
          <span>{t('filters.compare')}</span>
        </label>
      </div>

      <ComparisonNote range={state.range} coverage={coverage} compare={state.compare} />

      <FilterChips state={state} onChange={onChange} />
    </section>
  )
}
