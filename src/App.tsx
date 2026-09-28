/**
 * App shell. The body is temporary demo content — four KPIs and one breakdown
 * bar for the last full week — and gets replaced by the real dashboard next.
 * The header, persistence and perf readout are not temporary.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'

import { AppHeader } from './components/AppHeader'
import { Card } from './components/Card'
import { KpiCard, type DeltaTone } from './components/KpiCard'
import { StackedBar, type StackedSegment } from './components/Bars'
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
  formatSignedInt,
  type UiLang,
} from './lib/format'
import { isoToDayIndex } from './lib/time/riyadh'
import {
  DEFAULT_PREFS,
  loadCurrentUser,
  loadPrefs,
  saveCurrentUser,
  savePrefs,
  type UserId,
} from './state/prefs'

/** The last full week in the dataset: Sunday 2026-09-20 to Saturday 2026-09-26. */
const LAST_FULL_WEEK = {
  from: isoToDayIndex('2026-09-20'),
  to: isoToDayIndex('2026-09-26'),
}

type Snapshot = {
  current: Counts
  previous: Counts
  lastDataDay: number
  workerMs: number
  roundTripMs: number
}

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

function Dashboard({ snapshot, loading }: { snapshot: Snapshot | null; loading: boolean }) {
  const { lang, t } = useI18n()

  if (loading || snapshot === null) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <KpiCard key={i} label="" value="" loading />
        ))}
      </div>
    )
  }

  const { current, previous } = snapshot

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
      direction: resolution.delta,
      tone: toneFor(resolution.delta, true),
    },
    {
      key: 'transfer',
      label: t('kpi.transferRate'),
      value: formatPercent(lang, transfer.value),
      delta: formatPointsDelta(lang, transfer.delta),
      direction: transfer.delta,
      tone: toneFor(transfer.delta, false),
    },
    {
      key: 'abandonment',
      label: t('kpi.abandonmentRate'),
      value: formatPercent(lang, abandonment.value),
      delta: formatPointsDelta(lang, abandonment.delta),
      direction: abandonment.delta,
      tone: toneFor(abandonment.delta, false),
    },
    {
      key: 'calls',
      label: t('kpi.calls'),
      value: formatInt(lang, current.calls),
      delta: formatSignedInt(lang, callsDelta),
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
            delta={kpi.delta}
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

function PerfReadout({ snapshot }: { snapshot: Snapshot | null }) {
  const { lang, t } = useI18n()
  if (snapshot === null) return null

  return (
    <p className="text-[11.5px] text-muted-foreground" data-numeric>
      {t('perf.readout', {
        worker: formatDecimal(lang, snapshot.workerMs),
        roundTrip: formatDecimal(lang, snapshot.roundTripMs),
      })}
    </p>
  )
}

function Shell({
  currentUser,
  onUserChange,
}: {
  currentUser: UserId
  onUserChange: (u: UserId) => void
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { t } = useI18n()

  useEffect(() => {
    const client = new EngineClient()
    let cancelled = false

    void (async () => {
      try {
        const dataset = await client.init()
        const response = await client.aggregate({
          range: LAST_FULL_WEEK,
          agents: [],
          intents: [],
          languages: [],
        })
        if (cancelled || response.stale) return

        setSnapshot({
          current: response.result.current,
          previous: response.result.previous,
          lastDataDay: dataset.firstDay + dataset.days - 1,
          workerMs: response.workerMs,
          roundTripMs: response.roundTripMs,
        })
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
      }
    })()

    return () => {
      cancelled = true
      client.dispose()
    }
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        lastDataDay={snapshot?.lastDataDay ?? null}
        currentUser={currentUser}
        onUserChange={onUserChange}
      />

      <main className="mx-auto max-w-[1200px] px-5 py-6">
        {error !== null ? (
          <Card title={t('state.error')} state="error" errorMessage={error} />
        ) : (
          <Dashboard snapshot={snapshot} loading={snapshot === null} />
        )}
      </main>

      <footer className="mx-auto max-w-[1200px] px-5 pb-6">
        <PerfReadout snapshot={snapshot} />
      </footer>
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
