import { z } from 'zod'

const configSchema = z.object({
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  CLIENT_ORIGIN: z.url().refine((value) => {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && url.origin === value
  }, 'CLIENT_ORIGIN doit être une origine HTTP(S), sans chemin.').default('http://localhost:5173'),
  SUPABASE_URL: z.url().refine((value) => {
    const url = new URL(value)
    return url.origin === value && (url.protocol === 'https:'
      || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))
  }, 'Origine HTTPS requise (HTTP autorisé uniquement en local).').optional(),
  SUPABASE_SECRET_KEY: z.string().min(1).optional(),
  SUPABASE_STORAGE_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/).optional(),
}).superRefine((config, context) => {
  const values = [config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, config.SUPABASE_STORAGE_BUCKET]
  if (values.some(Boolean) && !values.every(Boolean)) {
    context.addIssue({ code: 'custom', message: 'Configurer ensemble SUPABASE_URL, SUPABASE_SECRET_KEY et SUPABASE_STORAGE_BUCKET.' })
  }
})

export function readConfig(environment: NodeJS.ProcessEnv = process.env) {
  const result = configSchema.safeParse(environment)
  if (!result.success) {
    throw new Error(`Configuration invalide : ${z.prettifyError(result.error)}`)
  }
  return result.data
}
