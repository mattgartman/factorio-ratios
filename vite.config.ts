import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves the site from /<repo>/; the deploy workflow sets BASE_PATH. Locally it's just /.
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
})
