import { chmod, link, mkdir, readdir, stat, unlink } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

import Database from 'better-sqlite3'

const BACKUP_NAME = /^termspace-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z\.sqlite3$/

export interface DatabaseBackupOptions {
  readonly sourcePath: string
  readonly backupDirectory: string
  readonly retentionCount: number
  readonly now?: () => Date
}

export interface DatabaseBackupResult {
  readonly path: string
  readonly pages: number
  readonly removed: readonly string[]
}

/** Create a transactionally consistent snapshot of a live WAL database. */
export async function createDatabaseBackup(
  options: DatabaseBackupOptions,
): Promise<DatabaseBackupResult> {
  const sourcePath = resolve(options.sourcePath)
  const backupDirectory = resolve(options.backupDirectory)
  await assertRegularFile(sourcePath)
  await mkdir(backupDirectory, { recursive: true, mode: 0o700 })
  await chmod(backupDirectory, 0o700)

  const timestamp = (options.now ?? (() => new Date()))().toISOString().replaceAll(':', '-')
  const destination = join(backupDirectory, `termspace-${timestamp}.sqlite3`)
  const partial = join(backupDirectory, `.termspace-${randomUUID()}.partial`)
  let source: Database.Database | null = null
  try {
    source = new Database(sourcePath, { readonly: true, fileMustExist: true })
    const metadata = await source.backup(partial)
    source.close()
    source = null

    verifyDatabaseBackup(partial)
    await chmod(partial, 0o600)
    // Hard-linking publishes without replacing an equally named snapshot.
    // Both paths are in one directory, so this is an atomic same-filesystem step.
    await link(partial, destination)
    await unlink(partial)
    const removed = await pruneBackups(backupDirectory, options.retentionCount)
    return { path: destination, pages: metadata.totalPages, removed }
  } catch (error) {
    source?.close()
    await unlink(partial).catch(() => {})
    throw error
  }
}

/** Refuse a corrupt or non-database file before an operator restores it. */
export function verifyDatabaseBackup(path: string): void {
  const database = new Database(resolve(path), { readonly: true, fileMustExist: true })
  try {
    const rows = database.pragma('quick_check') as { quick_check: string }[]
    if (rows.length !== 1 || rows[0]?.quick_check !== 'ok') {
      throw new Error(`SQLite quick_check failed for ${basename(path)}`)
    }
  } finally {
    database.close()
  }
}

async function pruneBackups(
  backupDirectory: string,
  retentionCount: number,
): Promise<readonly string[]> {
  const names = (await readdir(backupDirectory))
    .filter((name) => BACKUP_NAME.test(name))
    .sort()
  const removed = names.slice(0, Math.max(0, names.length - retentionCount))
  await Promise.all(removed.map((name) => unlink(join(backupDirectory, name))))
  return removed
}

async function assertRegularFile(path: string): Promise<void> {
  const details = await stat(path)
  if (!details.isFile()) {
    throw new Error(`Database source is not a regular file: ${path}`)
  }
}
