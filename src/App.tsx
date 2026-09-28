/**
 * App shell. The body is still demo content — four KPIs and one breakdown bar
 * — but it now follows the filters, and it obeys the comparison-coverage rule:
 * when there is no previous period in the data, no delta is shown at all.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'

import { AppHeader } from './components/AppHeader'
import { Card } from './components/Card'
import { KpiCard, type DeltaTone } from './components/KpiCard'
import { StackedBar, type StackedSegment } from './components/Bars'
import { FilterBar } from './components/filters/FilterBar'
import { EngineClient } from './engine/client'
import type { Counts } from './engine/types'
import { I18nProvider } from './i18n/I18nProvider'
import { outcomeLabel } from './i18n/dictionary'
import { useI18n } from './i18n/useI18n'
import {
  formatDecimal,
  formatInt,
  formatPercent,
  formatPointsDelta,
  formatPointsMagnitude,
  formatSignedInt,
  type UiLang,
} from './lib/format'
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

/** Share of `value` in `total`, as a ratio. No division by zero. */
function rate(value: number, total: number): number {
  return total > 0 ? value / total : 0
}

/** One KPI's current rate, and its change in points against the previous period. */
function rateDelta(
  current: Counts,
  previous: Counts,
  pick: (counts: Counts) => number,
): { value: number; delta: number } {
  const value = rate(pick(current), current.calls)
  const before = rate(pick(previous), previous.calls)
  return { value, delta: value - before }
}

/** `deltaTone` cannot be inferred from the sign: rising abandonment is bad. */
function toneFor(delta: number, higherIsBetter: boolean): DeltaTone {
  if (delta === 0) return 'neutral'
  const good = delta > 0 ? higherIsBetter : !higherIsBetter
  return good ? 'good' : 'bad'
}

type DashboardProps = {
  current: Counts
  previous: Counts
  /** False when there is no previous period, or the reader turned comparison off. */
  showDelta: boolean
}

function Dashboard({ current, previous, showDelta }: DashboardProps) {
  const { lang, t } = useI18n()

  const resolution = rateDelta(current, previous, (c) => c.resolved)
  const transfer = rateDelta(current, previous, (c) => c.transferred)
  const abandonment = rateDelta(current, previous, (c) => c.abandoned)
  // A count changes by a count, not by percentage points.
  const callsDelta = current.calls - previous.calls

  const kpis = [
    {
      key: 'resolution',
      label: t('kpi.resolutionRate'),
      value: formatPercent(lang, resolution.value),
      delta: formatPointsDelta(lang, resolution.delta),
      magnitude: formatPointsMagnitude(lang, resolution.delta),
      direction: resolution.delta,
      tone: toneFor(resolution.delta, true),
    },
    {
      key: 'transfer',
      label: t('kpi.transferRate'),
      value: formatPercent(lang, transfer.value),
      delta: formatPointsDelta(lang, transfer.delta),
      magnitude: formatPointsMagnitude(lang, transfer.delta),
      direction: transfer.delta,
      tone: toneFor(transfer.delta, false),
    },
    {
      key: 'abandonment',
      label: t('kpi.abandonmentRate'),
      value: formatPercent(lang, abandonment.value),
      delta: formatPointsDelta(lang, abandonment.delta),
      magnitude: formatPointsMagnitude(lang, abandonment.delta),
      direction: abandonment.delta,
      tone: toneFor(abandonment.delta, false),
    },
    {
      key: 'calls',
      label: t('kpi.calls'),
      value: formatInt(lang, current.calls),
      delta: formatSignedInt(lang, callsDelta),
      magnitude: formatInt(lang, Math.abs(callsDelta)),
      direction: callsDelta,
      tone: toneFor(callsDelta, true),
    },
  ]

  const segments: StackedSegment[] = [
    { key: 'resolved', label: outcomeLabel(lang, 0), value: current.resolved, tone: 'good' },
    {
      key: 'transferred',
      label: outcomeLabel(lang, 1),
      value: current.transferred,
      tone: 'data-1',
    },
    { key: 'abandoned', label: outcomeLabel(lang, 2), value: current.abandoned, tone: 'bad' },
  ]

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <KpiCard
            key={kpi.key}
            label={kpi.label}
            value={kpi.value}
            // No previous period means no delta — not a delta of -100%.
            delta={showDelta ? kpi.delta : undefined}
            deltaMagnitude={kpi.magnitude}
            deltaTone={kpi.tone}
            deltaDirection={kpi.direction}
          />
        ))}
      </div>

      <Card title={t('outcome.breakdown')} state={current.calls === 0 ? 'empty' : 'ready'}>
        <StackedBar segments={segments} label={t('outcome.breakdown')} />
      </Card>
    </div>
  )
}

function KpiSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <KpiCard key={i} label="" value="" loading />
      ))}
    </div>
  )
}

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

function Filtered({ client, bounds }: { client: EngineClient | null; bounds: DataBounds }) {
  const { state, corrections, update } = useFilterState(bounds)
  const { data, isFetching, workerMs, roundTripMs, error } = useAggregates(client, state)

  const coverage = comparisonCoverage(state.range, bounds)
  // Both must hold: the reader asked for a comparison, and one exists to make.
  const showDelta = state.compare && coverage !== 'none'

  return (
    <>
      <FilterBar
        state={state}
        bounds={bounds}
        coverage={coverage}
        corrections={corrections}
        onChange={update}
      />

      <div className="mt-4">
        {error !== null && data === null ? (
          <Card title="" state="error" errorMessage={error} />
        ) : data === null ? (
          <KpiSkeleton />
        ) : (
          <Dashboard current={data.current} previous={data.previous} showDelta={showDelta} />
        )}
      </div>

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
          <KpiSkeleton />
        ) : (
          <Filtered client={client} bounds={bounds} />
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
