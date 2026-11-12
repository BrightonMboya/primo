// Production server: `npm run build && npm start`
// Serves the built files in dist/client and hands everything else to the app.
import { createServer } from 'node:http'
import { createReadStream, statSync } from 'node:fs'
import { Readable } from 'node:stream'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

if (existsSync('.env')) process.loadEnvFile('.env')
const { default: app } = await import('./dist/server/server.js')

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist', 'client')
const port = Number(process.env.PORT ?? 3210)
const host = process.env.HOST ?? '0.0.0.0'

const TYPES = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

function tryStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false
  const url = new URL(req.url, 'http://local')
  const file = path.normalize(path.join(root, decodeURIComponent(url.pathname)))
  if (!file.startsWith(root + path.sep)) return false
  let stat
  try {
    stat = statSync(file)
  } catch {
    return false
  }
  if (!stat.isFile()) return false
  const ext = path.extname(file)
  res.setHeader('content-type', TYPES[ext] ?? 'application/octet-stream')
  res.setHeader('content-length', stat.size)
  // Hashed build files never change; everything else is revalidated.
  res.setHeader('cache-control', url.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache')
  if (url.pathname === '/sw.js') res.setHeader('service-worker-allowed', '/')
  if (req.method === 'HEAD') res.end()
  else createReadStream(file).pipe(res)
  return true
}

const server = createServer(async (req, res) => {
  try {
    if (tryStatic(req, res)) return
    const proto = req.headers['x-forwarded-proto'] ?? 'http'
    const url = `${proto}://${req.headers.host ?? `localhost:${port}`}${req.url}`
    const headers = new Headers()
    for (const [k, v] of Object.entries(req.headers)) {
      if (Array.isArray(v)) v.forEach((x) => headers.append(k, x))
      else if (v != null) headers.set(k, v)
    }
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
    const request = new Request(url, {
      method: req.method,
      headers,
      body: hasBody ? Readable.toWeb(req) : undefined,
      duplex: hasBody ? 'half' : undefined,
    })
    const response = await app.fetch(request)
    res.statusCode = response.status
    response.headers.forEach((value, key) => {
      if (key !== 'set-cookie') res.setHeader(key, value)
    })
    const cookies = response.headers.getSetCookie?.() ?? []
    if (cookies.length) res.setHeader('set-cookie', cookies)
    if (response.body && req.method !== 'HEAD') Readable.fromWeb(response.body).pipe(res)
    else res.end()
  } catch (err) {
    console.error(err)
    if (!res.headersSent) res.statusCode = 500
    res.end('Server error')
  }
})

server.listen(port, host, () => {
  console.log(`Primo is running on http://localhost:${port}`)
})
