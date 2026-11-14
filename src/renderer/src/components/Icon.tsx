const PATHS = {
  play: 'M8 5.5v13l10.5-6.5z',
  stop: 'M7 7h10v10H7z',
  restart: 'M12 5a7 7 0 1 1-6.6 4.7l1.9.6A5 5 0 1 0 12 7v3L7.5 6 12 2z',
  log: 'M4 5h16v2H4zm0 4h10v2H4zm0 4h16v2H4zm0 4h10v2H4z',
  more: 'M4 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0zm6 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0zm6 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0z'
} as const

/** A small glyph drawn in the text's colour, beside a button's label (which stays the accessible name). */
export function Icon({ name }: { name: keyof typeof PATHS }): React.JSX.Element {
  return (
    <svg className="icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} fill="currentColor" />
    </svg>
  )
}
