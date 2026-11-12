// Builds samples/qr-codes.html: test QR codes to scan with a phone.
import { writeFileSync } from 'node:fs'
import QRCode from 'qrcode'

const items = [
  { code: 'PRM-0001-WHI-S', name: 'Ribbed bodysuit', detail: 'White · S · 18,000 RWF' },
  { code: 'PRM-0001-RED-M', name: 'Ribbed bodysuit', detail: 'Red · M · 18,000 RWF' },
  { code: 'PRM-0001-KHA-L', name: 'Ribbed bodysuit', detail: 'Khaki · L · 18,000 RWF' },
  { code: 'PRM-0002-RED-S', name: 'Wide-leg pant', detail: 'Red · S · 22,000 RWF' },
  { code: 'PRM-0002-BLA-M', name: 'Wide-leg pant', detail: 'Black · M · 22,000 RWF' },
  { code: 'PRM-0004-LIG-XL', name: 'Denim jacket', detail: 'Light wash · XL · 45,000 RWF' },
]

const svg = (text) => QRCode.toString(text, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#111111', light: '#ffffff' } })

const big = await Promise.all(items.slice(0, 2).map(async (i) => ({ ...i, svg: await svg(i.code) })))
const labels = await Promise.all(items.map(async (i) => ({ ...i, svg: await svg(i.code) })))
const product = await svg('PRM-0001')
const unknown = await svg('PRM-9999-XXX-S')

const label = (i) => `
  <div class="label"><div class="qr">${i.svg}</div>
    <div class="t"><b>${i.name}</b>${i.detail}<small>${i.code}</small></div></div>`

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Primo · Test QR codes</title>
<style>
  body { font-family: Inter, system-ui, sans-serif; color: #111; background: #fff; margin: 0; padding: 32px 24px 64px; }
  .wrap { max-width: 900px; margin: 0 auto; }
  h1 { font-size: 26px; font-weight: 600; margin: 0 0 6px; }
  h2 { font-size: 17px; font-weight: 600; margin: 40px 0 4px; }
  p { color: #6b6b6b; margin: 0 0 16px; line-height: 1.5; }
  ol { color: #444; line-height: 1.7; padding-left: 20px; }
  .row { display: flex; flex-wrap: wrap; gap: 20px; }
  .card { border: 1px solid #e5e5e5; border-radius: 12px; padding: 16px; text-align: center; }
  .card .qr { width: 6cm; height: 6cm; }
  .card .mid { width: 3cm; height: 3cm; margin: 0 auto; }
  .code { font-size: 13px; color: #444; margin-top: 10px; letter-spacing: 0.04em; }
  .qr svg { width: 100%; height: 100%; display: block; }
  /* Real label size: 50 x 30 mm, QR 24 mm */
  .label { width: 50mm; height: 30mm; border: 1px dashed #ccc; border-radius: 2mm; display: flex; align-items: center; gap: 2.5mm; padding: 2mm 2.5mm; box-sizing: border-box; }
  .label .qr { width: 24mm; height: 24mm; flex-shrink: 0; }
  .label .t { font-size: 8.5pt; line-height: 1.25; min-width: 0; }
  .label .t b { display: block; font-size: 9pt; font-weight: 600; }
  .label .t small { display: block; font-size: 6.5pt; color: #444; margin-top: 1mm; }
  .note { background: #f7f7f7; border-radius: 12px; padding: 14px 16px; color: #444; font-size: 14px; line-height: 1.5; }
</style></head>
<body><div class="wrap">
  <h1>Test QR codes</h1>
  <p>Point your phone at these. Sizes are true to life when this page is shown at 100% zoom on a computer screen.</p>
  <ol>
    <li><b>Quick check:</b> open your phone's normal Camera app and point it at a code. It should show the text, e.g. PRM-0001-RED-M.</li>
    <li><b>In Primo:</b> tap <b>Scan item</b> and point it at a code. If the item exists you'll see it; if not you'll see "No item with code …", which still proves the scan worked.</li>
  </ol>

  <h2>Large</h2>
  <p>Easiest to scan. Start here.</p>
  <div class="row">${big.map((i) => `<div class="card"><div class="qr">${i.svg}</div><div class="code">${i.code}</div></div>`).join('')}</div>

  <h2>Real label size (50 × 30 mm)</h2>
  <p>This is what the printed sticker will look like. Try from about 10–20 cm away.</p>
  <div class="row">${labels.map(label).join('')}</div>

  <h2>Special cases</h2>
  <div class="row">
    <div class="card"><div class="qr mid">${product}</div><div class="code">PRM-0001</div><p style="margin:6px 0 0;font-size:13px">Product code: opens the item's stock page</p></div>
    <div class="card"><div class="qr mid">${unknown}</div><div class="code">PRM-9999-XXX-S</div><p style="margin:6px 0 0;font-size:13px">Unknown code: should say "No item"</p></div>
  </div>

  <h2>Note</h2>
  <div class="note">These codes match Primo's demo items. Your Supabase database is empty right now, so Primo will say "No item" until you add items.
  For a full test, add an item in Primo (<b>+ Add new item</b>). Its <b>Print labels</b> screen shows that item's real QR codes on screen, ready to scan.</div>
</div></body></html>`

writeFileSync('samples/qr-codes.html', html)
console.log('wrote samples/qr-codes.html')
