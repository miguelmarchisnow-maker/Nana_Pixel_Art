import type { RGBA } from './types'
import { fromHex, toHex, rgba } from './color'

const P = (...hexes: string[]): RGBA[] => hexes.map((h) => fromHex(h)!).filter((c) => c !== null)

/* ── Paletas embutidas ───────────────────────────────────────────────────── */

export const DB32 = P(
  '000000', '222034', '45283c', '663931', '8f563b', 'df7126', 'd9a066', 'eec39a',
  'fbf236', '99e550', '6abe30', '37946e', '4b692f', '524b24', '323c39', '3f3f74',
  '306082', '5b6ee1', '639bff', '5fcde4', 'cbdbfc', 'ffffff', '9badb7', '847e87',
  '696a6a', '595652', '76428a', 'ac3232', 'd95763', 'd77bba', '8f974a', '8a6f30',
)

export const DB16 = P(
  '140c1c', '442434', '30346d', '4e4a4e', '854c30', '346524', 'd04648', '757161',
  '597dce', 'd27d2c', '8595a1', '6daa2c', 'd2aa99', '6dc2ca', 'dad45e', 'deeed6',
)

export const PICO8 = P(
  '000000', '1d2b53', '7e2553', '008751', 'ab5236', '5f574f', 'c2c3c7', 'fff1e8',
  'ff004d', 'ffa300', 'ffec27', '00e436', '29adff', '83769c', 'ff77a8', 'ffccaa',
)

export const GAMEBOY = P('0f380f', '306230', '8bac0f', '9bbc0f')

export const NES = P(
  '7c7c7c', '0000fc', '0000bc', '4428bc', '940084', 'a80020', 'a81000', '881400',
  '503000', '007800', '006800', '005800', '004058', '000000', 'bcbcbc', '0078f8',
  '0058f8', '6844fc', 'd800cc', 'e40058', 'f83800', 'e45c10', 'ac7c00', '00b800',
  '00a800', '00a844', '008888', 'f8f8f8', '3cbcfc', '6888fc', '9878f8', 'f878f8',
  'f85898', 'f87858', 'fca044', 'f8b800', 'b8f818', '58d854', '58f898', '00e8d8',
  'fcfcfc', 'a4e4fc', 'b8b8f8', 'd8b8f8', 'f8b8f8', 'f8a4c0', 'f0d0b0', 'fce0a8',
  'f8d878', 'd8f878', 'b8f8b8', 'b8f8d8', '00fcfc', 'f8d8f8',
)

export const ENDESGA32 = P(
  'be4a2f', 'd77643', 'ead4aa', 'e4a672', 'b86f50', '733e39', '3e2731', 'a22633',
  'e43b44', 'f77622', 'feae34', 'fee761', '63c74d', '3e8948', '265c42', '193c3e',
  '124e89', '0099db', '2ce8f5', 'ffffff', 'c0cbdc', '8b9bb4', '5a6988', '3a4466',
  '262b44', '181425', 'ff0044', '68386c', 'b55088', 'f6757a', 'e8b796', 'c28569',
)

export const SWEETIE16 = P(
  '1a1c2c', '5d275d', 'b13e53', 'ef7d57', 'ffcd75', 'a7f070', '38b764', '257179',
  '29366f', '3b5dc9', '41a6f6', '73eff7', 'f4f4f4', '94b0c2', '566c86', '333c57',
)

/** Rampa de cinzas de 16 tons */
export const GRAYSCALE: RGBA[] = Array.from({ length: 16 }, (_, i) => {
  const v = Math.round((i * 255) / 15)
  return rgba(v, v, v)
})

export const BUILTIN_PALETTES: { name: string; colors: RGBA[] }[] = [
  { name: 'DawnBringer 32', colors: DB32 },
  { name: 'DawnBringer 16', colors: DB16 },
  { name: 'PICO-8', colors: PICO8 },
  { name: 'Endesga 32', colors: ENDESGA32 },
  { name: 'Sweetie 16', colors: SWEETIE16 },
  { name: 'Game Boy', colors: GAMEBOY },
  { name: 'NES', colors: NES },
  { name: 'Tons de cinza', colors: GRAYSCALE },
]

/* ── Importação ──────────────────────────────────────────────────────────── */

/** Detecta e lê .gpl (GIMP), .pal (JASC), .hex e listas de hex. */
export function parsePaletteFile(text: string): RGBA[] | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim())
  const out: RGBA[] = []

  if (lines[0]?.toUpperCase().startsWith('GIMP PALETTE')) {
    for (const l of lines.slice(1)) {
      if (!l || l.startsWith('#') || /^(name|columns):/i.test(l)) continue
      const m = l.match(/^(\d+)\s+(\d+)\s+(\d+)/)
      if (m) out.push(rgba(+m[1], +m[2], +m[3]))
    }
    return out.length ? out : null
  }

  if (lines[0]?.toUpperCase() === 'JASC-PAL') {
    for (const l of lines.slice(3)) {
      const m = l.match(/^(\d+)\s+(\d+)\s+(\d+)/)
      if (m) out.push(rgba(+m[1], +m[2], +m[3]))
    }
    return out.length ? out : null
  }

  // .hex ou qualquer lista de códigos hexadecimais
  for (const l of lines) {
    if (!l || l.startsWith('#') === false && !/^[0-9a-fA-F]{6,8}$/.test(l.replace(/^#/, ''))) {
      const inline = l.match(/#?[0-9a-fA-F]{6}\b/g)
      if (inline) for (const h of inline) { const c = fromHex(h); if (c !== null) out.push(c) }
      continue
    }
    const c = fromHex(l)
    if (c !== null) out.push(c)
  }
  return out.length ? out : null
}

/* ── Exportação ──────────────────────────────────────────────────────────── */

export function paletteToGpl(colors: RGBA[], name = 'Pixel Painter'): string {
  const head = `GIMP Palette\nName: ${name}\nColumns: 8\n#\n`
  const body = colors
    .map((c) => {
      const r = c & 255, g = (c >>> 8) & 255, b = (c >>> 16) & 255
      return `${String(r).padStart(3)} ${String(g).padStart(3)} ${String(b).padStart(3)}\t${toHex(c)}`
    })
    .join('\n')
  return head + body + '\n'
}

export const paletteToHex = (colors: RGBA[]): string =>
  colors.map((c) => toHex(c).slice(1)).join('\n') + '\n'

/* ── Quantização (para GIF e modo indexado) ──────────────────────────────── */

interface Box { colors: number[]; counts: number[] }

/** Median cut: reduz um histograma a no máximo `max` cores. */
export function medianCut(histogram: Map<number, number>, max: number): RGBA[] {
  const colors = [...histogram.keys()]
  const counts = colors.map((c) => histogram.get(c)!)
  if (colors.length <= max) return colors

  let boxes: Box[] = [{ colors, counts }]
  while (boxes.length < max) {
    // Escolhe a caixa com maior extensão de canal
    let bestIdx = -1, bestRange = -1, bestCh = 0
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i]
      if (b.colors.length < 2) continue
      for (let ch = 0; ch < 3; ch++) {
        let mn = 255, mx = 0
        for (const c of b.colors) {
          const v = (c >>> (ch * 8)) & 255
          if (v < mn) mn = v
          if (v > mx) mx = v
        }
        if (mx - mn > bestRange) { bestRange = mx - mn; bestIdx = i; bestCh = ch }
      }
    }
    if (bestIdx < 0 || bestRange <= 0) break

    const box = boxes[bestIdx]
    const order = box.colors
      .map((c, i) => i)
      .sort((a, b) => (((box.colors[a] >>> (bestCh * 8)) & 255) - ((box.colors[b] >>> (bestCh * 8)) & 255)))
    const half = Math.floor(order.length / 2)
    const mk = (idxs: number[]): Box => ({
      colors: idxs.map((i) => box.colors[i]),
      counts: idxs.map((i) => box.counts[i]),
    })
    boxes = [...boxes.slice(0, bestIdx), mk(order.slice(0, half)), mk(order.slice(half)), ...boxes.slice(bestIdx + 1)]
  }

  return boxes
    .filter((b) => b.colors.length > 0)
    .map((b) => {
      let r = 0, g = 0, bl = 0, a = 0, n = 0
      for (let i = 0; i < b.colors.length; i++) {
        const c = b.colors[i], k = b.counts[i]
        r += (c & 255) * k
        g += ((c >>> 8) & 255) * k
        bl += ((c >>> 16) & 255) * k
        a += ((c >>> 24) & 255) * k
        n += k
      }
      return rgba(Math.round(r / n), Math.round(g / n), Math.round(bl / n), Math.round(a / n))
    })
}
