import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The dev proxy follows the PORT in backend/.env (3000 when unset); BACKEND_URL overrides it.
function backendUrl(): string {
  if (process.env.BACKEND_URL) return process.env.BACKEND_URL
  let port = '3000'
  try {
    const env = readFileSync(new URL('../backend/.env', import.meta.url), 'utf-8')
    port = env.match(/^\s*PORT\s*=\s*["']?(\d+)/m)?.[1] ?? port
  } catch {
    // No backend/.env: use the backend's default port
  }
  return `http://127.0.0.1:${port}`
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/auth': {
        target: backendUrl(),
        changeOrigin: true,
      },
      '/api': {
        target: backendUrl(),
        changeOrigin: true,
      },
    },
  },
})
