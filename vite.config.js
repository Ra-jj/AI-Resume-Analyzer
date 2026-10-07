import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The security headers Vercel sends with every response, read from
// vercel.json so `vite preview` (and the e2e tests it serves) runs under the
// same ones. vercel.json stays the single place they are defined.
function readVercelHeaders() {
  const vercelConfig = JSON.parse(
    readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'),
  )
  const allRoutes = vercelConfig.headers?.find((rule) => rule.source === '/(.*)')
  if (!allRoutes) {
    throw new Error('vercel.json has no headers rule for "/(.*)"')
  }
  return Object.fromEntries(allRoutes.headers.map(({ key, value }) => [key, value]))
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  preview: {
    headers: readVercelHeaders(),
  },
  // Read by Vitest only; `vite build` ignores it. The tested code is plain
  // JavaScript with no DOM, so tests run in Node.
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
})
