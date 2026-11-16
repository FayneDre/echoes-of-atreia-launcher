/** Whether a number takes the singular: French puts 0 and 1 in it, English 1 alone. */
function singular(language: string, value: number): boolean {
  return language === 'fr' ? Math.abs(value) < 2 : value === 1
}

/**
 * A text with its values put in: `{name}` is the value, `{name|one|other}` the word for that number in this language ("1 bot",
 * "2 bots"); a value not given leaves its placeholder as it is.
 */
export function formatMessage(text: string, language: string, values?: Record<string, string | number>): string {
  return text.replace(/\{(\w+)(?:\|([^|}]*)\|([^}]*))?\}/g, (placeholder, name: string, one?: string, other?: string) => {
    const value = values?.[name]
    if (value === undefined) {
      return placeholder
    }
    if (one === undefined) {
      return String(value)
    }
    return singular(language, Number(value)) ? one : (other ?? one)
  })
}
