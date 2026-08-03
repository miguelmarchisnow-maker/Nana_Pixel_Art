import type { BlendMode, RGBA } from './types'
import { getA, getB, getG, getR, rgba } from './color'

/* Funções de mesclagem por canal, todas operando em 0..255 */

const chDarken = (b: number, s: number) => Math.min(b, s)
const chLighten = (b: number, s: number) => Math.max(b, s)
const chMultiply = (b: number, s: number) => (b * s) / 255
const chScreen = (b: number, s: number) => b + s - (b * s) / 255
const chHardLight = (b: number, s: number) => (s <= 127.5 ? chMultiply(b, 2 * s) : chScreen(b, 2 * s - 255))
const chOverlay = (b: number, s: number) => chHardLight(s, b)
const chDodge = (b: number, s: number) => (b === 0 ? 0 : s >= 255 ? 255 : Math.min(255, (b * 255) / (255 - s)))
const chBurn = (b: number, s: number) => (b >= 255 ? 255 : s <= 0 ? 0 : 255 - Math.min(255, ((255 - b) * 255) / s))
const chSoftLight = (b: number, s: number) => {
  const bn = b / 255, sn = s / 255
  const d = bn <= 0.25 ? ((16 * bn - 12) * bn + 4) * bn : Math.sqrt(bn)
  const r = sn <= 0.5 ? bn - (1 - 2 * sn) * bn * (1 - bn) : bn + (2 * sn - 1) * (d - bn)
  return r * 255
}
const chDifference = (b: number, s: number) => Math.abs(b - s)
const chExclusion = (b: number, s: number) => b + s - (2 * b * s) / 255
const chAddition = (b: number, s: number) => Math.min(255, b + s)
const chSubtract = (b: number, s: number) => Math.max(0, b - s)
const chDivide = (b: number, s: number) => (b === 0 ? 0 : s === 0 ? 255 : Math.min(255, (b * 255) / s))

type ChFn = (b: number, s: number) => number

const CHANNEL_FNS: Partial<Record<BlendMode, ChFn>> = {
  multiply: chMultiply,
  screen: chScreen,
  overlay: chOverlay,
  darken: chDarken,
  lighten: chLighten,
  'color-dodge': chDodge,
  'color-burn': chBurn,
  'hard-light': chHardLight,
  'soft-light': chSoftLight,
  difference: chDifference,
  exclusion: chExclusion,
  addition: chAddition,
  subtract: chSubtract,
  divide: chDivide,
}

/* ── Modos não separáveis (HSL) ──────────────────────────────────────────── */

type Triple = [number, number, number]

const lum = (c: Triple) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]

function clipColor(c: Triple): Triple {
  const l = lum(c)
  const n = Math.min(c[0], c[1], c[2])
  const x = Math.max(c[0], c[1], c[2])
  let [r, g, b] = c
  if (n < 0) {
    const d = l - n
    if (d > 0) { r = l + ((r - l) * l) / d; g = l + ((g - l) * l) / d; b = l + ((b - l) * l) / d }
  }
  if (x > 255) {
    const d = x - l
    if (d > 0) {
      const k = 255 - l
      r = l + ((r - l) * k) / d; g = l + ((g - l) * k) / d; b = l + ((b - l) * k) / d
    }
  }
  return [r, g, b]
}

const setLum = (c: Triple, l: number): Triple => {
  const d = l - lum(c)
  return clipColor([c[0] + d, c[1] + d, c[2] + d])
}

const sat = (c: Triple) => Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2])

function setSat(c: Triple, s: number): Triple {
  const idx = [0, 1, 2].sort((a, b) => c[a] - c[b])
  const out: Triple = [0, 0, 0]
  const [mn, md, mx] = idx
  if (c[mx] > c[mn]) {
    out[md] = ((c[md] - c[mn]) * s) / (c[mx] - c[mn])
    out[mx] = s
  }
  out[mn] = 0
  return out
}

function nonSeparable(mode: BlendMode, b: Triple, s: Triple): Triple | null {
  switch (mode) {
    case 'hue': return setLum(setSat(s, sat(b)), lum(b))
    case 'saturation': return setLum(setSat(b, sat(s)), lum(b))
    case 'color': return setLum(s, lum(b))
    case 'luminosity': return setLum(b, lum(s))
    default: return null
  }
}

/**
 * Compõe `src` sobre `dst`.
 * @param opacity 0..255 multiplicador aplicado ao alfa de src
 */
export function blendPixel(dst: RGBA, src: RGBA, mode: BlendMode, opacity: number): RGBA {
  let sa = (getA(src) * opacity) / 255
  if (sa <= 0) return dst
  const da = getA(dst)

  // Caminho rápido: normal e totalmente opaco
  if (mode === 'normal' && sa >= 255) return src
  if (da === 0) {
    // Nada abaixo: apenas o src com alfa ajustado
    return rgba(getR(src), getG(src), getB(src), Math.round(sa))
  }

  const sr = getR(src), sg = getG(src), sb = getB(src)
  const dr = getR(dst), dg = getG(dst), db = getB(dst)

  let br = sr, bg = sg, bb = sb
  const fn = CHANNEL_FNS[mode]
  if (fn) {
    br = fn(dr, sr); bg = fn(dg, sg); bb = fn(db, sb)
  } else if (mode !== 'normal') {
    const ns = nonSeparable(mode, [dr, dg, db], [sr, sg, sb])
    if (ns) { br = ns[0]; bg = ns[1]; bb = ns[2] }
  }

  // O resultado da mesclagem só se aplica onde o fundo é opaco
  const dan = da / 255
  const cr = (1 - dan) * sr + dan * br
  const cg = (1 - dan) * sg + dan * bg
  const cb = (1 - dan) * sb + dan * bb

  const san = sa / 255
  const ra = san + dan * (1 - san)
  if (ra <= 0) return 0
  const outR = (san * cr + dan * dr * (1 - san)) / ra
  const outG = (san * cg + dan * dg * (1 - san)) / ra
  const outB = (san * cb + dan * db * (1 - san)) / ra

  return rgba(
    Math.max(0, Math.min(255, Math.round(outR))),
    Math.max(0, Math.min(255, Math.round(outG))),
    Math.max(0, Math.min(255, Math.round(outB))),
    Math.round(ra * 255),
  )
}
