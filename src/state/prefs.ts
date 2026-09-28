/**
 * Who is looking, and how they like it — persisted across reloads.
 *
 * Every read is defensive. `localStorage` throws outright in some privacy
 * modes, returns `null` on a fresh browser, and returns whatever was there
 * before on an upgraded one. None of those is exceptional enough to break a
 * dashboard over, so every path falls back to the defaults: Abdullah, Arabic.
 *
 * The prefs key carries a `.v1` so a future shape change is a new key rather
 * than a parse failure on old data.
 */

import type { UiLang } from '../lib/format'

export const CURRENT_USER_KEY = 'wy.currentUser'
const PREFS_KEY_PREFIX = 'wy.prefs.v1.'

export type UserId = 'abdullah' | 'vp'

export type AppUser = {
  id: UserId
  /** Message keys, so the name and role are themselves translated. */
  nameKey: 'user.abdullah.name' | 'user.vp.name'
  roleKey: 'user.abdullah.role' | 'user.vp.role'
}

export const USERS: readonly AppUser[] = [
  { id: 'abdullah', nameKey: 'user.abdullah.name', roleKey: 'user.abdullah.role' },
  { id: 'vp', nameKey: 'user.vp.name', roleKey: 'user.vp.role' },
]

export const DEFAULT_USER_ID: UserId = 'abdullah'
export const DEFAULT_LANG: UiLang = 'ar'

/** Per-user preferences. Deliberately small; it is read on every startup. */
export type Prefs = {
  uiLang: UiLang
}

export const DEFAULT_PREFS: Prefs = { uiLang: DEFAULT_LANG }

function isUserId(value: unknown): value is UserId {
  return value === 'abdullah' || value === 'vp'
}

function isUiLang(value: unknown): value is UiLang {
  return value === 'ar' || value === 'en'
}

/** `localStorage` access that cannot throw. Returns null when unavailable. */
function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    // Private browsing, blocked site data, or no window at all.
    return null
  }
}

function writeRaw(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Storage full or blocked. A lost preference is not worth an error.
  }
}

function prefsKey(userId: UserId): string {
  return `${PREFS_KEY_PREFIX}${userId}`
}

/** The stored user, or the default if nothing valid is stored. */
export function loadCurrentUser(): UserId {
  const raw = readRaw(CURRENT_USER_KEY)
  return isUserId(raw) ? raw : DEFAULT_USER_ID
}

export function saveCurrentUser(userId: UserId): void {
  writeRaw(CURRENT_USER_KEY, userId)
}

/**
 * That user's preferences, validated field by field.
 *
 * Anything unparseable or unrecognised falls back rather than throwing — the
 * stored value is user-editable text, so it is untrusted input.
 */
export function loadPrefs(userId: UserId): Prefs {
  const raw = readRaw(prefsKey(userId))
  if (raw === null) return DEFAULT_PREFS

  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_PREFS

    const uiLang = (parsed as { uiLang?: unknown }).uiLang
    return { uiLang: isUiLang(uiLang) ? uiLang : DEFAULT_LANG }
  } catch {
    return DEFAULT_PREFS
  }
}

export function savePrefs(userId: UserId, prefs: Prefs): void {
  writeRaw(prefsKey(userId), JSON.stringify(prefs))
}
