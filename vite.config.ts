import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { syncServer } from './server/sync'

export default defineConfig(({ mode }) => ({
  plugins: [react(), syncServer(), ...(mode === 'phone' ? [basicSsl()] : [])],
}))
