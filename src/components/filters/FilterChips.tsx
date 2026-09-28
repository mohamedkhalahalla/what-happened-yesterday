/**
 * The active filters, each removable.
 *
 * A filter you cannot see is a filter you forget you applied, and then spend
 * ten minutes wondering why the numbers look wrong. The chips exist so the
 * answer to "why is this so low?" is on screen next to the number.
 */

import { useI18n } from '../../i18n/useI18n'
import { agentName, intentLabel } from '../../i18n/dictionary'
import { languageLabel } from '../../i18n/dictionary'
import type { Dimension } from '../../state/codes'
import type { FilterState } from '../../state/url'

export type FilterChipsProps = {
  state: FilterState
  onChange: (patch: Partial<FilterState>) => void
}

type Chip = {
  key: string
  dimension: Dimension
  code: number
  label: string
}

export function FilterChips({ state, onChange }: FilterChipsProps) {
  const { lang, t } = useI18n()

  const chips: Chip[] = [
    ...state.agents.map((code) => ({
      key: `agents-${code}`,
      dimension: 'agents' as const,
      code,
      label: agentName(lang, code),
    })),
    ...state.intents.map((code) => ({
      key: `intents-${code}`,
      dimension: 'intents' as const,
      code,
      label: intentLabel(lang, code),
    })),
    ...state.languages.map((code) => ({
      key: `languages-${code}`,
      dimension: 'languages' as const,
      code,
      label: languageLabel(lang, code),
    })),
  ]

  if (chips.length === 0) return null

  const remove = (chip: Chip): void => {
    onChange({ [chip.dimension]: state[chip.dimension].filter((code) => code !== chip.code) })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="sr-only-text">{t('filters.activeFilters')}</span>

      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-[12px] text-foreground"
        >
          <span>{chip.label}</span>
          <button
            type="button"
            onClick={() => remove(chip)}
            aria-label={t('filters.remove', { label: chip.label })}
            className="rounded-full px-1 leading-none text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {/* Decorative: the button's accessible name already says what it
                removes, so the glyph must not be read out as well. */}
            <span aria-hidden>×</span>
          </button>
        </span>
      ))}

      <button
        type="button"
        onClick={() => onChange({ agents: [], intents: [], languages: [] })}
        className="rounded-md px-2 py-1 text-[12px] font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {t('filters.clearAll')}
      </button>
    </div>
  )
}
