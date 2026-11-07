import type { BrowserWindow, Input } from 'electron'

/** The key that puts the window in full screen and takes it out, as in a browser. */
export function isFullScreenToggle(input: Pick<Input, 'type' | 'key' | 'alt' | 'control' | 'shift' | 'meta'>): boolean {
  return input.type === 'keyDown' && input.key === 'F11' && !input.alt && !input.control && !input.shift && !input.meta
}

/**
 * F11 for full screen, and the page told when it enters or leaves it: Windows hides its three buttons there, so the page shows its own
 * way out (a button, and Escape when no dialog is open).
 */
export function followFullScreen(window: BrowserWindow, onChange: (fullScreen: boolean) => void): void {
  window.webContents.on('before-input-event', (event, input) => {
    if (isFullScreenToggle(input)) {
      event.preventDefault()
      window.setFullScreen(!window.isFullScreen())
    }
  })
  window.on('enter-full-screen', () => onChange(true))
  window.on('leave-full-screen', () => onChange(false))
}
