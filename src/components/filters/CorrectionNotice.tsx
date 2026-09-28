/**
 * "Some link filters were invalid and were reset."
 *
 * Shown once, dismissible. The alternative — silently correcting a bad link —
 * means someone opens a colleague's URL, sees a different period than the
 * colleague meant, and has no way to know. Saying it once is the minimum.
 *
 * Dismissal is keyed to the specific set of corrections, so fixing one bad
 * link and then opening another still warns. Re-notifying about the *same*
 * corrections after the user has dismissed them would be nagging.
 */

import { useState } from 'react'

import { useI18n } from '../../i18n/useI18n'
import type { Correction } from '../../state/url'

export type CorrectionNoticeProps = {
  corrections: Correction[]
}

/** A stable identity for one set of corrections. */
function signatureOf(corrections: Correction[]): string {
  return corrections.map((correction) => JSON.stringify(correction)).join('|')
}

export function CorrectionNotice({ corrections }: CorrectionNoticeProps) {
  const { t } = useI18n()
  const signature = signatureOf(corrections)

  // Storing *which* set was dismissed rather than a boolean means a new set of
  // problems shows again on its own: a different signature simply does not
  // match. No effect, no resetting state when a prop changes.
  const [dismissedSignature, setDismissedSignature] = useState('')

  if (corrections.length === 0 || dismissedSignature === signature) return null

  return (
    <div
      role="status"
      className="flex items-start justify-between gap-3 rounded-md border border-border bg-muted px-3 py-2 text-[12.5px] text-foreground"
    >
      <span>{t('filters.correctedNotice')}</span>
      <button
        type="button"
        onClick={() => setDismissedSignature(signature)}
        className="shrink-0 rounded-md px-2 py-0.5 font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {t('filters.dismiss')}
      </button>
    </div>
  )
}
