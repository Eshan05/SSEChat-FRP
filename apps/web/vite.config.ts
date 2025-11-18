import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { fileURLToPath, URL } from 'node:url'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    devtools(),
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    viteReact({
      babel: {
        plugins: ['babel-plugin-react-compiler'],
      },
    }),
    tailwindcss(),
  ],
  resolve: {
    // Keep a `@` alias for local source, and add a manual `@pkg/*` mapping
    // so Vite can resolve imports like `@pkg/my-package/foo` -> `packages/my-package/src/foo`.
    alias: [
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      // Import inside a package: @pkg/my-package/foo -> packages/my-package/foo (no src folder)
      { find: /^@pkg\/([^/]+)\/(.*)$/, replacement: fileURLToPath(new URL('../../packages/$1/$2', import.meta.url)) },
      // Root import: @pkg/my-package -> packages/my-package
      { find: /^@pkg\/(.*)$/, replacement: fileURLToPath(new URL('../../packages/$1', import.meta.url)) },
    ],
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 300,
  },
})
