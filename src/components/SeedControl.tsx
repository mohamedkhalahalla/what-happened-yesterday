/**
 * The demo control, labelled as one.
 *
 * "Synthetic data · seed 20260927 · Shuffle" sits in the footer rather than
 * the header because it is not part of the dashboard's job. It exists to make
 * one claim checkable: that the findings at the top of the page were derived
 * from the numbers rather than written around them. Pressing Shuffle moves the
 * anomalies to a different agent, a different intent and a different day, and
 * the same three rules have to find them again.
 *
 * The words "Synthetic data" lead deliberately. A number in a footer with no
 * explanation is something a reader has to guess at, and the wrong guess here
 * — that this is a real account or period identifier — would make the whole
 * dashboard look like it described a real contact centre.
 */

import { useI18n } from '../i18n/useI18n'
import { isDefaultSeed } from '../state/seed'

export type SeedControlProps = {
  /**
   * The seed the dataset on screen was actually generated from, as reported
   * by the worker — not the one the URL asks for.
   *
   * Those two are the same thing only if every link in the chain worked. When
   * they are not, the reader should be looking at the truth about the numbers
   * in front of them, and an e2e test asserts the two agree.
   */
  seed: number
  /** True while a new quarter is being built; the old one is still on screen. */
  generating: boolean
  onShuffle: () => void
  onReset: () => void
}

export function SeedControl({ seed, generating, onShuffle, onReset }: SeedControlProps) {
  const { t } = useI18n()

  const action =
    'rounded-md px-1.5 py-0.5 font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
      <span>{t('seed.label')}</span>
      <span aria-hidden>·</span>

      {/*
        A seed is an identity, not a quantity, so it is never grouped into
        thousands — 20,260,927 would read as a number somebody counted. `bdi`
        keeps the digits together when the surrounding text runs right to left.
      */}
      <bdi className="tabular-nums" data-testid="seed-in-use">
        {t('seed.value', { seed: String(seed) })}
      </bdi>
      <span aria-hidden>·</span>

      <button type="button" onClick={onShuffle} title={t('seed.shuffleHint')} className={action}>
        {t('seed.shuffle')}
      </button>

      {/*
        Only once there is something to go back to. "Reset to default" next to
        the default is a control that does nothing, and a reader who presses it
        learns only that they misread something.
      */}
      {!isDefaultSeed(seed) && (
        <>
          <span aria-hidden>·</span>
          <button type="button" onClick={onReset} title={t('seed.resetHint')} className={action}>
            {t('seed.reset')}
          </button>
        </>
      )}

      {/*
        Announced, because the dashboard deliberately keeps showing the old
        quarter while the new one builds — without a word here the only signal
        that anything is happening is that the numbers change a second later.
      */}
      <span role="status" className={generating ? 'font-medium text-foreground' : 'sr-only-text'}>
        {generating ? t('seed.generating') : ''}
      </span>
    </div>
  )
}
