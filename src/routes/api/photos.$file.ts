import { createFileRoute } from '@tanstack/react-router'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const TYPES: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

/** Local development photos only. In production photos are served by the storage bucket. */
export const Route = createFileRoute('/api/photos/$file')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { currentUser } = await import('~/server/session.server')
        const { LOCAL_UPLOAD_DIR } = await import('~/server/storage.server')
        if (!(await currentUser())) return new Response('Sign in first', { status: 401 })
        const name = params.file
        if (!/^[a-f0-9]{20}\.(jpg|png|webp)$/.test(name)) return new Response('Not found', { status: 404 })
        try {
          const buf = await readFile(path.join(LOCAL_UPLOAD_DIR, name))
          return new Response(buf, {
            headers: { 'content-type': TYPES[name.split('.').pop()!], 'cache-control': 'private, max-age=31536000, immutable' },
          })
        } catch {
          return new Response('Not found', { status: 404 })
        }
      },
    },
  },
})
