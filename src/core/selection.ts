import type { SelectMode } from './types'
import type { Rect } from './raster'

/** Máscara de seleção: 1 = selecionado. `null` em Sprite significa "tudo". */
export type Mask = Uint8Array

export const makeMask = (w: number, h: number, fill = 0): Mask => {
  const m = new Uint8Array(w * h)
  if (fill) m.fill(1)
  return m
}

export const isEmpty = (m: Mask): boolean => {
  for (let i = 0; i < m.length; i++) if (m[i]) return false
  return true
}

export function maskBounds(m: Mask, w: number, h: number): Rect | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!m[y * w + x]) continue
      if (x < x0) x0 = x
      if (y < y0) y0 = y
      if (x > x1) x1 = x
      if (y > y1) y1 = y
    }
  }
  if (x1 < x0) return null
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

/** Combina `add` na máscara `base` conforme o modo. Devolve uma nova máscara. */
export function combine(base: Mask | null, add: Mask, mode: SelectMode, w: number, h: number): Mask {
  const out = new Uint8Array(w * h)
  const b = base
  for (let i = 0; i < out.length; i++) {
    const inBase = b ? b[i] : 0
    const inAdd = add[i]
    switch (mode) {
      case 'replace': out[i] = inAdd; break
      case 'add': out[i] = inBase || inAdd ? 1 : 0; break
      case 'subtract': out[i] = inBase && !inAdd ? 1 : 0; break
      case 'intersect': out[i] = inBase && inAdd ? 1 : 0; break
    }
  }
  return out
}

export function invertMask(m: Mask | null, w: number, h: number): Mask {
  const out = new Uint8Array(w * h)
  for (let i = 0; i < out.length; i++) out[i] = m ? (m[i] ? 0 : 1) : 0
  return out
}

export function rectMask(w: number, h: number, r: Rect): Mask {
  const m = new Uint8Array(w * h)
  const x0 = Math.max(0, r.x), y0 = Math.max(0, r.y)
  const x1 = Math.min(w, r.x + r.w), y1 = Math.min(h, r.y + r.h)
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m[y * w + x] = 1
  return m
}

export function ellipseMaskOf(w: number, h: number, r: Rect): Mask {
  const m = new Uint8Array(w * h)
  const rx = r.w / 2, ry = r.h / 2
  const cx = r.x + rx - 0.5, cy = r.y + ry - 0.5
  if (rx <= 0 || ry <= 0) return m
  const x0 = Math.max(0, r.x), y0 = Math.max(0, r.y)
  const x1 = Math.min(w, r.x + r.w), y1 = Math.min(h, r.y + r.h)
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const nx = (x - cx) / rx, ny = (y - cy) / ry
      if (nx * nx + ny * ny <= 1) m[y * w + x] = 1
    }
  }
  return m
}

export function polygonMask(w: number, h: number, pts: { x: number; y: number }[]): Mask {
  const m = new Uint8Array(w * h)
  if (pts.length < 3) return m
  let minY = Infinity, maxY = -Infinity
  for (const p of pts) { if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y }
  const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(h - 1, Math.ceil(maxY))
  for (let y = y0; y <= y1; y++) {
    const xs: number[] = []
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[j], b = pts[i]
      if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
        xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x))
      }
    }
    xs.sort((p, q) => p - q)
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const from = Math.max(0, Math.ceil(xs[i]))
      const to = Math.min(w - 1, Math.floor(xs[i + 1]))
      for (let x = from; x <= to; x++) m[y * w + x] = 1
    }
  }
  return m
}

/** Segmentos da borda da seleção, para desenhar as "formigas marchando". */
export function maskOutline(m: Mask, w: number, h: number): number[] {
  const seg: number[] = []
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : m[y * w + x])
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!m[y * w + x]) continue
      if (!at(x, y - 1)) seg.push(x, y, x + 1, y)
      if (!at(x, y + 1)) seg.push(x, y + 1, x + 1, y + 1)
      if (!at(x - 1, y)) seg.push(x, y, x, y + 1)
      if (!at(x + 1, y)) seg.push(x + 1, y, x + 1, y + 1)
    }
  }
  return seg
}

/** Expande (dilata) ou contrai (erode) a máscara em `n` pixels. */
export function growMask(m: Mask, w: number, h: number, n: number): Mask {
  let cur = new Uint8Array(m)
  const steps = Math.abs(n)
  const grow = n > 0
  for (let s = 0; s < steps; s++) {
    const next = new Uint8Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        const c = cur[i]
        const nb = [
          x > 0 ? cur[i - 1] : 0, x < w - 1 ? cur[i + 1] : 0,
          y > 0 ? cur[i - w] : 0, y < h - 1 ? cur[i + w] : 0,
        ]
        next[i] = grow
          ? (c || nb.some(Boolean) ? 1 : 0)
          : (c && nb.every(Boolean) && x > 0 && y > 0 && x < w - 1 && y < h - 1 ? 1 : 0)
      }
    }
    cur = next
  }
  return cur
}
