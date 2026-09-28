/**
 * What every widget is handed.
 *
 * Deliberately the same props for all of them: the canvas does not know or
 * care which widget it is rendering, so a new widget is a registry entry plus
 * a component and nothing else changes.
 */

import type { Aggregates } from '../engine/types'
import type { FilterState } from '../state/url'

export type WidgetProps = {
  /** The latest aggregates, or null before the first result arrives. */
  data: Aggregates | null
  /** The filters that produced `data` — for widgets that label their own range. */
  filters: FilterState
  /** False when there is no previous period to compare against. */
  showDelta: boolean
}
