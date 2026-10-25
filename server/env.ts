const isProd = process.env.NODE_ENV === 'production'

function required(name: string, devFallback: string): string {
  const v = process.env[name]
  if (v) return v
  if (isProd) throw new Error(`Missing required environment variable ${name}`)
  return devFallback
}

export const env = {
  isProd,
  port: Number(process.env.PORT ?? 8080),
  databaseUrl: required('DATABASE_URL', 'postgres://apaar:apaar@localhost:5432/apaar_sathi'),
  jwtSecret: required('JWT_SECRET', 'dev-only-secret-change-me-dev-only-secret'),
  sessionHours: Number(process.env.SESSION_HOURS ?? 8),
  seedOnBoot: (process.env.SEED_ON_BOOT ?? 'true') !== 'false',
  dbSsl: process.env.DATABASE_SSL === 'true',
  corsOrigin: process.env.CORS_ORIGIN ?? '',
}
