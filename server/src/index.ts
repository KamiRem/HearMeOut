import { buildApp } from './app.ts'
import { readConfig } from './config.ts'
import { SupabaseImageStorage } from './storage/imageStorage.ts'

const config = readConfig()
const imageStorage = config.SUPABASE_URL && config.SUPABASE_SECRET_KEY && config.SUPABASE_STORAGE_BUCKET
  ? new SupabaseImageStorage({ url: config.SUPABASE_URL, key: config.SUPABASE_SECRET_KEY, bucket: config.SUPABASE_STORAGE_BUCKET })
  : undefined
const app = buildApp({ clientOrigin: config.CLIENT_ORIGIN, logger: true, imageStorage })
if (!imageStorage) app.log.warn('Image upload disabled: configure Supabase in server/.env')

let shuttingDown = false
async function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  try {
    await app.close()
  } catch (error) {
    app.log.error(error)
    process.exitCode = 1
  }
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)

try {
  await app.listen({ host: config.HOST, port: config.PORT })
} catch (error) {
  app.log.error(error)
  process.exitCode = 1
  await shutdown()
}
