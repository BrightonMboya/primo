import { randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Product photos.
 *
 * With SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY: stored in Supabase Storage
 * (public bucket, created automatically on first upload).
 * Without them (local development): saved in ./data/uploads, served by /api/photos/<file>.
 */
export const LOCAL_UPLOAD_DIR = path.join(process.env.PRIMO_DATA_DIR ?? path.resolve(process.cwd(), 'data'), 'uploads')

function supabase() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '')
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return { url, key, bucket: process.env.SUPABASE_BUCKET || 'primo-photos' }
}

let bucketReady = false

/** Creates the public photo bucket once if it does not exist yet. */
async function ensureBucket(s: NonNullable<ReturnType<typeof supabase>>) {
  if (bucketReady) return
  const headers = { authorization: `Bearer ${s.key}`, apikey: s.key, 'content-type': 'application/json' }
  const found = await fetch(`${s.url}/storage/v1/bucket/${s.bucket}`, { headers })
  if (!found.ok) {
    const created = await fetch(`${s.url}/storage/v1/bucket`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: s.bucket, name: s.bucket, public: true, file_size_limit: 3 * 1024 * 1024, allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp'] }),
    })
    if (!created.ok && created.status !== 409) throw new Error(`Could not create the photo bucket (${created.status}).`)
  }
  bucketReady = true
}

/** Saves a data: URL image and returns the URL to show it. */
export async function savePhoto(dataUrl: string): Promise<string> {
  const match = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(dataUrl)
  if (!match) throw new Error('Photo must be a JPEG, PNG or WebP image.')
  const body = Buffer.from(match[2], 'base64')
  if (body.length > 3 * 1024 * 1024) throw new Error('Photo is too large (max 3 MB).')
  const ext = match[1] === 'jpeg' ? 'jpg' : match[1]
  const file = `${randomBytes(10).toString('hex')}.${ext}`

  const s = supabase()
  if (s) {
    await ensureBucket(s)
    const key = `products/${file}`
    const res = await fetch(`${s.url}/storage/v1/object/${s.bucket}/${key}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${s.key}`,
        apikey: s.key,
        'content-type': `image/${match[1]}`,
        'cache-control': '31536000',
      },
      body,
    })
    if (!res.ok) throw new Error(`Photo upload failed (${res.status}). Check the Supabase storage settings.`)
    return `${s.url}/storage/v1/object/public/${s.bucket}/${key}`
  }

  mkdirSync(LOCAL_UPLOAD_DIR, { recursive: true })
  writeFileSync(path.join(LOCAL_UPLOAD_DIR, file), body)
  return `/api/photos/${file}`
}
