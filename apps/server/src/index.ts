import 'dotenv/config'
import { createCodeTogetherServer } from './server'
import { logger } from './logger'

const server = createCodeTogetherServer()

server.httpServer.listen(server.config.port, () => {
  logger.info({ port: server.config.port, origin: server.config.clientOrigin }, 'CodeTogether server listening')
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void server.close().then(() => process.exit(0))
  })
}
