/**
 * Access to the current language, direction and `t`.
 * Separate from the provider module so components importing the hook do not
 * pull in a component, which keeps react-refresh happy.
 */

import { useContext } from 'react'

import { I18nContext, type I18nContextValue } from './I18nProvider'

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext)
  if (value === null) {
    throw new Error('useI18n must be used inside <I18nProvider>')
  }
  return value
}
