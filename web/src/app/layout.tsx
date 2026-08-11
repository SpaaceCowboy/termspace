import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'

/**
 * xterm ships its own stylesheet and does not work without it: it is what moves
 * `.xterm-helper-textarea` off-screen and positions the rows and viewport.
 * Without it a pane paints nothing and the bare textarea shows up as a small
 * box in the corner. Imported here rather than beside the terminal because
 * global CSS belongs to the root layout.
 */
import '@xterm/xterm/css/xterm.css'

import './globals.css'

export const metadata: Metadata = {
  title: 'Termspace',
  description: 'Terminal sessions that outlive the browser.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f6f4' },
    { media: '(prefers-color-scheme: dark)', color: '#14161a' },
  ],
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
