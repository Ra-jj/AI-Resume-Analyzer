import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Read by Vitest only; `vite build` ignores it. The tested code is plain
  // JavaScript with no DOM, so tests run in Node.
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
})
