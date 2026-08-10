import { z } from 'zod'

const UsernameSchema = z.string().min(1, 'Username is required')
const ArgumentsSchema = z
  .union([
    z.tuple([UsernameSchema]),
    z.tuple([z.literal('--'), UsernameSchema]),
  ])
  .transform((arguments_) =>
    arguments_.length === 1 ? arguments_[0] : arguments_[1],
  )

export function parseSeedUserArguments(arguments_: readonly string[]): string {
  return ArgumentsSchema.parse(arguments_)
}
