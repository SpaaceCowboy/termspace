import type { AgentKind } from '@termspace/contracts'

/**
 * What "this session is waiting for a person" looks like, per agent.
 *
 * `docs/ARCHITECTURE.md` lists a bare shell `$` among these. It is deliberately
 * absent here: a shell sitting at its prompt is the resting state, not a
 * request, and treating it as `needs-you` would put every idle shell into the
 * one state that is meant to buzz a phone. The exit criteria for this phase is
 * a notification when an *agent asks a permission question*; a rule that fires
 * on every shell prompt makes that signal worthless.
 *
 * So `shell` has no patterns and never reaches `needs-you`. It moves between
 * `working` and `idle` only, which is all a shell can honestly report.
 *
 * These match the *trailing* non-empty line of the visible buffer, already
 * stripped of ANSI escapes.
 */
const CLAUDE_PATTERNS: readonly RegExp[] = [
  // The numbered permission prompt: "❯ 1. Yes, I trust this folder" and the
  // "Do you want to proceed?" family. Matching the cursor plus a numbered
  // option is what distinguishes a question from a numbered list in output.
  /^[❯>]\s*\d+[.)]\s+\S/u,
  /\b(do you want to|would you like to|proceed\?|allow this|approve)\b/iu,
  // "Enter to confirm · Esc to cancel" — the footer of an open prompt.
  /\benter to (confirm|continue)\b/iu,
]

const CODEX_PATTERNS: readonly RegExp[] = [
  /^[❯>]\s*\d+[.)]\s+\S/u,
  /\b(allow|approve|confirm|proceed)\b.*\?\s*$/iu,
  /\[y\/n\]\s*$/iu,
]

const PATTERNS: Record<AgentKind, readonly RegExp[]> = {
  claude: CLAUDE_PATTERNS,
  codex: CODEX_PATTERNS,
  shell: [],
}

/** Everything a terminal writes that is not a character on screen. */
const ANSI = /[][[\]()#;?]*(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]/gu

export function stripAnsi(text: string): string {
  return text.replaceAll(ANSI, '')
}

/**
 * How many non-empty lines at the end of the screen count as "the prompt".
 *
 * `docs/ARCHITECTURE.md` says the trailing line, which is too narrow to work: a
 * real permission prompt is a block — a question, then numbered options, then a
 * footer — so the literal last line is usually the final option ("2. No, exit")
 * and carries none of the signal. Six covers the prompts in the wild without
 * reaching far enough back to match ordinary output.
 */
const PROMPT_BLOCK_LINES = 6

/**
 * The last lines with anything on them, nearest-last. A prompt is normally
 * followed by blank padding, so the literal last line is nearly always empty.
 */
export function trailingLines(screen: string, limit = PROMPT_BLOCK_LINES): readonly string[] {
  const found: string[] = []
  const lines = stripAnsi(screen).split('\n')
  for (let index = lines.length - 1; index >= 0 && found.length < limit; index -= 1) {
    const line = lines[index]?.trim() ?? ''
    if (line !== '') {
      found.push(line)
    }
  }
  return found.reverse()
}

/** The single last non-empty line. Kept for callers that want exactly that. */
export function trailingLine(screen: string): string {
  return trailingLines(screen, 1)[0] ?? ''
}

export function matchesPrompt(agent: AgentKind, screenOrLine: string): boolean {
  const patterns = PATTERNS[agent]
  if (patterns.length === 0) {
    return false
  }
  return trailingLines(screenOrLine).some((line) =>
    patterns.some((pattern) => pattern.test(line)),
  )
}
