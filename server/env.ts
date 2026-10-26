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
  /** Encrypts university signing keys at rest. Falls back to JWT_SECRET; set it separately so session-secret rotation does not lock the keys. */
  signingSecret: process.env.SIGNING_KEY_SECRET ?? process.env.JWT_SECRET ?? 'dev-only-secret-change-me-dev-only-secret',
  /** Public base URL used in QR links and status-list URLs, e.g. https://something.up.railway.app. Falls back to the request host. */
  publicUrl: (process.env.PUBLIC_URL ?? '').replace(/\/$/, ''),
  /** Demo only: return one-time passwords in the API response instead of sending an SMS. */
  otpDemo: (process.env.OTP_DEMO ?? 'true') !== 'false',
  sessionHours: Number(process.env.SESSION_HOURS ?? 8),
  seedOnBoot: (process.env.SEED_ON_BOOT ?? 'true') !== 'false',
  dbSsl: process.env.DATABASE_SSL === 'true',
  corsOrigin: process.env.CORS_ORIGIN ?? '',
}
