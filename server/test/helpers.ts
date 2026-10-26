import request from 'supertest'
import type { Express } from 'express'
import { expect } from 'vitest'
import { createApp } from '../app'
import { createDb, createPool, runMigrations, type Db } from '../db/client'
import { seed } from '../db/seed'

export const PASSWORD = 'Demo@2026'

/** Fresh, migrated and seeded test database plus an app instance. */
export async function setup() {
  const pool = createPool(process.env.DATABASE_URL)
  const db: Db = createDb(pool)
  await runMigrations(db)
  await seed(db, { force: true })
  const app: Express = createApp({ db, loginLimit: 1000 })
  const login = async (userId: string) => {
    const agent = request.agent(app)
    const r = await agent.post('/api/auth/login').send({ userId, password: PASSWORD })
    expect(r.status, `login ${userId}: ${JSON.stringify(r.body)}`).toBe(200)
    return agent
  }
  return { pool, db, app, login }
}

/** Gives consent the way the student does: request a one-time password, then approve with it (OTP_DEMO returns the code). */
export async function approveWithOtp(agent: ReturnType<typeof request.agent>, id: string) {
  const otp = await agent.post(`/api/student/requests/${id}/otp`)
  expect(otp.status, JSON.stringify(otp.body)).toBe(201)
  return agent.post(`/api/student/requests/${id}/decide`).send({ status: 'Approved', otp: otp.body.demoCode })
}
