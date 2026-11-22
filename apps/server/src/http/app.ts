import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import { corsOrigin, type AppConfig } from '../config'
import { logger } from '../logger'

export function createHttpApp(config: AppConfig) {
  const app = express()
  app.disable('x-powered-by')
  app.use(cors({ origin: corsOrigin(config) }))
  app.use(express.json({ limit: '16kb' }))

  app.get('/health', (_request, response) => {
    response.json({ ok: true, service: 'codetogether' })
  })

  app.get('/api/ice', (_request, response) => {
    response.json({
      stunConfigured: config.stunUrls.length > 0,
      turnConfigured: config.turnUrls.length > 0 && Boolean(config.turnUsername && config.turnCredential),
    })
  })

  app.use((_request, response) => {
    response.status(404).json({ ok: false, code: 'NOT_FOUND' })
  })

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    logger.error({ err: error }, 'request failed')
    response.status(500).json({ ok: false, code: 'INTERNAL' })
  })

  return app
}
