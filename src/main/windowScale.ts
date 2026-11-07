import type { BrowserWindow } from 'electron'

/** The size the pages are drawn for: the window's size at its first opening. */
export const DESIGN_WIDTH = 1180
export const DESIGN_HEIGHT = 780
/** The window's bar at that size; Windows draws its three buttons at the bar's height. */
export const TITLE_BAR_HEIGHT = 46
/** Past this, on a very large screen, the text would be read from across the room. */
export const MAX_SCALE = 1.6

/**
 * How much the page grows in a window of this size: as much as the side that grows the least, so the page laid out for the first size
 * fills a maximized window the same way, never less than that size and in steps of 5 % so a resize does not redraw at every pixel.
 */
export function scaleFor(width: number, height: number): number {
  const ratio = Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT)
  const stepped = Math.floor(ratio * 20) / 20
  return Math.min(MAX_SCALE, Math.max(1, stepped))
}

/** The page follows the window's size: maximized or full screen, the blocks grow instead of leaving empty margins around them. */
export function followWindowSize(window: BrowserWindow, barColour: string, symbolColour: string): void {
  let applied = 0
  const apply = (): void => {
    if (window.isDestroyed()) {
      return
    }
    const [width, height] = window.getContentSize()
    const scale = scaleFor(width, height)
    if (scale === applied) {
      return
    }
    applied = scale
    window.webContents.setZoomFactor(scale)
    // the page's bar grows with it: Windows' buttons are given the same height
    window.setTitleBarOverlay({ color: barColour, symbolColor: symbolColour, height: Math.round(TITLE_BAR_HEIGHT * scale) })
  }
  window.on('resize', apply)
  window.on('enter-full-screen', apply)
  window.on('leave-full-screen', apply)
  // a page loaded again starts at its own zoom
  window.webContents.on('did-finish-load', () => {
    applied = 0
    apply()
  })
}
