/**
 * "Widget removed · Undo".
 *
 * A confirmation dialog before every removal would be tedious for an action
 * that costs one click to redo; a silent removal with no way back is worse.
 * An undo toast is the middle path — the removal happens immediately, and the
 * way back stays available for a few seconds.
 *
 * The toast is focusable and announced. `role="status"` rather than `alert`
 * because this is a confirmation, not a problem: `alert` is assertive and
 * would interrupt whatever a screen reader was mid-sentence on.
 */

import { useEffect, useRef } from 'react'

import { useI18n } from '../../i18n/useI18n'

/** Long enough to notice and act on, short enough not to sit in the way. */
const TOAST_MS = 6000

export type UndoToastProps = {
  /** Changes identity per removal, so a second removal restarts the timer. */
  token: number
  message: string
  actionLabel: string
  onAction: () => void
  onDismiss: () => void
}

export function UndoToast({ token, message, actionLabel, onAction, onDismiss }: UndoToastProps) {
  const { t } = useI18n()
  const actionRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    // `token` changes per removal, so a second removal restarts the timer
    // rather than inheriting the remains of the first one.
    const timer = setTimeout(onDismiss, TOAST_MS)
    return () => clearTimeout(timer)
  }, [token, onDismiss])

  return (
    <div
      // Fixed to the bottom of the viewport. The inset uses logical
      // properties so it sits on the correct side in both directions.
      className="fixed bottom-4 z-40 flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5 shadow-card-hover"
      style={{ insetInlineStart: '1rem' }}
      role="status"
      aria-live="polite"
    >
      <span className="text-[12.5px] text-foreground">{message}</span>

      <button
        ref={actionRef}
        type="button"
        onClick={onAction}
        className="rounded-md px-2 py-1 text-[12.5px] font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {actionLabel}
      </button>

      <button
        type="button"
        onClick={onDismiss}
        aria-label={t('canvas.close')}
        className="rounded-md px-1.5 py-1 text-[12px] leading-none text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span aria-hidden>×</span>
      </button>
    </div>
  )
}
