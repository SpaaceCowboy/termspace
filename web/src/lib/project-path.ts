/**
 * The directory a project name suggests, under the server's project root.
 * Mirrors the server's `slugify` closely enough to be a helpful default — the
 * server still decides, and the field stays editable.
 */
export function suggestProjectPath(projectRoot: string | null, name: string): string {
  const slug = slugifyForPath(name)
  if (projectRoot === null || slug === '') {
    return ''
  }
  return `${projectRoot.replace(/\/+$/, '')}/${slug}`
}

export function slugifyForPath(name: string): string {
  return name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '')
}
