/**
 * Language state for the app: the current language, its direction, and `t`.
 *
 * No i18n library. The dictionary is two typed objects and `t` is a lookup
 * with `{placeholder}` substitution — which is the whole feature set this app
 * needs, and it costs nothing at runtime and is fully type-checked.
 */

import { createContext, useCallback, useEffect, useMemo, type ReactNode } from 'react'

import type { UiLang } from '../lib/format'
import { ar } from './messages.ar'
import { en, type MessageKey } from './messages.en'

const MESSAGES: Record<UiLang, Record<MessageKey, string>> = { ar, en }

/** Writing direction per language. Arabic is right-to-left. */
export const DIRECTION: Record<UiLang, 'rtl' | 'ltr'> = { ar: 'rtl', en: 'ltr' }

/** Values interpolated into a message's `{placeholders}`. */
export type MessageParams = Record<string, string | number>

export type I18nContextValue = {
  lang: UiLang
  dir: 'rtl' | 'ltr'
  t: (key: MessageKey, params?: MessageParams) => string
  setLang: (lang: UiLang) => void
}

export const I18nContext = createContext<I18nContextValue | null>(null)

/** Replace `{name}` with `params.name`, leaving unknown placeholders visible. */
function interpolate(template: string, params?: MessageParams): string {
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name]
    return value === undefined ? whole : String(value)
  })
}

export function I18nProvider({
  lang,
  setLang,
  children,
}: {
  lang: UiLang
  setLang: (lang: UiLang) => void
  children: ReactNode
}) {
  const dir = DIRECTION[lang]

  /*
   * `lang` and `dir` live on <html>, not on a wrapper div: they drive the
   * browser's own bidi algorithm, font fallback and hyphenation for the whole
   * document, including anything portalled outside the React root.
   */
  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('lang', lang)
    root.setAttribute('dir', dir)
  }, [lang, dir])

  const t = useCallback(
    (key: MessageKey, params?: MessageParams) => interpolate(MESSAGES[lang][key], params),
    [lang],
  )

  const value = useMemo<I18nContextValue>(
    () => ({ lang, dir, t, setLang }),
    [lang, dir, t, setLang],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
