/**
 * What every widget is handed.
 *
 * Deliberately the same props for all of them: the canvas does not know or
 * care which widget it is rendering, so a new widget is a registry entry plus
 * a component and nothing else changes.
 */

import type { Aggregates } from '../engine/types'
import type { ComparisonCoverage, DataBounds } from '../state/presets'
import type { FilterState } from '../state/url'

export type WidgetProps = {
  /** The latest aggregates, or null before the first result arrives. */
  data: Aggregates | null
  /** The filters that produced `data` — for widgets that label their own range. */
  filters: FilterState
  /** False when there is no previous period to compare against. */
  showDelta: boolean
  /**
   * How much of the previous period exists in the data. Widgets need the
   * distinction between "no change" and "nothing to compare with".
   */
  coverage: ComparisonCoverage
  /**
   * The edges of the dataset. The daily series is indexed from
   * `bounds.firstDay`, so a widget cannot map it to dates without this.
   */
  bounds: DataBounds
}
