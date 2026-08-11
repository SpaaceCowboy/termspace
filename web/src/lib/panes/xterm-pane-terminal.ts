'use client'

import type { PaneDisposable, PaneSize, PaneTerminal, RendererKind } from './pane-store.ts'

const SCROLLBACK_LINES = 5_000

const FONT_FAMILY = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace'

const DARK_THEME = { background: '#0e1013', foreground: '#e6e6e3', cursor: '#4fd1a5' }
const LIGHT_THEME = { background: '#ecebe7', foreground: '#1c1b19', cursor: '#1f6f5c' }

/**
 * The real `xterm.js` behind `PaneTerminal`. Everything here is browser-only —
 * the store itself stays free of it so it can be tested without a DOM.
 *
 * Note on renderers: `@xterm/addon-canvas` has no release for xterm 6, so the
 * non-WebGL renderer is xterm's own. WebGL is still confined to the focused
 * pane, which is what the rule is protecting: browsers cap live WebGL contexts
 * and a blown context renders blank.
 */
export async function createXtermPaneTerminal(): Promise<PaneTerminal> {
  const [{ Terminal }, { FitAddon }, { SerializeAddon }] = await Promise.all([
    import('@xterm/xterm'),
    import('@xterm/addon-fit'),
    import('@xterm/addon-serialize'),
  ])

  const dark = globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true
  const terminal = new Terminal({
    cursorBlink: true,
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    scrollback: SCROLLBACK_LINES,
    theme: dark ? DARK_THEME : LIGHT_THEME,
  })

  const fitAddon = new FitAddon()
  const serializeAddon = new SerializeAddon()
  terminal.loadAddon(fitAddon)
  terminal.loadAddon(serializeAddon)

  let opened = false
  let renderer: RendererKind = 'dom'
  let webgl: { dispose: () => void } | null = null
  let disposed = false

  const dropWebgl = (): void => {
    webgl?.dispose()
    webgl = null
    renderer = 'dom'
  }

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
    setRenderer(kind: RendererKind): void {
      if (disposed || !opened || kind === renderer) {
        return
      }
      if (kind === 'dom') {
        dropWebgl()
        return
      }
      void (async () => {
        const { WebglAddon } = await import('@xterm/addon-webgl')
        if (disposed || renderer === 'webgl') {
          return
        }
        try {
          const addon = new WebglAddon()
          // A lost context paints nothing at all, so fall back rather than
          // leave the pane blank.
          addon.onContextLoss(() => {
            dropWebgl()
          })
          terminal.loadAddon(addon)
          webgl = addon
          renderer = 'webgl'
        } catch {
          dropWebgl()
        }
      })()
    },
    serialize(): string {
      return serializeAddon.serialize({ scrollback: SCROLLBACK_LINES })
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
      dropWebgl()
      terminal.dispose()
    },
  }
}
