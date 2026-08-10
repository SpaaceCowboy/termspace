interface PasswordChunkResult {
  readonly cancelled: boolean
  readonly completed: boolean
  readonly maskedOutput: string
  readonly value: string
}

export function applyPasswordChunk(
  initialValue: string,
  chunk: string,
): PasswordChunkResult {
  let value = initialValue
  let maskedOutput = ''

  for (const character of chunk) {
    if (character === '\u0003') {
      return { cancelled: true, completed: false, maskedOutput, value }
    }
    if (character === '\r' || character === '\n') {
      return { cancelled: false, completed: true, maskedOutput, value }
    }
    if (character === '\u007f' || character === '\b') {
      if (value.length > 0) {
        value = value.slice(0, -1)
        maskedOutput += '\b \b'
      }
      continue
    }
    if (character >= ' ') {
      value += character
      maskedOutput += '*'
    }
  }

  return { cancelled: false, completed: false, maskedOutput, value }
}

export async function readPassword(
  input: NodeJS.ReadStream = process.stdin,
  output: NodeJS.WriteStream = process.stdout,
): Promise<string> {
  if (!input.isTTY) {
    const chunks: Buffer[] = []
    for await (const chunk of input) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '')
  }

  output.write('Password: ')
  input.setRawMode(true)
  input.setEncoding('utf8')
  input.resume()

  return new Promise<string>((resolve, reject) => {
    let value = ''

    const cleanup = (): void => {
      input.removeListener('data', onData)
      input.setRawMode(false)
      input.pause()
      output.write('\n')
    }

    const onData = (chunk: string | Buffer): void => {
      const result = applyPasswordChunk(value, chunk.toString())
      value = result.value
      output.write(result.maskedOutput)

      if (result.cancelled) {
        cleanup()
        reject(new Error('Password entry cancelled'))
      } else if (result.completed) {
        cleanup()
        resolve(value)
      }
    }

    input.on('data', onData)
  })
}
