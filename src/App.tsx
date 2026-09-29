/**
 * App shell. The body is still demo content — four KPIs and one breakdown bar
 * — but it now follows the filters, and it obeys the comparison-coverage rule:
 * when there is no previous period in the data, no delta is shown at all.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { AppHeader } from './components/AppHeader'
import { Card } from './components/Card'
import { Canvas } from './components/canvas/Canvas'
import { CanvasToolbar } from './components/canvas/CanvasToolbar'
import { UndoToast } from './components/canvas/UndoToast'
import { DrillPanel } from './components/drill/DrillPanel'
import { FilterBar } from './components/filters/FilterBar'
import { SeedControl } from './components/SeedControl'
import type { Dataset } from './data/types'
import { EngineClient } from './engine/client'
import { I18nProvider } from './i18n/I18nProvider'
import { useI18n } from './i18n/useI18n'
import { formatDecimal, type UiLang } from './lib/format'
import { comparisonCoverage, type DataBounds } from './state/presets'
import {
  DEFAULT_PREFS,
  loadCurrentUser,
  loadPrefs,
  saveCurrentUser,
  savePrefs,
  type UserId,
} from './state/prefs'
import { DrillContext } from './state/drill'
import { useAggregates } from './state/useAggregates'
import { useDrillState } from './state/useDrillState'
import { useFilterState } from './state/useFilterState'
import { useLayout } from './state/useLayout'
import { useSeed } from './state/useSeed'
import type { Correction } from './state/url'
import type { RemovedWidget } from './state/layout'
import type { WidgetId } from './widgets/registry'

function PerfReadout({
  workerMs,
  roundTripMs,
  isFetching,
}: {
  workerMs: number
  roundTripMs: number
  isFetching: boolean
}) {
  const { lang, t } = useI18n()

  return (
    <p className="text-[11.5px] text-muted-foreground" data-numeric>
      {t('perf.readout', {
        worker: formatDecimal(lang, workerMs),
        roundTrip: formatDecimal(lang, roundTripMs),
      })}
      {/* Only appears once a request has been slow enough to be worth saying. */}
      {isFetching && <span className="ms-2 font-medium">{t('state.updating')}</span>}
    </p>
  )
}

function Filtered({
  client,
  dataset,
  bounds,
  userId,
  seed,
  seedInvalid,
}: {
  client: EngineClient | null
  dataset: Dataset | null
  bounds: DataBounds
  userId: UserId
  /** Which synthetic quarter these aggregates must be computed from. */
  seed: number
  /** The URL named a seed that could not be read; say so in the one notice. */
  seedInvalid: boolean
}) {
  const { lang, t } = useI18n()
  const { state, corrections, update } = useFilterState(bounds)
  const { data, isFetching, workerMs, roundTripMs, error } = useAggregates(
    client,
    state,
    bounds,
    seed,
  )
  const {
    layout,
    moveWidget,
    reorder,
    resizeWidget,
    removeWidget,
    restoreWidget,
    addWidget,
    resetLayout,
  } = useLayout(userId)

  /*
   * What the undo toast is holding. `token` is part of the state rather than a
   * ref because it is rendered: it increments per removal so that removing a
   * second widget restarts the toast timer instead of inheriting the remains
   * of the first one.
   */
  const [pendingUndo, setPendingUndo] = useState<{
    record: RemovedWidget
    token: number
  } | null>(null)
  const [focusWidgetId, setFocusWidgetId] = useState<WidgetId | null>(null)

  const drill = useDrillState(client, dataset, state, bounds, lang)
  const drillOpen = drill.request !== null

  /*
   * The dashboard stays mounted behind the panel, so its scroll position,
   * open popovers and widget state all survive. `inert` is what makes that
   * safe: it removes the whole subtree from the tab order and from assistive
   * tech in one attribute, which is the job a hand-rolled focus trap would
   * otherwise do badly.
   *
   * Set through a ref because React 18 does not yet render `inert` as a prop.
   */
  const dashboardRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const node = dashboardRef.current
    if (node === null) return

    const element = node as HTMLElement & { inert: boolean }
    element.inert = drillOpen
    return () => {
      element.inert = false
    }
  }, [drillOpen])

  /*
   * One notice, both parsers. `parse` reports what it could not honour in the
   * filter parameters; `parseDrill` reports the same about the drill
   * parameter. Merging them here means a half-broken link says so once.
   */
  const allCorrections: Correction[] = useMemo(() => {
    const extra: Correction[] = []
    if (drill.invalid) extra.push({ kind: 'invalidDrill' })
    if (seedInvalid) extra.push({ kind: 'invalidSeed', value: '' })

    return extra.length === 0 ? corrections : [...corrections, ...extra]
  }, [corrections, drill.invalid, seedInvalid])

  const coverage = comparisonCoverage(state.range, bounds)
  // Both must hold: the reader asked for a comparison, and one exists to make.
  const showDelta = state.compare && coverage !== 'none'

  const onRemoveWidget = (id: WidgetId): void => {
    const record = removeWidget(id)
    if (record === null) return
    setPendingUndo((previous) => ({ record, token: (previous?.token ?? 0) + 1 }))
  }

  /*
   * Closing hands focus back to whatever opened the panel. Arriving by link
   * there was no opener, so the page heading takes it instead — anything is
   * better than dropping focus on `body` and making the reader tab from the
   * top of the document.
   */
  const onCloseDrill = useCallback((): void => {
    drill.close(document.getElementById('app-title'))
  }, [drill])

  const onAddWidget = (id: WidgetId): void => {
    addWidget(id)
    // A widget appended below the fold is invisible feedback; moving focus to
    // it is what says "this happened".
    setFocusWidgetId(id)
  }

  return (
    <DrillContext.Provider value={{ openDrill: drill.openDrill }}>
      {/*
        The dashboard is wrapped rather than left loose because `inert` needs
        a single element to sit on. It keeps rendering while the panel is
        open — see the effect above for why.
      */}
      <div ref={dashboardRef}>
        <FilterBar
          state={state}
          bounds={bounds}
          coverage={coverage}
          corrections={allCorrections}
          onChange={update}
        />

        <div className="mt-4 flex justify-end">
          <CanvasToolbar
            present={layout.items.map((item) => item.id)}
            onAdd={onAddWidget}
            onReset={resetLayout}
          />
        </div>

        <div className="mt-3">
          {error !== null && data === null ? (
            <Card title="" state="error" errorMessage={error} />
          ) : (
            <Canvas
              layout={layout}
              widgetProps={{ data, filters: state, showDelta, coverage, bounds }}
              onMove={moveWidget}
              onReorder={reorder}
              onResize={resizeWidget}
              onRemove={onRemoveWidget}
              focusWidgetId={focusWidgetId}
            />
          )}
        </div>

        {pendingUndo !== null && (
          <UndoToast
            token={pendingUndo.token}
            message={t('widget.removed')}
            actionLabel={t('widget.undo')}
            onAction={() => {
              restoreWidget(pendingUndo.record)
              setFocusWidgetId(pendingUndo.record.item.id)
              setPendingUndo(null)
            }}
            onDismiss={() => setPendingUndo(null)}
          />
        )}

        <div className="mt-6">
          <PerfReadout workerMs={workerMs} roundTripMs={roundTripMs} isFetching={isFetching} />
        </div>
      </div>

      {drill.request !== null && dataset !== null && (
        <DrillPanel
          ds={dataset}
          request={drill.request}
          filters={state}
          rows={drill.rows}
          counts={drill.counts}
          loading={drill.loading}
          failed={drill.failed}
          contradicts={drill.contradicts}
          sortKey={drill.sortKey}
          sortDirection={drill.sortDirection}
          onSort={drill.setSort}
          onOutcome={drill.setOutcome}
          onClose={onCloseDrill}
        />
      )}
    </DrillContext.Provider>
  )
}

function Shell({
  currentUser,
  onUserChange,
}: {
  currentUser: UserId
  onUserChange: (u: UserId) => void
}) {
  const [client, setClient] = useState<EngineClient | null>(null)
  const { t } = useI18n()

  /*
   * The worker outlives the data. Changing the seed rebuilds the dataset
   * inside it rather than tearing the whole thing down: a fresh worker would
   * cost a module load and a second `postMessage` round trip for nothing.
   */
  useEffect(() => {
    const engine = new EngineClient()
    let cancelled = false

    /*
     * Published on a microtask rather than straight from the effect body.
     * The client is a handle on an external system, not derived state, but
     * assigning it synchronously here is still a setState inside an effect —
     * and the lint rule that forbids that is right often enough to be worth
     * satisfying rather than silencing.
     */
    void Promise.resolve().then(() => {
      if (!cancelled) setClient(engine)
    })

    return () => {
      cancelled = true
      engine.dispose()
    }
  }, [])

  /*
   * Which quarter, and the main thread's own copy of it. The copy is kept
   * because the drill table reads one call at a time out of the columnar
   * arrays — asking the worker per visible row would be a message per 36
   * pixels of scrolling.
   */
  const seed = useSeed(client)

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        lastDataDay={seed.bounds?.lastDay ?? null}
        currentUser={currentUser}
        onUserChange={onUserChange}
      />

      <main className="mx-auto max-w-[1200px] px-5 py-6">
        {seed.error !== null ? (
          <Card title={t('state.error')} state="error" errorMessage={seed.error} />
        ) : seed.bounds === null ? (
          <p className="text-[12.5px] text-muted-foreground">{t('state.loading')}</p>
        ) : (
          /*
           * Not remounted when the seed changes: the filters, the canvas and
           * the scroll position are the reader's, not the data's. The seed is
           * passed down instead, so the aggregates refetch while everything
           * around them stays put.
           */
          <Filtered
            client={client}
            dataset={seed.dataset}
            bounds={seed.bounds}
            userId={currentUser}
            seed={seed.seed}
            seedInvalid={seed.invalid}
          />
        )}

        <footer className="mt-8 border-t border-border pt-3">
          <SeedControl
            seed={seed.seed}
            generating={seed.generating}
            onShuffle={seed.shuffle}
            onReset={seed.reset}
          />
        </footer>
      </main>
    </div>
  )
}

export default function App() {
  // Read once on mount: storage is untrusted input, and both loaders validate.
  const [currentUser, setCurrentUser] = useState<UserId>(() => loadCurrentUser())
  const [lang, setLangState] = useState<UiLang>(() => loadPrefs(loadCurrentUser()).uiLang)

  const setLang = useCallback(
    (next: UiLang) => {
      setLangState(next)
      savePrefs(currentUser, { ...DEFAULT_PREFS, uiLang: next })
    },
    [currentUser],
  )

  const onUserChange = useCallback((next: UserId) => {
    setCurrentUser(next)
    saveCurrentUser(next)
    // Language is a per-user preference, so switching user adopts theirs.
    setLangState(loadPrefs(next).uiLang)
  }, [])

  const shell = useMemo(
    () => <Shell currentUser={currentUser} onUserChange={onUserChange} />,
    [currentUser, onUserChange],
  )

  return (
    <I18nProvider lang={lang} setLang={setLang}>
      {shell}
    </I18nProvider>
  )
}
