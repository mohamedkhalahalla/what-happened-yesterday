/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // Library/logic tests are pure TS and need no DOM.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
