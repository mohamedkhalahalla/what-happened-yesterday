/**
 * The widget shell every panel on the dashboard sits in.
 *
 * Adapted from enigma-dashboard:
 *   src/components/ui/card.tsx          (the Card/Header/Title/Content split)
 *   src/pages/Insights/components/OutcomeBreakdown.tsx  (title + body layout,
 *                                                        18px padding, the
 *                                                        loading/empty split)
 *
 * Changed in the port: shadcn's `cn` and its six exported subcomponents are
 * replaced by one component with slots, because a widget here always has the
 * same anatomy and six exports invite six different assemblies of it. Loading,
 * empty and error are states of *this* component rather than separate skeleton
 * components, so a panel cannot render a title in one state and lose it in
 * another.
 */

import type { ReactNode } from 'react'

import { useI18n } from '../i18n/useI18n'

export type CardState = 'ready' | 'loading' | 'empty' | 'error'

export type CardProps = {
  title: string
  subtitle?: string
  /** Buttons or filters for this panel; sits opposite the title. */
  actions?: ReactNode
  state?: CardState
  /** Shown instead of the generic message when `state` is `'error'`. */
  errorMessage?: string
  onRetry?: () => void
  children?: ReactNode
}

/** Grey placeholder bars, shaped roughly like the content they stand in for. */
function LoadingBody() {
  return (
    <div className="animate-pulse space-y-3" aria-hidden>
      <div className="h-7 w-28 rounded-md bg-muted" />
      <div className="h-3.5 w-40 rounded-md bg-muted" />
      <div className="h-3.5 w-32 rounded-md bg-muted" />
    </div>
  )
}

export function Card({
  title,
  subtitle,
  actions,
  state = 'ready',
  errorMessage,
  onRetry,
  children,
}: CardProps) {
  const { t } = useI18n()

  return (
    <section className="rounded-lg border border-border bg-card p-[18px] shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[13.5px] font-semibold text-card-foreground">{title}</h2>
          {subtitle !== undefined && (
            <p className="mt-0.5 text-[12px] text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {actions !== undefined && <div className="shrink-0">{actions}</div>}
      </div>

      <div className="mt-4">
        {state === 'loading' && (
          <>
            <LoadingBody />
            {/* The visual skeleton is decorative; this is what a screen
                reader is told, and it is announced when it appears. */}
            <p className="sr-only-text" role="status">
              {t('state.loading')}
            </p>
          </>
        )}

        {state === 'empty' && (
          <p className="text-[12.5px] text-muted-foreground">{t('state.empty')}</p>
        )}

        {state === 'error' && (
          <div role="alert" className="text-[12.5px]">
            <p className="text-destructive">{errorMessage ?? t('state.error')}</p>
            {onRetry !== undefined && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-2 rounded-md border border-border px-2.5 py-1 text-[12px] text-card-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {t('state.retry')}
              </button>
            )}
          </div>
        )}

        {state === 'ready' && children}
      </div>
    </section>
  )
}
