export type DiffLineKind =
  | 'addition'
  | 'context'
  | 'deletion'
  | 'file-header'
  | 'hunk'
  | 'metadata'

export interface DiffLine {
  readonly kind: DiffLineKind
  readonly number: number
  readonly text: string
}

export function parseDiffLines(patch: string): readonly DiffLine[] {
  if (patch === '') {
    return []
  }
  return patch.split('\n').map((text, index) => ({
    kind: classifyDiffLine(text),
    number: index + 1,
    text,
  }))
}

export function classifyDiffLine(line: string): DiffLineKind {
  if (line.startsWith('diff --git ')) return 'file-header'
  if (line.startsWith('@@')) return 'hunk'
  // Headers start with three signs too; classify them before content lines.
  if (line.startsWith('+++') || line.startsWith('---')) return 'metadata'
  if (line.startsWith('+')) return 'addition'
  if (line.startsWith('-')) return 'deletion'
  if (
    line.startsWith('index ') ||
    line.startsWith('new file mode ') ||
    line.startsWith('deleted file mode ') ||
    line.startsWith('similarity index ') ||
    line.startsWith('rename from ') ||
    line.startsWith('rename to ') ||
    line.startsWith('Binary files ')
  ) {
    return 'metadata'
  }
  return 'context'
}
