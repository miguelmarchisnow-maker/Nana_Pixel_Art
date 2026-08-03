/* Gera os ícones do PWA e do APK Android sem dependências externas. */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public')
const ANDROID_RES = join(ROOT, 'android', 'app', 'src', 'main', 'res')
mkdirSync(OUT, { recursive: true })

/* ── Codificador PNG ─────────────────────────────────────────────────────── */

const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(width, height, rgba) {
  const stride = width * 4 + 1
  const raw = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0 // filtro None
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // profundidade
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* ── Arte 16×16 ──────────────────────────────────────────────────────────── */

const BG = '#15161c'
const PAL = {
  1: BG,
  2: '#5b9bff', 3: '#ffcd75', 4: '#ef7d57',
  5: '#a7f070', 6: '#f4f4f4', 7: '#b13e53', 8: '#38b764',
}

const ART = [
  '1111111111111111',
  '1111111111111111',
  '1166111111111111',
  '1166611111133111',
  '1116661111333311',
  '1111666113333111',
  '1111166633311111',
  '1111116663111111',
  '1111266661111111',
  '1112226661111111',
  '1122222661111111',
  '1122222261111111',
  '1177222211118811',
  '1177742211188811',
  '1114444111188111',
  '1111111111111111',
].map((r) => r.split('').map(Number))

const hexToRgb = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
]

/**
 * @param size        lado da imagem em pixels
 * @param opts.inset  fração da imagem ocupada pela arte (1 = tudo)
 * @param opts.bg     cor de fundo, ou null para transparente
 * @param opts.round  recorta em círculo
 */
function render(size, { inset = 1, bg = BG, round = false } = {}) {
  const buf = Buffer.alloc(size * size * 4)

  if (bg) {
    const [r, g, b] = hexToRgb(bg)
    for (let i = 0; i < size * size; i++) {
      buf[i * 4] = r
      buf[i * 4 + 1] = g
      buf[i * 4 + 2] = b
      buf[i * 4 + 3] = 255
    }
  }

  const art = Math.max(16, Math.round((size * inset) / 16) * 16)
  const scale = art / 16
  const off = Math.round((size - art) / 2)
  const c = (size - 1) / 2
  const radius = size / 2

  for (let y = 0; y < art; y++) {
    for (let x = 0; x < art; x++) {
      const px = off + x
      const py = off + y
      if (px < 0 || py < 0 || px >= size || py >= size) continue
      const v = ART[Math.floor(y / scale)][Math.floor(x / scale)]
      if (v === 1) continue // fundo: deixa como está
      const [r, g, b] = hexToRgb(PAL[v])
      const o = (py * size + px) * 4
      buf[o] = r
      buf[o + 1] = g
      buf[o + 2] = b
      buf[o + 3] = 255
    }
  }

  if (round) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (Math.hypot(x - c, y - c) <= radius) continue
        buf[(y * size + x) * 4 + 3] = 0
      }
    }
  }

  return encodePng(size, size, buf)
}

/* ── PWA ─────────────────────────────────────────────────────────────────── */

for (const size of [192, 512]) {
  writeFileSync(join(OUT, `icon-${size}.png`), render(size))
  console.log(`public/icon-${size}.png`)
}

const rects = []
ART.forEach((row, y) =>
  row.forEach((v, x) => {
    if (v === 1) return
    rects.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${PAL[v]}"/>`)
  }),
)
writeFileSync(
  join(OUT, 'favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">` +
    `<rect width="16" height="16" fill="${BG}"/>${rects.join('')}</svg>\n`,
)
console.log('public/favicon.svg')

/* ── Android ─────────────────────────────────────────────────────────────── */

if (!existsSync(ANDROID_RES)) {
  console.log('\n(projeto android ainda não existe — pulei os ícones nativos)')
  process.exit(0)
}

/** densidade → [tamanho do ícone legado, tamanho do adaptativo (108dp)] */
const DENSITIES = {
  mdpi: [48, 108],
  hdpi: [72, 162],
  xhdpi: [96, 216],
  xxhdpi: [144, 324],
  xxxhdpi: [192, 432],
}

for (const [density, [legacy, adaptive]] of Object.entries(DENSITIES)) {
  const dir = join(ANDROID_RES, `mipmap-${density}`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'ic_launcher.png'), render(legacy))
  writeFileSync(join(dir, 'ic_launcher_round.png'), render(legacy, { round: true }))
  // O ícone adaptativo é recortado: a arte precisa caber na zona segura central
  writeFileSync(
    join(dir, 'ic_launcher_foreground.png'),
    render(adaptive, { inset: 0.56, bg: null }),
  )
  console.log(`android mipmap-${density}`)
}

// Fundo do ícone adaptativo
writeFileSync(
  join(ANDROID_RES, 'values', 'ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n</resources>\n`,
)

// O template traz um foreground vetorial que sobrepõe o nosso PNG
const strayForeground = join(ANDROID_RES, 'drawable-v24', 'ic_launcher_foreground.xml')
if (existsSync(strayForeground)) rmSync(strayForeground)

/* Tela de abertura: cor sólida + ícone centralizado, em XML (serve a todas as telas) */
for (const dir of ['drawable', ...['land', 'port'].flatMap((o) =>
  Object.keys(DENSITIES).map((d) => `drawable-${o}-${d}`))]) {
  const png = join(ANDROID_RES, dir, 'splash.png')
  if (existsSync(png)) rmSync(png)
}
writeFileSync(
  join(ANDROID_RES, 'drawable', 'splash.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@color/ic_launcher_background"/>
    <item>
        <bitmap
            android:gravity="center"
            android:src="@mipmap/ic_launcher"/>
    </item>
</layer-list>\n`,
)
console.log('android splash + ícone adaptativo')
