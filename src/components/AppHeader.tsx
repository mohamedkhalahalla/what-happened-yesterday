/**
 * The page header: what this is, how fresh the data is, who is looking, and
 * which language they read it in.
 *
 * "Data as of" is derived from the dataset's own last day, not from a
 * constant. A dashboard that hardcodes its own freshness date is the dashboard
 * that quietly goes stale.
 */

import { useI18n } from '../i18n/useI18n'
import { formatDayLong } from '../lib/format'
import { USERS, type UserId } from '../state/prefs'

export type AppHeaderProps = {
  /** Absolute Riyadh day index of the last day in the dataset. */
  lastDataDay: number | null
  currentUser: UserId
  onUserChange: (userId: UserId) => void
}

export function AppHeader({ lastDataDay, currentUser, onUserChange }: AppHeaderProps) {
  const { lang, t, setLang } = useI18n()

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-5 py-4">
        <div className="min-w-0">
          {/*
            id + tabIndex -1: not a tab stop, but somewhere for focus to land
            when the drill panel closes and there is no opener to return to
            (a link straight into a drill-down).
          */}
          <h1
            id="app-title"
            tabIndex={-1}
            className="text-[19px] font-semibold text-card-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {t('app.title')}
          </h1>
          {lastDataDay !== null && (
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              {t('app.dataAsOf', { date: formatDayLong(lang, lastDataDay) })}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
            <span>{t('user.switcher')}</span>
            <select
              value={currentUser}
              onChange={(event) => onUserChange(event.target.value as UserId)}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-[12.5px] text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {USERS.map((user) => (
                <option key={user.id} value={user.id}>
                  {t(user.nameKey)} — {t(user.roleKey)}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
            aria-label={t('lang.toggleAria')}
            className="rounded-md border border-border px-2.5 py-1.5 text-[12.5px] font-medium text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {t('lang.toggle')}
          </button>
        </div>
      </div>
    </header>
  )
}
