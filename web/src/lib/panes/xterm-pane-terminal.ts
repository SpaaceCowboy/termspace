'use client'

import type { PaneDisposable, PaneSize, PaneTerminal } from './pane-store.ts'
import type { TerminalAppearance } from '@/lib/appearance.ts'

const SCROLLBACK_LINES = 5_000

const FONT_FAMILY = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace'

/**
 * Must track `--ts-bg-sunken`, `--ts-text` and `--ts-accent` in `globals.css`.
 * xterm paints its own background, so a mismatch here shows up as a seam
 * between the pane and the terminal inside it. The app is dark only, so there
 * is one theme rather than a pair.
 */
const TERMINAL_THEME = {
  background: '#0b0d12',
  foreground: '#e4e6eb',
  cursor: '#7c8cf8',
  cursorAccent: '#0b0d12',
  selectionBackground: '#2b3350',
}

const SLATE_THEME = {
  background: '#161a22',
  foreground: '#f1f3f7',
  cursor: '#9aa8ff',
  cursorAccent: '#161a22',
  selectionBackground: '#3a4568',
}

/**
 * The real `xterm.js` behind `PaneTerminal`. Everything here is browser-only —
 * the store itself stays free of it so it can be tested without a DOM.
 *
 * Termspace deliberately uses xterm's built-in DOM renderer. xterm 6's WebGL
 * renderer and DOM renderer can calculate different cell widths, and switching
 * between them as focus moves corrupts glyph and cursor placement. Reliability
 * matters more than GPU acceleration for four bounded panes.
 */
export async function createXtermPaneTerminal(): Promise<PaneTerminal> {
  const [{ Terminal }, { FitAddon }, { SerializeAddon }] = await Promise.all([
    import('@xterm/xterm'),
    import('@xterm/addon-fit'),
    import('@xterm/addon-serialize'),
  ])

  const terminal = new Terminal({
    cursorBlink: true,
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    lineHeight: 1.2,
    scrollback: SCROLLBACK_LINES,
    theme: TERMINAL_THEME,
  })

  const fitAddon = new FitAddon()
  const serializeAddon = new SerializeAddon()
  terminal.loadAddon(fitAddon)
  terminal.loadAddon(serializeAddon)

  let opened = false
  let disposed = false

  return {
    write(data: string | Uint8Array): void {
      terminal.write(data)
    },
    flush(): Promise<void> {
      // xterm parses writes on its own schedule; the callback is the only
      // point at which everything queued is guaranteed to be in the buffer.
      return new Promise((resolve) => {
        terminal.write('', () => {
          resolve()
        })
      })
    },
    reset(): void {
      terminal.reset()
    },
    open(container: HTMLElement): void {
      terminal.open(container)
      opened = true
    },
    focus(): void {
      if (disposed || !opened) {
        return
      }
      terminal.focus()
    },
    serialize(): string {
      return serializeAddon.serialize({ scrollback: SCROLLBACK_LINES })
    },
    scrollOffsetFromBottom(): number {
      const buffer = terminal.buffer.active
      return Math.max(0, buffer.baseY - buffer.viewportY)
    },
    restoreScrollOffset(offset: number): void {
      const buffer = terminal.buffer.active
      terminal.scrollToLine(Math.max(0, buffer.baseY - offset))
    },
    applyAppearance(appearance: TerminalAppearance): void {
      terminal.options.fontSize = appearance.fontSize
      terminal.options.theme = appearance.theme === 'slate' ? SLATE_THEME : TERMINAL_THEME
      if (opened) {
        try { fitAddon.fit() } catch { /* The pane may be between layout hosts. */ }
      }
    },
    resize(size: PaneSize): void {
      if (!disposed) terminal.resize(size.cols, size.rows)
    },
    fit(): PaneSize | null {
      if (!opened) {
        return null
      }
      try {
        fitAddon.fit()
      } catch {
        return null
      }
      return { cols: terminal.cols, rows: terminal.rows }
    },
    onData(handler: (data: string) => void): PaneDisposable {
      const subscription = terminal.onData(handler)
      return {
        dispose: () => {
          subscription.dispose()
        },
      }
    },
    dispose(): void {
      disposed = true
      terminal.dispose()
    },
  }
}
