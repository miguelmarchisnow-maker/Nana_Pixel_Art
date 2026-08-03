import type { Cel, Layer, RGBA, Sprite } from './types'
import { celKey } from './types'
import { blendPixel } from './blend'
import { getA, getB, getG, getR, rgba } from './color'

/** Compõe `cel` sobre `dst` usando as propriedades de `layer`. */
export function composeCel(dst: Uint32Array, cel: Cel, layer: Layer): void {
  const src = cel.data
  const op = Math.round((layer.opacity * cel.opacity) / 255)
  if (op <= 0) return

  if (layer.blend === 'normal' && op === 255) {
    for (let i = 0; i < src.length; i++) {
      const s = src[i]
      const a = s >>> 24
      if (a === 0) continue
      if (a === 255) { dst[i] = s; continue }
      dst[i] = blendPixel(dst[i], s, 'normal', 255)
    }
    return
  }

  for (let i = 0; i < src.length; i++) {
    const s = src[i]
    if ((s >>> 24) === 0) continue
    dst[i] = blendPixel(dst[i], s, layer.blend, op)
  }
}

export interface CompositeOpts {
  /** ignora camadas invisíveis (padrão true) */
  respectVisibility?: boolean
  /** inclui camadas de referência (padrão false — não vão para a exportação) */
  includeReference?: boolean
  /** limita a composição a estas camadas (ids) */
  onlyLayers?: Set<string> | null
  /** buffer reutilizável para evitar alocação */
  target?: Uint32Array
}

export function compositeFrame(s: Sprite, frameId: string, opts: CompositeOpts = {}): Uint32Array {
  const {
    respectVisibility = true,
    includeReference = false,
    onlyLayers = null,
  } = opts
  const out = opts.target && opts.target.length === s.width * s.height
    ? (opts.target.fill(0), opts.target)
    : new Uint32Array(s.width * s.height)

  for (const layer of s.layers) {
    if (respectVisibility && !layer.visible) continue
    if (layer.reference && !includeReference) continue
    if (onlyLayers && !onlyLayers.has(layer.id)) continue
    const cel = s.cels.get(celKey(layer.id, frameId))
    if (!cel) continue
    composeCel(out, cel, layer)
  }
  return out
}

/** Aplica uma tonalidade e reduz o alfa — usado no onion skin. */
export function tintBuffer(buf: Uint32Array, tint: RGBA | null, opacity: number): void {
  const tr = tint === null ? 0 : getR(tint)
  const tg = tint === null ? 0 : getG(tint)
  const tb = tint === null ? 0 : getB(tint)
  for (let i = 0; i < buf.length; i++) {
    const c = buf[i]
    const a = c >>> 24
    if (a === 0) continue
    const na = Math.round((a * opacity) / 255)
    if (na === 0) { buf[i] = 0; continue }
    if (tint === null) {
      buf[i] = ((c & 0x00ffffff) | (na << 24)) >>> 0
    } else {
      buf[i] = rgba(
        Math.round(getR(c) * 0.35 + tr * 0.65),
        Math.round(getG(c) * 0.35 + tg * 0.65),
        Math.round(getB(c) * 0.35 + tb * 0.65),
        na,
      )
    }
  }
}

/** Compõe `src` inteiro sobre `dst` (source-over simples). */
export function composeOver(dst: Uint32Array, src: Uint32Array): void {
  for (let i = 0; i < src.length; i++) {
    const s = src[i]
    const a = s >>> 24
    if (a === 0) continue
    if (a === 255) { dst[i] = s; continue }
    dst[i] = blendPixel(dst[i], s, 'normal', 255)
  }
}

/** Histograma de cores de um buffer (ignora totalmente transparentes). */
export function colorHistogram(buf: Uint32Array, into = new Map<number, number>()): Map<number, number> {
  for (let i = 0; i < buf.length; i++) {
    const c = buf[i]
    if ((c >>> 24) === 0) continue
    into.set(c, (into.get(c) ?? 0) + 1)
  }
  return into
}

/** Conta cores distintas de um sprite inteiro (todas as camadas e frames). */
export function spriteColors(s: Sprite): RGBA[] {
  const hist = new Map<number, number>()
  for (const cel of s.cels.values()) colorHistogram(cel.data, hist)
  return [...hist.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c)
}

export { getA }
