import { defineConfig } from 'vite'

export default defineConfig({
  base: '/MapGen/',
  build: {
    outDir: 'dist',
  },
  server: {
    port: 3000
  }
})
