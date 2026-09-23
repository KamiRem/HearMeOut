import { z } from 'zod'

const configSchema = z.object({
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  CLIENT_ORIGIN: z.url().refine((value) => {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && url.origin === value
  }, 'CLIENT_ORIGIN doit être une origine HTTP(S), sans chemin.').default('http://localhost:5173'),
})

export function readConfig(environment: NodeJS.ProcessEnv = process.env) {
  const result = configSchema.safeParse(environment)
  if (!result.success) {
    throw new Error(`Configuration invalide : ${z.prettifyError(result.error)}`)
  }
  return result.data
}
