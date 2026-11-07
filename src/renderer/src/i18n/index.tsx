import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { en, type MessageKey } from './en'
import { fr } from './fr'

export type { MessageKey }

/** Whether a key built at run time (from the settings catalog) has a text. */
export function hasMessage(key: string): key is MessageKey {
  return key in en
}

export const LANGUAGES = ['fr', 'en'] as const
export type Language = (typeof LANGUAGES)[number]

const dictionaries: Record<Language, Record<MessageKey, string>> = { en, fr }
const STORAGE_KEY = 'language'

interface I18nContextValue {
  language: Language
  setLanguage: (language: Language) => void
  /** The text of a key, with each `{name}` replaced by its value. */
  t: (key: MessageKey, values?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value)
}

// The language chosen with the switch, kept from one start to the next; until one is chosen, the system's when the launcher has it, English
// for any other.
function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (isLanguage(saved)) {
      return saved
    }
  } catch {
    // Storage unavailable: the system's language.
  }
  const system = navigator.language.toLowerCase().split('-')[0]
  return isLanguage(system) ? system : 'en'
}

export function LanguageProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [language, setLanguageState] = useState<Language>(initialLanguage)

  useEffect(() => {
    document.documentElement.lang = language
    // the tray's menu and a report's issue text follow it
    void window.launcher?.setLanguage(language)
  }, [language])

  const setLanguage = (next: Language): void => {
    setLanguageState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // The choice simply won't be remembered.
    }
  }

  const t = (key: MessageKey, values?: Record<string, string | number>): string =>
    dictionaries[language][key].replace(/\{(\w+)\}/g, (placeholder, name: string) => String(values?.[name] ?? placeholder))

  return <I18nContext.Provider value={{ language, setLanguage, t }}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error('useI18n must be used inside a LanguageProvider')
  }
  return context
}
