import { randomBytes } from 'node:crypto'
import { defineConfig, devices } from '@playwright/test'

const ephemeralJwtSecret = randomBytes(48).toString('base64url')

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3000/health/live',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      MONGO_URI: 'mongodb://127.0.0.1:27018/?replicaSet=rs0&directConnection=true',
      DB_NAME: 'carelink_e2e',
      JWT_SECRET: ephemeralJwtSecret,
      APP_ENV: 'public_demo',
      DEVELOPMENT_LOGIN_PASSWORD: 'password123',
      DISABLE_RATE_LIMIT: 'true',
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
