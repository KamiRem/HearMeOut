import { buildApp } from './app.ts'
import { readConfig } from './config.ts'

const config = readConfig()
const app = buildApp({ clientOrigin: config.CLIENT_ORIGIN, logger: true })

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
