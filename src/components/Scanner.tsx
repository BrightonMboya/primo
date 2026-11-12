import { useEffect, useRef, useState } from 'react'

type Html5QrcodeInstance = { start: (...args: any[]) => Promise<unknown>; stop: () => Promise<void>; clear: () => void; isScanning: boolean }

/** Turns a camera error into something staff can act on. */
function cameraError(err: unknown): string {
  const name = (err as { name?: string })?.name ?? ''
  const text = String((err as { message?: string })?.message ?? err ?? '')
  if (name === 'NotAllowedError' || /permission|denied|not allowed/i.test(text))
    return 'Camera access is blocked. Allow the camera for this site in your phone settings, then reload. Or type the code below.'
  if (name === 'NotFoundError' || /not ?found|no camera|Requested device/i.test(text)) return 'No camera found on this device. Type the code below.'
  if (name === 'NotReadableError' || /in use|could not start|NotReadable/i.test(text))
    return 'The camera is busy in another app. Close it and reload. Or type the code below.'
  return 'Could not open the camera. Reload the page, or type the code below.'
}

/**
 * Camera scanner for QR codes (and Code 128 barcodes).
 * Loads the scanning library only in the browser.
 */
export function Scanner({ onCode, paused }: { onCode: (code: string) => void; paused: boolean }) {
  const id = 'primo-scanner'
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const onCodeRef = useRef(onCode)
  const pausedRef = useRef(paused)
  onCodeRef.current = onCode
  pausedRef.current = paused

  useEffect(() => {
    let cancelled = false
    let scanner: Html5QrcodeInstance | null = null
    // Resolves once start() has finished (either way), so cleanup never races with it.
    let started: Promise<unknown> = Promise.resolve()

    setError(null)
    setStarting(true)

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError('The camera only works on the https:// link. Type the code below instead.')
      setStarting(false)
      return
    }

    let last = ''
    let lastAt = 0
    const onScan = (text: string) => {
      const now = Date.now()
      if (pausedRef.current || (text === last && now - lastAt < 2500)) return
      last = text
      lastAt = now
      if (navigator.vibrate) navigator.vibrate(40)
      onCodeRef.current(text)
    }

    started = (async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode')
        if (cancelled) return
        const s = new Html5Qrcode(id, {
          verbose: false,
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE, Html5QrcodeSupportedFormats.CODE_128],
          useBarCodeDetectorIfSupported: true,
        }) as unknown as Html5QrcodeInstance
        scanner = s
        const config = { fps: 12, qrbox: { width: 240, height: 240 } }
        try {
          await s.start({ facingMode: 'environment' }, config, onScan, () => {})
        } catch (err) {
          if (cancelled) return
          // Some phones reject the "back camera" request; try any camera before giving up.
          const name = (err as { name?: string })?.name
          if (name === 'NotAllowedError') throw err
          const cams = await Html5Qrcode.getCameras()
          if (!cams.length) throw err
          const back = cams.find((c) => /back|rear|environment/i.test(c.label)) ?? cams[cams.length - 1]
          await s.start(back.id, config, onScan, () => {})
        }
        if (cancelled && s.isScanning) await s.stop().catch(() => {})
      } catch (err) {
        if (!cancelled) {
          console.error('Scanner failed to start', err)
          setError(cameraError(err))
        }
      } finally {
        if (!cancelled) setStarting(false)
      }
    })()

    return () => {
      cancelled = true
      started.then(async () => {
        if (scanner?.isScanning) await scanner.stop().catch(() => {})
        try {
          scanner?.clear()
        } catch {}
      })
    }
  }, [attempt])

  return (
    <div className="scanner-view">
      <div id={id} key={attempt} style={{ width: '100%', height: '100%' }} />
      {!error && <div className="scanner-frame" />}
      <div className="scanner-hint">
        {error ?? (starting ? 'Opening camera…' : 'Point the camera at the code on the tag')}
        {error && (
          <div style={{ marginTop: 12 }}>
            <button type="button" className="btn" style={{ background: 'rgba(255,255,255,.12)', color: '#fff', borderColor: 'transparent' }} onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
