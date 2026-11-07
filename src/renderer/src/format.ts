const UNITS: Record<string, string[]> = {
  fr: ['Ko', 'Mo', 'Go'],
  en: ['KB', 'MB', 'GB']
}

/** A size in the person's language: kilobytes at least, one decimal from megabytes on. */
export function formatSize(bytes: number, language: string): string {
  const [kb, mb, gb] = UNITS[language] ?? UNITS['en']!
  const decimal = (value: number): string => value.toLocaleString(language, { maximumFractionDigits: 1, minimumFractionDigits: 1 })
  if (bytes >= 1024 ** 3) {
    return `${decimal(bytes / 1024 ** 3)} ${gb}`
  }
  if (bytes >= 1024 ** 2) {
    return `${decimal(bytes / 1024 ** 2)} ${mb}`
  }
  return `${Math.max(1, Math.round(bytes / 1024))} ${kb}`
}
