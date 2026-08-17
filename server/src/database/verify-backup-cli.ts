import { resolve } from 'node:path'
import { z } from 'zod'

import { verifyDatabaseBackup } from './backup.js'

const path = z.string().min(1).parse(process.argv[2])
verifyDatabaseBackup(path)
process.stdout.write(`${JSON.stringify({ event: 'database_backup_verified', path: resolve(path) })}\n`)
