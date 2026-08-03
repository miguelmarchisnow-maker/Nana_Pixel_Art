import type { RGBA } from './types'

/* ── Empacotamento ───────────────────────────────────────────────────────── */

export const rgba = (r: number, g: number, b: number, a = 255): RGBA =>
  (((a & 255) << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255)) >>> 0

export const getR = (c: RGBA) => c & 255
export const getG = (c: RGBA) => (c >>> 8) & 255
export const getB = (c: RGBA) => (c >>> 16) & 255
export const getA = (c: RGBA) => (c >>> 24) & 255

export const TRANSPARENT: RGBA = 0
export const withAlpha = (c: RGBA, a: number): RGBA => ((c & 0x00ffffff) | ((a & 255) << 24)) >>> 0

/* ── Hex ─────────────────────────────────────────────────────────────────── */

const hex2 = (n: number) => n.toString(16).padStart(2, '0')

export function toHex(c: RGBA, withA = false): string {
  const base = `#${hex2(getR(c))}${hex2(getG(c))}${hex2(getB(c))}`
  return withA ? base + hex2(getA(c)) : base
}

export function fromHex(s: string): RGBA | null {
  let h = s.trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.split('').map((ch) => ch + ch).join('')
  if (/^[0-9a-fA-F]{4}$/.test(h)) h = h.split('').map((ch) => ch + ch).join('')
  if (/^[0-9a-fA-F]{6}$/.test(h)) h += 'ff'
  if (!/^[0-9a-fA-F]{8}$/.test(h)) return null
  return rgba(
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
    parseInt(h.slice(6, 8), 16),
  )
}

/* ── HSV ─────────────────────────────────────────────────────────────────── */

/** h: 0..360, s: 0..1, v: 0..1 */
export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6
    else if (max === gn) h = (bn - rn) / d + 2
    else h = (rn - gn) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return [h, max === 0 ? 0 : d / max, max]
}

export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  h = ((h % 360) + 360) % 360
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let r = 0, g = 0, b = 0
  if (h < 60) { r = c; g = x } else if (h < 120) { r = x; g = c }
  else if (h < 180) { g = c; b = x } else if (h < 240) { g = x; b = c }
  else if (h < 300) { r = x; b = c } else { r = c; b = x }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

/* ── HSL ─────────────────────────────────────────────────────────────────── */

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return [0, 0, l]
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === rn) h = ((gn - bn) / d) % 6
  else if (max === gn) h = (bn - rn) / d + 2
  else h = (rn - gn) / d + 4
  h *= 60
  if (h < 0) h += 360
  return [h, s, l]
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60) { r = c; g = x } else if (h < 120) { r = x; g = c }
  else if (h < 180) { g = c; b = x } else if (h < 240) { g = x; b = c }
  else if (h < 300) { r = x; b = c } else { r = c; b = x }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

/** Luminância percebida 0..255 */
export const luma = (c: RGBA) => 0.2126 * getR(c) + 0.7152 * getG(c) + 0.0722 * getB(c)

/** Distância euclidiana ponderada entre duas cores (inclui alfa) */
export function colorDistance(a: RGBA, b: RGBA): number {
  const dr = getR(a) - getR(b), dg = getG(a) - getG(b)
  const db = getB(a) - getB(b), da = getA(a) - getA(b)
  return Math.sqrt(dr * dr + dg * dg + db * db + da * da)
}

/** Mistura linear entre duas cores, t = 0..1 */
export function mix(a: RGBA, b: RGBA, t: number): RGBA {
  const it = 1 - t
  return rgba(
    Math.round(getR(a) * it + getR(b) * t),
    Math.round(getG(a) * it + getG(b) * t),
    Math.round(getB(a) * it + getB(b) * t),
    Math.round(getA(a) * it + getA(b) * t),
  )
}

export const cssColor = (c: RGBA) =>
  `rgba(${getR(c)},${getG(c)},${getB(c)},${(getA(c) / 255).toFixed(3)})`
