import type { AgentKind } from '@termspace/contracts'

/**
 * Where a session title comes from, and why it is not a guess.
 *
 * The obvious implementation of "derive a short label from recent output" is a
 * heuristic over the scrollback: take the last command, or the first line that
 * looks like a sentence. Every version of that is wrong for an agent TUI, whose
 * output is a redrawn full-screen buffer rather than a transcript.
 *
 * There is a real signal instead. A program tells its terminal what it is doing
 * with OSC 0/2, tmux records that as `pane_title`, and it can be read
 * out-of-band with `display-message` — no escape parsing, and it works whether
 * or not anyone is attached. Claude Code publishes a genuine task summary there
 * ("◑ Count markdown files in docs"), updated about a second into each turn.
 *
 * So this module is not a guesser. It takes what the program already said and
 * decides whether it carries information, because the default value of
 * `pane_title` and the titles a stock shell sets carry none.
 */

/** Long enough for a real task summary, short enough for a tab. */
export const TITLE_MAX_LENGTH = 72

/**
 * Leading decoration an agent puts in front of its title to show liveness —
 * Claude Code alternates ◑ while working and ✳ at rest for the *same* task.
 * Left in, the title would appear to change on every turn and we would emit a
 * frame each time saying nothing new.
 */
const LEADING_DECORATION = /^[\p{Extended_Pictographic}\p{So}\p{Sk}\s]+/u

/**
 * The title a stock shell sets from `PROMPT_COMMAND`: `user@host:/some/path`.
 * It is not a task, and every part of it is something the UI already shows.
 */
const SHELL_PROMPT_TITLE = /^[^@\s]+@[^:\s]+:\S*$/u

/**
 * Titles that name the program rather than the work. An agent sitting at its
 * prompt with nothing to report says this, and it is worse than no title: it
 * would replace a real title from the previous turn with a constant.
 */
const AGENT_NAME_TITLES: Record<AgentKind, readonly RegExp[]> = {
  claude: [/^claude(\s+code)?$/iu],
  codex: [/^codex(\s+cli)?$/iu],
  shell: [],
}

export interface DeriveTitleOptions {
  /**
   * tmux's default `pane_title` is the hostname, so on a box called `Bebop`
   * every session claims to be called `Bebop` until something sets a title.
   */
  readonly hostname: string
}

/**
 * A title worth showing, or `null` to keep whatever the session already had.
 *
 * Returning `null` rather than an empty string is the point: "this pane has
 * nothing to say" must not overwrite a good title with a blank one.
 */
export function deriveTitle(
  agent: AgentKind,
  paneTitle: string,
  options: DeriveTitleOptions,
): string | null {
  const stripped = paneTitle.replace(LEADING_DECORATION, '').trim()
  if (stripped === '') {
    return null
  }
  if (stripped === options.hostname) {
    return null
  }
  if (SHELL_PROMPT_TITLE.test(stripped)) {
    return null
  }
  if (AGENT_NAME_TITLES[agent].some((pattern) => pattern.test(stripped))) {
    return null
  }
  // Collapse the whitespace a redrawn TUI leaves behind before measuring, or a
  // title padded to the pane width would truncate to nothing but spaces.
  const collapsed = stripped.replaceAll(/\s+/gu, ' ')
  return collapsed.length <= TITLE_MAX_LENGTH
    ? collapsed
    : `${collapsed.slice(0, TITLE_MAX_LENGTH - 1).trimEnd()}…`
}
