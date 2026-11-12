import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { existsSync } from 'node:fs'

// Local settings (DATABASE_URL, BETTER_AUTH_SECRET, S3_*). On Vercel these come from the dashboard.
if (existsSync('.env')) process.loadEnvFile('.env')

// On Vercel (VERCEL=1 is set automatically) Nitro produces the serverless output.
// Everywhere else the plain Node build runs with `npm start` (serve.mjs).
const onVercel = !!process.env.VERCEL
// Run the server next to the database (Supabase, Paris). Vercel's default is Washington,
// which would add a transatlantic trip to every database query.
const VERCEL_REGION = 'cdg1'

export default defineConfig({
  // allowedHosts: lets a temporary Cloudflare tunnel reach the dev server for phone testing.
  server: { host: true, port: 3210, strictPort: true, allowedHosts: ['.trycloudflare.com'] },
  resolve: { tsconfigPaths: true },
  ssr: { external: ['@electric-sql/pglite'] },
  // The scanner library is loaded on demand; pre-bundle it so the dev server
  // doesn't stop to re-optimize (and reload the page) the first time the camera opens.
  optimizeDeps: { include: ['html5-qrcode', 'qrcode'] },
  plugins: [tanstackStart(), ...(onVercel ? [nitro({ preset: 'vercel', vercel: { functions: { regions: [VERCEL_REGION] } } })] : []), viteReact()],
})
