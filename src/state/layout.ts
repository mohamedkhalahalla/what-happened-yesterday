/**
 * What is on the canvas, in what order, at what size — and how that survives a
 * reload.
 *
 * Two decisions worth stating, because both are load-bearing:
 *
 * **Order in the array is the visual order is the DOM order.** The grid never
 * uses `grid-auto-flow: dense`. Dense packing backfills gaps, so a widget can
 * appear visually before one that precedes it in the DOM — which means the
 * reading order a screen reader announces, and the order Tab moves through,
 * stop matching what everyone else sees. A gap at the end of a row is a much
 * smaller problem than a layout that reads differently depending on how you
 * read it.
 *
 * **The reducer is pure.** Every operation takes a layout and returns a new
 * one, so the store is testable without a DOM, and persistence is a separate
 * concern layered on top rather than tangled through it.
 */

import {
  DEFAULT_WIDGET_IDS,
  WIDGETS,
  isWidgetId,
  type WidgetHeight,
  type WidgetId,
  type WidgetWidth,
} from '../widgets/registry'

/**
 * The shape of a stored layout.
 *
 * 1 → 2 added the Fix-first widget at the top of the canvas. Versioned rather
 * than silently accepted, because a v1 layout is missing a widget the app now
 * leads with, and the stored version is the only thing that tells "this person
 * removed it" apart from "this layout predates it".
 */
export const LAYOUT_VERSION = 2

/**
 * Storage key prefix. The per-user id is appended.
 *
 * Still says `v1` after the bump, deliberately: the version lives in the
 * payload, and moving the key would hide every stored layout from the
 * migration rather than migrating it — which is the one thing a migration
 * exists to prevent.
 */
const LAYOUT_KEY_PREFIX = 'wy.layout.v1.'

export type LayoutItem = {
  id: WidgetId
  w: WidgetWidth
  h: WidgetHeight
}

export type Layout = {
  version: typeof LAYOUT_VERSION
  items: LayoutItem[]
}

const VALID_WIDTHS: readonly WidgetWidth[] = [4, 6, 8, 12]
const VALID_HEIGHTS: readonly WidgetHeight[] = ['S', 'M', 'L']

/** Row spans per height step, against a fixed row height in the CSS. */
export const HEIGHT_ROWS: Record<WidgetHeight, number> = { S: 2, M: 3, L: 5 }

/** The CSS grid row height, in pixels. Paired with {@link HEIGHT_ROWS}. */
export const GRID_ROW_HEIGHT_PX = 72

export function isWidth(value: unknown): value is WidgetWidth {
  return VALID_WIDTHS.includes(value as WidgetWidth)
}

export function isHeight(value: unknown): value is WidgetHeight {
  return VALID_HEIGHTS.includes(value as WidgetHeight)
}

/** The canvas everyone starts with. Both profiles get this; they diverge after. */
export function defaultLayout(): Layout {
  return {
    version: LAYOUT_VERSION,
    items: DEFAULT_WIDGET_IDS.map((id) => ({
      id,
      w: WIDGETS[id].defaultSize.w,
      h: WIDGETS[id].defaultSize.h,
    })),
  }
}

// --- the reducer ------------------------------------------------------------

/** Move the item at `from` to index `to`, shifting the rest along. */
export function move(layout: Layout, from: number, to: number): Layout {
  const items = [...layout.items]
  if (from < 0 || from >= items.length) return layout

  const clampedTo = Math.max(0, Math.min(to, items.length - 1))
  if (from === clampedTo) return layout

  const [moved] = items.splice(from, 1)
  if (moved === undefined) return layout
  items.splice(clampedTo, 0, moved)

  return { ...layout, items }
}

/**
 * Nudge one widget one position earlier or later.
 * This is the keyboard-and-menu alternative to dragging — see WCAG 2.2
 * SC 2.5.7, which requires one for any drag operation.
 */
export function moveBy(layout: Layout, id: WidgetId, delta: number): Layout {
  const from = layout.items.findIndex((item) => item.id === id)
  if (from === -1) return layout
  return move(layout, from, from + delta)
}

/** Change a widget's width, height, or both. Sizes below its minimum are refused. */
export function resize(
  layout: Layout,
  id: WidgetId,
  size: { w?: WidgetWidth; h?: WidgetHeight },
): Layout {
  const definition = WIDGETS[id]
  const items = layout.items.map((item) => {
    if (item.id !== id) return item

    const w = size.w ?? item.w
    const h = size.h ?? item.h
    return {
      ...item,
      w: w < definition.minSize.w ? definition.minSize.w : w,
      h: HEIGHT_ROWS[h] < HEIGHT_ROWS[definition.minSize.h] ? definition.minSize.h : h,
    }
  })
  return { ...layout, items }
}

export function remove(layout: Layout, id: WidgetId): Layout {
  return { ...layout, items: layout.items.filter((item) => item.id !== id) }
}

/** Append a widget at its default size. Adding one already present is a no-op. */
export function add(layout: Layout, id: WidgetId): Layout {
  if (layout.items.some((item) => item.id === id)) return layout

  return {
    ...layout,
    items: [...layout.items, { id, w: WIDGETS[id].defaultSize.w, h: WIDGETS[id].defaultSize.h }],
  }
}

/** What a removal has to remember so Undo can put it back where it was. */
export type RemovedWidget = {
  item: LayoutItem
  /** The index it occupied, so Undo restores position and not just presence. */
  index: number
}

/** Find what `remove` would discard, for the undo toast to hold on to. */
export function removedRecord(layout: Layout, id: WidgetId): RemovedWidget | null {
  const index = layout.items.findIndex((item) => item.id === id)
  const item = layout.items[index]
  if (index === -1 || item === undefined) return null
  return { item, index }
}

/**
 * Put a removed widget back at its original index.
 * Restoring to the end would be a different layout from the one the person
 * had, which is not what "undo" means.
 */
export function undoRemove(layout: Layout, removed: RemovedWidget): Layout {
  if (layout.items.some((item) => item.id === removed.item.id)) return layout

  const items = [...layout.items]
  items.splice(Math.min(removed.index, items.length), 0, removed.item)
  return { ...layout, items }
}

export function reset(): Layout {
  return defaultLayout()
}

// --- validation and persistence ---------------------------------------------

/**
 * Coerce anything at all into a usable layout.
 *
 * Stored layouts are user-editable text written by an older version of this
 * app, so this is untrusted input in the same sense a URL is. Every branch
 * falls back rather than throwing: a dashboard that will not render because
 * `localStorage` has a stray character in it is worse than one that quietly
 * starts fresh.
 */
export function validateLayout(raw: unknown): Layout {
  if (typeof raw !== 'object' || raw === null) return defaultLayout()

  const candidate = raw as { version?: unknown; items?: unknown }
  /*
   * Two versions are readable: the current one, and v1 through the migration
   * below. Anything else — a future version, a string, a missing one — is a
   * shape this code has never seen, and guessing at it would produce a canvas
   * nobody arranged. Starting fresh is the honest failure.
   */
  const fromV1 = candidate.version === 1
  if (candidate.version !== LAYOUT_VERSION && !fromV1) return defaultLayout()
  if (!Array.isArray(candidate.items)) return defaultLayout()

  const items: LayoutItem[] = []
  const seen = new Set<WidgetId>()

  for (const entry of candidate.items) {
    if (typeof entry !== 'object' || entry === null) continue

    const { id, w, h } = entry as { id?: unknown; w?: unknown; h?: unknown }
    // Unknown ids: a widget that was removed from the app in a later version.
    if (!isWidgetId(id)) continue
    if (seen.has(id)) continue
    seen.add(id)

    const definition = WIDGETS[id]
    /*
     * A stored size can be valid and still be too small: a layout saved
     * before a widget's minimum was raised will name a size the widget can no
     * longer be drawn at. Clamping on read means an old layout renders
     * correctly rather than rendering broken, and the owner never has to know
     * the minimum changed.
     */
    const width = isWidth(w) ? w : definition.defaultSize.w
    const height = isHeight(h) ? h : definition.defaultSize.h

    items.push({
      id,
      w: Math.max(width, definition.minSize.w) as WidgetWidth,
      h: HEIGHT_ROWS[height] < HEIGHT_ROWS[definition.minSize.h] ? definition.minSize.h : height,
    })
  }

  // An empty canvas is a valid thing to want — the person removed everything —
  // but an items array that was entirely garbage is not.
  if (items.length === 0 && candidate.items.length > 0) return defaultLayout()

  /*
   * The v1 → v2 migration, and the whole reason this function reads two
   * versions. Fix first goes at the top because that is where the thing you
   * should read first belongs, and because appending it would put the
   * dashboard's summary of what is wrong below five widgets of detail.
   *
   * Everything else is left exactly as it was arranged: order, widths,
   * heights, omissions. A migration that also "tidied" the canvas would be
   * taking a layout someone built and handing back one they did not.
   *
   * An emptied v1 canvas gets it too. "If absent, insert" is the rule, and a
   * person who cleared their canvas before this widget existed never decided
   * anything about it — they can remove it once, and the v2 save will respect
   * that from then on.
   */
  if (fromV1 && !items.some((item) => item.id === 'fixFirst')) {
    const { defaultSize } = WIDGETS.fixFirst
    items.unshift({ id: 'fixFirst', w: defaultSize.w, h: defaultSize.h })
  }

  return { version: LAYOUT_VERSION, items }
}

function keyFor(userId: string): string {
  return `${LAYOUT_KEY_PREFIX}${userId}`
}

/** The stored layout for one profile, or the default if there is not a valid one. */
export function loadLayout(userId: string): Layout {
  let raw: string | null
  try {
    raw = window.localStorage.getItem(keyFor(userId))
  } catch {
    // Private browsing, blocked site data, or no window at all.
    return defaultLayout()
  }
  if (raw === null) return defaultLayout()

  try {
    return validateLayout(JSON.parse(raw))
  } catch {
    return defaultLayout()
  }
}

export function saveLayout(userId: string, layout: Layout): void {
  try {
    window.localStorage.setItem(keyFor(userId), JSON.stringify(layout))
  } catch {
    // Storage full or blocked. A lost layout is not worth an error.
  }
}

/** Exposed for tests and for anything that needs to name the key. */
export function layoutStorageKey(userId: string): string {
  return keyFor(userId)
}
