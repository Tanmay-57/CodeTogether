import pino from 'pino'

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: ['req.headers.authorization', 'ticket', 'sdp', 'candidate', 'credential', 'turnCredential'],
    censor: '[redacted]',
  },
})
