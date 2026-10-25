import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

const api = process.env.API_URL ?? 'http://localhost:8080'

export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'phone' ? [basicSsl()] : [])],
  server: { proxy: { '/api': { target: api, changeOrigin: true } } },
  preview: { proxy: { '/api': { target: api, changeOrigin: true } } },
  test: { include: ['src/**/*.test.ts'] },
}))
