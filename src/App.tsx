/**
 * App shell. The body is still demo content — four KPIs and one breakdown bar
 * — but it now follows the filters, and it obeys the comparison-coverage rule:
 * when there is no previous period in the data, no delta is shown at all.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'

import { AppHeader } from './components/AppHeader'
import { Card } from './components/Card'
import { Canvas } from './components/canvas/Canvas'
import { CanvasToolbar } from './components/canvas/CanvasToolbar'
import { UndoToast } from './components/canvas/UndoToast'
import { FilterBar } from './components/filters/FilterBar'
import { EngineClient } from './engine/client'
import { I18nProvider } from './i18n/I18nProvider'
import { useI18n } from './i18n/useI18n'
import { formatDecimal, type UiLang } from './lib/format'
import { boundsOf, comparisonCoverage, type DataBounds } from './state/presets'
import {
  DEFAULT_PREFS,
  loadCurrentUser,
  loadPrefs,
  saveCurrentUser,
  savePrefs,
  type UserId,
} from './state/prefs'
import { useAggregates } from './state/useAggregates'
import { useFilterState } from './state/useFilterState'
import { useLayout } from './state/useLayout'
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
  bounds,
  userId,
}: {
  client: EngineClient | null
  bounds: DataBounds
  userId: UserId
}) {
  const { t } = useI18n()
  const { state, corrections, update } = useFilterState(bounds)
  const { data, isFetching, workerMs, roundTripMs, error } = useAggregates(client, state)
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

  const coverage = comparisonCoverage(state.range, bounds)
  // Both must hold: the reader asked for a comparison, and one exists to make.
  const showDelta = state.compare && coverage !== 'none'

  const onRemoveWidget = (id: WidgetId): void => {
    const record = removeWidget(id)
    if (record === null) return
    setPendingUndo((previous) => ({ record, token: (previous?.token ?? 0) + 1 }))
  }

  const onAddWidget = (id: WidgetId): void => {
    addWidget(id)
    // A widget appended below the fold is invisible feedback; moving focus to
    // it is what says "this happened".
    setFocusWidgetId(id)
  }

  return (
    <>
      <FilterBar
        state={state}
        bounds={bounds}
        coverage={coverage}
        corrections={corrections}
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
            widgetProps={{ data, filters: state, showDelta }}
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
    </>
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
  const [bounds, setBounds] = useState<DataBounds | null>(null)
  const [initError, setInitError] = useState<string | null>(null)
  const { t } = useI18n()

  useEffect(() => {
    const engine = new EngineClient()
    let cancelled = false

    void (async () => {
      try {
        const dataset = await engine.init()
        if (cancelled) return
        setBounds(boundsOf(dataset))
        setClient(engine)
      } catch (cause) {
        if (!cancelled) setInitError(cause instanceof Error ? cause.message : String(cause))
      }
    })()

    return () => {
      cancelled = true
      engine.dispose()
    }
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        lastDataDay={bounds?.lastDay ?? null}
        currentUser={currentUser}
        onUserChange={onUserChange}
      />

      <main className="mx-auto max-w-[1200px] px-5 py-6">
        {initError !== null ? (
          <Card title={t('state.error')} state="error" errorMessage={initError} />
        ) : bounds === null ? (
          <p className="text-[12.5px] text-muted-foreground">{t('state.loading')}</p>
        ) : (
          <Filtered client={client} bounds={bounds} userId={currentUser} />
        )}
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
