/**
 * Preset buttons plus a custom range.
 *
 * The presets are toggle buttons carrying `aria-pressed`, not links or radios:
 * they change the view in place, and `aria-pressed` is what announces "this
 * one is the current view" without inventing a widget role.
 *
 * The custom inputs are native `<input type="date">`, bounded by `min`/`max`
 * to the data. A date picker is one of the few controls a browser already does
 * better than a library will: it is localized, keyboard-operable, and on a
 * phone it opens the platform picker.
 */

import { useI18n } from '../../i18n/useI18n'
import { dayIndexToISO, isoToDayIndex } from '../../lib/time/riyadh'
import type { DayRangeQuery } from '../../engine/types'
import {
  PRESET_IDS,
  activePreset,
  presetRange,
  type DataBounds,
  type PresetId,
} from '../../state/presets'

const PRESET_LABEL_KEY = {
  lastWeek: 'filters.preset.lastWeek',
  last30Days: 'filters.preset.last30Days',
  quarter: 'filters.preset.quarter',
} as const

export type DateRangePickerProps = {
  range: DayRangeQuery
  bounds: DataBounds
  onChange: (range: DayRangeQuery) => void
}

export function DateRangePicker({ range, bounds, onChange }: DateRangePickerProps) {
  const { t } = useI18n()
  const active: PresetId = activePreset(range, bounds)

  const minIso = dayIndexToISO(bounds.firstDay)
  const maxIso = dayIndexToISO(bounds.lastDay)

  /**
   * A half-typed date in a native input fires change on every keystroke, so
   * an unparseable value is normal rather than exceptional — ignore it until
   * it becomes a real date, and keep the range ordered when it does.
   */
  const setEdge = (edge: 'from' | 'to', value: string): void => {
    let day: number
    try {
      day = isoToDayIndex(value)
    } catch {
      return
    }
    if (day < bounds.firstDay || day > bounds.lastDay) return

    const next = edge === 'from' ? { from: day, to: range.to } : { from: range.from, to: day }
    onChange(next.from > next.to ? { from: next.to, to: next.from } : next)
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <fieldset className="border-0 p-0">
        <legend className="sr-only-text">{t('filters.presetsLegend')}</legend>
        <div className="flex flex-wrap gap-1.5">
          {PRESET_IDS.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-pressed={active === preset}
              onClick={() => onChange(presetRange(preset, bounds))}
              className={`rounded-md border px-2.5 py-1.5 text-[12.5px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                active === preset
                  ? 'border-primary bg-accent font-medium text-accent-foreground'
                  : 'border-border bg-background text-foreground hover:bg-muted'
              }`}
            >
              {t(PRESET_LABEL_KEY[preset])}
            </button>
          ))}

          {/* Custom is a state, not an action: it lights up when the range
              matches no preset, and pressing it does nothing but say so. */}
          <span
            aria-hidden={active !== 'custom'}
            className={`rounded-md border px-2.5 py-1.5 text-[12.5px] ${
              active === 'custom'
                ? 'border-primary bg-accent font-medium text-accent-foreground'
                : 'border-transparent text-muted-foreground'
            }`}
          >
            {t('filters.preset.custom')}
          </span>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
          <span>{t('filters.from')}</span>
          <input
            type="date"
            value={dayIndexToISO(range.from)}
            min={minIso}
            max={maxIso}
            onChange={(event) => setEdge('from', event.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-[12.5px] text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        </label>

        <label className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
          <span>{t('filters.to')}</span>
          <input
            type="date"
            value={dayIndexToISO(range.to)}
            min={minIso}
            max={maxIso}
            onChange={(event) => setEdge('to', event.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-[12.5px] text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        </label>
      </div>
    </div>
  )
}
