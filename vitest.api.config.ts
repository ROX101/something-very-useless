import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['server/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://apaar:apaar@localhost:5432/apaar_sathi_test',
      JWT_SECRET: 'test-secret-test-secret-test-secret',
    },
  },
})
