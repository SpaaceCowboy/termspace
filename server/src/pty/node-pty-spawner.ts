import { spawn, type IPty } from 'node-pty'

import type { PtySpawner } from './viewer-attachment.js'

export class NodePtySpawner implements PtySpawner {
  spawn(command: string, arguments_: string[]): IPty {
    return spawn(command, arguments_, {
      cols: 200,
      rows: 50,
      name: 'xterm-256color',
      cwd: process.cwd(),
      env: { ...process.env, TERM: 'xterm-256color' },
    })
  }
}
