import { z } from 'zod'

import { createDatabaseBackup } from './backup.js'

const BackupEnvironmentSchema = z.object({
  TERMSPACE_DATABASE_PATH: z.string().min(1),
  TERMSPACE_BACKUP_DIRECTORY: z.string().min(1).default('/var/backups/termspace'),
  TERMSPACE_BACKUP_RETENTION_COUNT: z.coerce.number().int().min(1).max(365).default(14),
})

const environment = BackupEnvironmentSchema.parse(process.env)
const result = await createDatabaseBackup({
  sourcePath: environment.TERMSPACE_DATABASE_PATH,
  backupDirectory: environment.TERMSPACE_BACKUP_DIRECTORY,
  retentionCount: environment.TERMSPACE_BACKUP_RETENTION_COUNT,
})

process.stdout.write(`${JSON.stringify({
  event: 'database_backup_complete',
  path: result.path,
  pages: result.pages,
  removedCount: result.removed.length,
})}\n`)
