export interface SessionExitCopy {
  readonly title: string
  readonly toast: string
}

export function sessionExitCopy(code: number | null | undefined): SessionExitCopy {
  if (code === undefined || code === null) {
    return {
      title: 'Session ended without an exit status.',
      toast: 'The session ended without reporting an exit status.',
    }
  }
  if (code === 127) return known(code, 'Launch command was not found')
  if (code === 126) return known(code, 'Launch command is not executable')
  if (code === 130) return known(code, 'Session was interrupted')
  if (code === 137) return known(code, 'Session was killed, possibly by its memory limit')
  if (code === 0) {
    return { title: 'Session finished successfully.', toast: 'The session finished successfully.' }
  }
  return {
    title: `Session stopped with exit code ${String(code)}.`,
    toast: `The session stopped with exit code ${String(code)}.`,
  }
}

function known(code: number, message: string): SessionExitCopy {
  return {
    title: `${message} (exit ${String(code)}).`,
    toast: `The ${message.charAt(0).toLowerCase()}${message.slice(1)} (exit ${String(code)}).`,
  }
}
