import { describe, expect, it } from 'vitest'

import { DEFAULT_WIDGET_IDS, WIDGETS, WIDGET_IDS, type WidgetId } from '../widgets/registry'
import {
  HEIGHT_ROWS,
  LAYOUT_VERSION,
  add,
  defaultLayout,
  layoutStorageKey,
  move,
  moveBy,
  remove,
  removedRecord,
  reset,
  resize,
  undoRemove,
  validateLayout,
  type Layout,
} from './layout'

const ids = (layout: Layout): WidgetId[] => layout.items.map((item) => item.id)
const base = (): Layout => defaultLayout()

describe('defaultLayout', () => {
  it('holds the default widgets at their default sizes', () => {
    const layout = base()
    expect(layout.version).toBe(LAYOUT_VERSION)
    expect(ids(layout)).toEqual([...DEFAULT_WIDGET_IDS])

    for (const item of layout.items) {
      expect(item.w).toBe(WIDGETS[item.id].defaultSize.w)
      expect(item.h).toBe(WIDGETS[item.id].defaultSize.h)
    }
  })

  it('leaves peakHours off the canvas, available from the catalog', () => {
    expect(ids(base())).not.toContain('peakHours')
    expect(WIDGET_IDS).toContain('peakHours')
  })

  it('returns a fresh object each time, so callers cannot mutate the default', () => {
    const a = defaultLayout()
    a.items.pop()
    expect(ids(defaultLayout())).toEqual([...DEFAULT_WIDGET_IDS])
  })
})

describe('move', () => {
  it('moves an item forward and shifts the rest along', () => {
    const layout = move(base(), 0, 2)
    const original = ids(base())
    expect(ids(layout)).toEqual([original[1]!, original[2]!, original[0]!, ...original.slice(3)])
  })

  it('moves an item backward', () => {
    const layout = move(base(), 3, 1)
    const original = ids(base())
    expect(ids(layout)).toEqual([
      original[0]!,
      original[3]!,
      original[1]!,
      original[2]!,
      ...original.slice(4),
    ])
  })

  it('keeps the same set of widgets', () => {
    expect([...ids(move(base(), 0, 4))].sort()).toEqual([...ids(base())].sort())
  })

  it('clamps a target past the end instead of dropping the item', () => {
    const layout = move(base(), 0, 99)
    expect(ids(layout)).toHaveLength(ids(base()).length)
    expect(ids(layout).at(-1)).toBe(ids(base())[0])
  })

  it('is a no-op for an out-of-range source or a move to itself', () => {
    expect(move(base(), 0, 0)).toEqual(base())
    expect(move(base(), -1, 2)).toEqual(base())
    expect(move(base(), 99, 0)).toEqual(base())
  })

  it('does not mutate the input', () => {
    const layout = base()
    const before = ids(layout)
    move(layout, 0, 3)
    expect(ids(layout)).toEqual(before)
  })
})

describe('moveBy', () => {
  it('nudges a widget one step later and one step earlier', () => {
    const first = ids(base())[0]!
    const later = moveBy(base(), first, 1)
    expect(ids(later)[1]).toBe(first)
    expect(ids(moveBy(later, first, -1))).toEqual(ids(base()))
  })

  it('does nothing at the ends', () => {
    const first = ids(base())[0]!
    const last = ids(base()).at(-1)!
    expect(moveBy(base(), first, -1)).toEqual(base())
    expect(moveBy(base(), last, 1)).toEqual(base())
  })

  it('ignores a widget that is not on the canvas', () => {
    expect(moveBy(base(), 'peakHours', 1)).toEqual(base())
  })
})

describe('resize', () => {
  it('changes width and height independently', () => {
    const layout = resize(base(), 'kpis', { w: 6 })
    expect(layout.items.find((i) => i.id === 'kpis')?.w).toBe(6)
    expect(layout.items.find((i) => i.id === 'kpis')?.h).toBe(WIDGETS.kpis.defaultSize.h)

    const taller = resize(layout, 'kpis', { h: 'L' })
    expect(taller.items.find((i) => i.id === 'kpis')?.w).toBe(6)
    expect(taller.items.find((i) => i.id === 'kpis')?.h).toBe('L')
  })

  it('refuses to go below the widget minimum', () => {
    // kpis holds four cards side by side; a third of the grid cannot show them.
    expect(WIDGETS.kpis.minSize.w).toBe(6)
    const layout = resize(base(), 'kpis', { w: 4 })
    expect(layout.items.find((i) => i.id === 'kpis')?.w).toBe(6)
  })

  it('refuses a height below the widget minimum', () => {
    const layout = resize(base(), 'intentTable', { h: 'S' })
    expect(HEIGHT_ROWS[layout.items.find((i) => i.id === 'intentTable')!.h]).toBeGreaterThanOrEqual(
      HEIGHT_ROWS[WIDGETS.intentTable.minSize.h],
    )
  })

  it('leaves other widgets untouched', () => {
    const layout = resize(base(), 'kpis', { w: 6 })
    for (const item of layout.items) {
      if (item.id === 'kpis') continue
      expect(item).toEqual(base().items.find((i) => i.id === item.id))
    }
  })
})

describe('add and remove', () => {
  it('appends at the default size', () => {
    const layout = add(base(), 'peakHours')
    expect(ids(layout).at(-1)).toBe('peakHours')
    expect(layout.items.at(-1)?.w).toBe(WIDGETS.peakHours.defaultSize.w)
  })

  it('refuses to add a widget twice', () => {
    const once = add(base(), 'peakHours')
    expect(add(once, 'peakHours')).toEqual(once)
  })

  it('removes by id', () => {
    const layout = remove(base(), 'kpis')
    expect(ids(layout)).not.toContain('kpis')
    expect(ids(layout)).toHaveLength(ids(base()).length - 1)
  })

  it('ignores removing something that is not there', () => {
    expect(remove(base(), 'peakHours')).toEqual(base())
  })

  it('can remove everything', () => {
    let layout = base()
    for (const id of ids(base())) layout = remove(layout, id)
    expect(layout.items).toEqual([])
  })
})

describe('undoRemove', () => {
  it('restores a widget to the index it came from, not to the end', () => {
    const original = base()
    const target = ids(original)[1]!

    const record = removedRecord(original, target)
    expect(record).not.toBeNull()

    const without = remove(original, target)
    expect(ids(without)).not.toContain(target)

    const restored = undoRemove(without, record!)
    expect(ids(restored)).toEqual(ids(original))
  })

  it('restores the size the widget had, not its default', () => {
    const resized = resize(base(), 'kpis', { w: 6, h: 'L' })
    const record = removedRecord(resized, 'kpis')!
    const restored = undoRemove(remove(resized, 'kpis'), record)

    expect(restored.items.find((i) => i.id === 'kpis')).toEqual({ id: 'kpis', w: 6, h: 'L' })
  })

  it('does nothing if the widget is somehow already back', () => {
    const record = removedRecord(base(), 'kpis')!
    expect(undoRemove(base(), record)).toEqual(base())
  })

  it('restores at the end when the canvas has since shrunk', () => {
    const original = base()
    const record = removedRecord(original, ids(original).at(-1)!)!

    let layout = remove(original, record.item.id)
    layout = remove(layout, ids(layout)[0]!)

    const restored = undoRemove(layout, record)
    expect(ids(restored)).toContain(record.item.id)
  })
})

describe('reset', () => {
  it('returns the default layout whatever was there before', () => {
    let layout = base()
    layout = remove(layout, 'kpis')
    layout = resize(layout, 'dailyTrend', { w: 4 })
    layout = add(layout, 'peakHours')

    expect(reset()).toEqual(defaultLayout())
    expect(reset()).not.toEqual(layout)
  })
})

describe('validateLayout', () => {
  it('accepts a layout it wrote itself', () => {
    const layout = resize(add(base(), 'peakHours'), 'kpis', { w: 6 })
    expect(validateLayout(JSON.parse(JSON.stringify(layout)))).toEqual(layout)
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a number', 42],
    ['a string', 'layout'],
    ['an array', []],
    ['an empty object', {}],
    ['a missing version', { items: [] }],
    ['a future version', { version: 99, items: [{ id: 'kpis', w: 12, h: 'M' }] }],
    ['a string version', { version: '1', items: [] }],
    ['items that are not an array', { version: 1, items: 'kpis' }],
    ['items null', { version: 1, items: null }],
  ])('falls back to the default for %s', (_name, input) => {
    expect(validateLayout(input)).toEqual(defaultLayout())
  })

  it('drops unknown widget ids', () => {
    const layout = validateLayout({
      version: 1,
      items: [
        { id: 'kpis', w: 12, h: 'M' },
        { id: 'weatherForecast', w: 6, h: 'M' },
        { id: 'dailyTrend', w: 8, h: 'M' },
      ],
    })
    expect(ids(layout)).toEqual(['kpis', 'dailyTrend'])
  })

  it('drops duplicate ids, keeping the first', () => {
    const layout = validateLayout({
      version: 1,
      items: [
        { id: 'kpis', w: 12, h: 'M' },
        { id: 'kpis', w: 6, h: 'S' },
      ],
    })
    expect(ids(layout)).toEqual(['kpis'])
    expect(layout.items[0]?.w).toBe(12)
  })

  it('replaces an invalid size with that widget default', () => {
    const layout = validateLayout({
      version: 1,
      items: [
        { id: 'kpis', w: 7, h: 'XL' },
        { id: 'dailyTrend', w: null, h: undefined },
      ],
    })
    expect(layout.items[0]).toEqual({
      id: 'kpis',
      w: WIDGETS.kpis.defaultSize.w,
      h: WIDGETS.kpis.defaultSize.h,
    })
    expect(layout.items[1]).toEqual({
      id: 'dailyTrend',
      w: WIDGETS.dailyTrend.defaultSize.w,
      h: WIDGETS.dailyTrend.defaultSize.h,
    })
  })

  it('skips entries that are not objects', () => {
    const layout = validateLayout({
      version: 1,
      items: [null, 'kpis', 7, { id: 'kpis', w: 12, h: 'M' }],
    })
    expect(ids(layout)).toEqual(['kpis'])
  })

  it('keeps a deliberately emptied canvas empty', () => {
    // Removing every widget is a thing a person can do, and reloading should
    // not silently undo it.
    expect(validateLayout({ version: 1, items: [] })).toEqual({ version: 1, items: [] })
  })

  it('falls back when every entry was garbage', () => {
    // As opposed to the case above: the person did not empty this, it rotted.
    expect(validateLayout({ version: 1, items: [{ id: 'nope' }, null] })).toEqual(defaultLayout())
  })

  it('never throws, whatever it is handed', () => {
    const nasty: unknown[] = [
      { version: 1, items: [{ id: { nested: true }, w: [], h: {} }] },
      { version: 1, items: [{}] },
      { version: 1, items: [[]] },
      Object.create(null),
      new Date(0),
    ]
    for (const input of nasty) {
      expect(() => validateLayout(input)).not.toThrow()
      expect(validateLayout(input).version).toBe(LAYOUT_VERSION)
    }
  })
})

describe('storage keys', () => {
  it('is namespaced and per user', () => {
    expect(layoutStorageKey('abdullah')).toBe('wy.layout.v1.abdullah')
    expect(layoutStorageKey('vp')).toBe('wy.layout.v1.vp')
    expect(layoutStorageKey('abdullah')).not.toBe(layoutStorageKey('vp'))
  })
})
