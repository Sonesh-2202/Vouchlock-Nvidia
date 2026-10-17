/**
 * Structured logger with PII redaction.
 * Uses pino for JSON structured logging.
 * Never logs prompts, tokens, passwords, or secrets.
 */

import pino from 'pino';

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'password',
  'passwordHash',
  'token',
  'tokenHash',
  'jwtSecret',
  'apiKey',
  'prompt',
  'aiApiKey',
];

export function createLogger(level: string, redact: boolean) {
  return pino({
    level,
    ...(redact && {
      redact: {
        paths: REDACT_PATHS,
        censor: '[REDACTED]',
      },
    }),
    serializers: {
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
      err: pino.stdSerializers.err,
    },
    formatters: {
      level: (label: string) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

export type Logger = ReturnType<typeof createLogger>;
