/**
 * Domain vocabulary, read from the data dictionaries in the current language.
 *
 * Intent labels, agent names, outcome and handoff names all live in
 * `src/data/dictionaries.ts` beside the codes they name. This module is the
 * only bridge between those and the UI language, so none of that vocabulary is
 * ever copied into the message files.
 */

import {
  AGENTS,
  HANDOFF_LABELS,
  HANDOFF_REASONS,
  INTENTS,
  LANGUAGES,
  LANGUAGE_LABELS,
  OUTCOMES,
  OUTCOME_LABELS,
} from '../data/dictionaries'
import type { UiLang } from '../lib/format'

/** Shown when a code has no entry — visible, but not a crash. */
const UNKNOWN = '—'

/** Display label for an intent code, e.g. `9` → `Roaming` / `التجوال الدولي`. */
export function intentLabel(lang: UiLang, code: number): string {
  const intent = INTENTS[code]
  if (intent === undefined) return UNKNOWN
  return lang === 'ar' ? intent.labelAr : intent.labelEn
}

/** Display name for an agent code, e.g. `5` → `Majed` / `ماجد`. */
export function agentName(lang: UiLang, code: number): string {
  const agent = AGENTS[code]
  if (agent === undefined) return UNKNOWN
  return lang === 'ar' ? agent.nameAr : agent.nameEn
}

/** Display label for an outcome code. */
export function outcomeLabel(lang: UiLang, code: number): string {
  const id = OUTCOMES[code]
  if (id === undefined) return UNKNOWN
  return OUTCOME_LABELS[id][lang]
}

/** Display label for a handoff-reason code. */
export function handoffLabel(lang: UiLang, code: number): string {
  const id = HANDOFF_REASONS[code]
  if (id === undefined) return UNKNOWN
  return HANDOFF_LABELS[id][lang]
}

/** Display label for a language code. */
export function languageLabel(lang: UiLang, code: number): string {
  const id = LANGUAGES[code]
  if (id === undefined) return UNKNOWN
  return LANGUAGE_LABELS[id][lang]
}
