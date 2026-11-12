// Generates the PWA icons from a simple SVG. Run: node scripts/icons.mjs
import sharp from 'sharp'

// A plain "P" mark: black square, white letter (drawn as a path, no font needed).
const mark = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#111111"/>
  <g transform="translate(${256 - 110 * pad} ${256 - 150 * pad}) scale(${pad})">
    <path fill="#ffffff" d="M0 0h120c66 0 110 40 110 98s-44 98-110 98H62v104H0zM62 54v88h54c34 0 52-17 52-44s-18-44-52-44z"/>
  </g>
</svg>`

const out = 'public/icons'
await sharp(Buffer.from(mark(1))).resize(512).png().toFile(`${out}/icon-512.png`)
await sharp(Buffer.from(mark(1))).resize(192).png().toFile(`${out}/icon-192.png`)
await sharp(Buffer.from(mark(0.78))).resize(512).png().toFile(`${out}/icon-maskable-512.png`)
await sharp(Buffer.from(mark(0.9))).resize(180).png().toFile(`${out}/apple-touch-icon.png`)
console.log('icons written')
