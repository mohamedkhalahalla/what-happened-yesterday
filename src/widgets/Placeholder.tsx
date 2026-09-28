/**
 * Stand-in body for widgets that are not built yet.
 *
 * It states which question the widget will answer rather than showing a grey
 * box, so the canvas is still meaningful to look at while the real charts are
 * being built — and so a reviewer can see the layout working without mistaking
 * an empty rectangle for a broken widget.
 */

import { useI18n } from '../i18n/useI18n'
import type { MessageKey } from '../i18n/messages.en'

export function Placeholder({ descriptionKey }: { descriptionKey: MessageKey }) {
  const { t } = useI18n()

  return (
    <div className="flex h-full min-h-24 flex-col justify-center gap-2 rounded-md border border-dashed border-border bg-muted/40 p-4">
      <p className="text-[12.5px] text-muted-foreground">{t(descriptionKey)}</p>
      <p className="text-[11.5px] font-medium text-muted-foreground">{t('widget.comingSoon')}</p>
    </div>
  )
}
