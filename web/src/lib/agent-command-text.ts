/**
 * A launch command is argv, but a text field is a string. These two turn one
 * into the other without ever involving a shell — the server execs the array
 * directly, so quoting here is only about letting an argument contain a space,
 * not about escaping anything dangerous.
 *
 * Deliberately smaller than shell quoting: single and double quotes group, a
 * backslash escapes the next character, and nothing else is special. No
 * variable expansion, no globbing, no operators — none of which would do
 * anything, since nothing interprets the result.
 */
export class CommandTextError extends Error {}

export function parseCommandText(text: string): readonly string[] {
  const argv: string[] = []
  let current = ''
  let started = false
  let quote: '"' | "'" | null = null

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]

    if (character === '\\') {
      const next = text[index + 1]
      if (next === undefined) {
        throw new CommandTextError('The command ends with a dangling backslash.')
      }
      current += next
      started = true
      index += 1
      continue
    }

    if (quote !== null) {
      if (character === quote) {
        quote = null
        continue
      }
      current += character
      continue
    }

    if (character === '"' || character === "'") {
      quote = character
      // An empty quoted string is still an argument.
      started = true
      continue
    }

    if (character === ' ' || character === '\t' || character === '\n') {
      if (started) {
        argv.push(current)
        current = ''
        started = false
      }
      continue
    }

    current += character
    started = true
  }

  if (quote !== null) {
    throw new CommandTextError('The command has an unclosed quote.')
  }
  if (started) {
    argv.push(current)
  }
  return argv
}

/** The inverse, quoting only the arguments that would not survive a round trip. */
export function formatCommand(argv: readonly string[]): string {
  return argv.map(quoteArgument).join(' ')
}

function quoteArgument(argument: string): string {
  if (argument === '') {
    return "''"
  }
  if (!/[\s'"\\]/.test(argument)) {
    return argument
  }
  return `'${argument.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`
}
