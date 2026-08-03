import type { BrushShape, DitherPattern, RGBA } from './types'
import { getA, getB, getG, getR, rgba, colorDistance, mix } from './color'
import { blendPixel } from './blend'

/* ── Buffers ─────────────────────────────────────────────────────────────── */

export const makeBuffer = (w: number, h: number) => new Uint32Array(w * h)
export const cloneBuffer = (b: Uint32Array) => new Uint32Array(b)

export interface Rect { x: number; y: number; w: number; h: number }

/* ── Padrões de dithering ────────────────────────────────────────────────── */

const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
]

/** Limiar ordenado 0..1 para a posição (x,y) — usado em gradientes pontilhados */
export const bayerThreshold = (x: number, y: number) =>
  (BAYER4[((y % 4) + 4) % 4][((x % 4) + 4) % 4] + 0.5) / 16

/** true = usa a cor primária, false = usa a secundária (ou pula) */
export function ditherHit(pattern: DitherPattern, x: number, y: number): boolean {
  switch (pattern) {
    case 'none': return true
    case 'checker': return ((x + y) & 1) === 0
    case 'dots25': return (x & 1) === 0 && (y & 1) === 0
    case 'dots75': return !((x & 1) === 1 && (y & 1) === 1)
    case 'bayer4': return bayerThreshold(x, y) < 0.5
    case 'lines-h': return (y & 1) === 0
    case 'lines-v': return (x & 1) === 0
    default: return true
  }
}

/* ── Contexto de pintura ─────────────────────────────────────────────────── */

export interface PaintCtx {
  data: Uint32Array
  w: number
  h: number
  /** máscara de seleção (1 = dentro). null = tudo liberado */
  mask: Uint8Array | null
  /** 0..255 */
  alpha: number
  dither: DitherPattern
  /** cor usada onde o dither não "acerta"; null = não pinta nada ali */
  ditherAlt: RGBA | null
  /** true = apaga (escreve transparente ignorando composição) */
  erase: boolean
  /** área modificada, atualizada a cada pixel escrito */
  dirty: { x0: number; y0: number; x1: number; y1: number }
}

export function makePaintCtx(
  data: Uint32Array, w: number, h: number, opts: Partial<PaintCtx> = {},
): PaintCtx {
  return {
    data, w, h,
    mask: opts.mask ?? null,
    alpha: opts.alpha ?? 255,
    dither: opts.dither ?? 'none',
    ditherAlt: opts.ditherAlt ?? null,
    erase: opts.erase ?? false,
    dirty: { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity },
  }
}

export const dirtyRect = (ctx: PaintCtx): Rect | null => {
  const d = ctx.dirty
  if (d.x1 < d.x0) return null
  return { x: d.x0, y: d.y0, w: d.x1 - d.x0 + 1, h: d.y1 - d.y0 + 1 }
}

/** Escreve um pixel respeitando máscara, dither, alfa e composição. */
export function putPixel(ctx: PaintCtx, x: number, y: number, color: RGBA): void {
  if (x < 0 || y < 0 || x >= ctx.w || y >= ctx.h) return
  const i = y * ctx.w + x
  if (ctx.mask && ctx.mask[i] === 0) return

  let c = color
  if (ctx.dither !== 'none' && !ditherHit(ctx.dither, x, y)) {
    if (ctx.ditherAlt === null) return
    c = ctx.ditherAlt
  }

  const prev = ctx.data[i]
  let next: number
  if (ctx.erase) {
    // Apagar reduz o alfa proporcionalmente
    const a = getA(prev) * (1 - ctx.alpha / 255)
    next = a <= 0 ? 0 : ((prev & 0x00ffffff) | (Math.round(a) << 24)) >>> 0
  } else {
    next = blendPixel(prev, c, 'normal', ctx.alpha)
  }
  if (next === prev) return

  ctx.data[i] = next
  const d = ctx.dirty
  if (x < d.x0) d.x0 = x
  if (y < d.y0) d.y0 = y
  if (x > d.x1) d.x1 = x
  if (y > d.y1) d.y1 = y
}

/** Escreve o valor cru, sem composição (usado por transformações e colagem). */
export function setRaw(ctx: PaintCtx, x: number, y: number, color: RGBA): void {
  if (x < 0 || y < 0 || x >= ctx.w || y >= ctx.h) return
  const i = y * ctx.w + x
  if (ctx.mask && ctx.mask[i] === 0) return
  if (ctx.data[i] === color) return
  ctx.data[i] = color
  const d = ctx.dirty
  if (x < d.x0) d.x0 = x
  if (y < d.y0) d.y0 = y
  if (x > d.x1) d.x1 = x
  if (y > d.y1) d.y1 = y
}

export const getPixel = (data: Uint32Array, w: number, h: number, x: number, y: number): RGBA =>
  x < 0 || y < 0 || x >= w || y >= h ? 0 : data[y * w + x]

/* ── Pincéis ─────────────────────────────────────────────────────────────── */

export interface Brush { offsets: Int32Array; size: number }

const brushCache = new Map<string, Brush>()

export function makeBrush(size: number, shape: BrushShape): Brush {
  const key = `${size}:${shape}`
  const cached = brushCache.get(key)
  if (cached) return cached

  const s = Math.max(1, Math.round(size))
  const pts: number[] = []
  const r = (s - 1) / 2
  const off = Math.floor(r)
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const cx = x - r, cy = y - r
      if (shape === 'circle' && Math.sqrt(cx * cx + cy * cy) > r + 0.25) continue
      if (shape === 'diamond' && Math.abs(cx) + Math.abs(cy) > r + 0.25) continue
      pts.push(x - off, y - off)
    }
  }
  const brush: Brush = { offsets: Int32Array.from(pts), size: s }
  brushCache.set(key, brush)
  return brush
}

export function stampBrush(ctx: PaintCtx, brush: Brush, x: number, y: number, color: RGBA): void {
  const o = brush.offsets
  for (let i = 0; i < o.length; i += 2) putPixel(ctx, x + o[i], y + o[i + 1], color)
}

/* ── Linhas e formas ─────────────────────────────────────────────────────── */

/** Bresenham; chama `plot` para cada ponto da linha. */
export function bresenham(
  x0: number, y0: number, x1: number, y1: number,
  plot: (x: number, y: number) => void,
): void {
  x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1
  let err = dx + dy
  for (;;) {
    plot(x0, y0)
    if (x0 === x1 && y0 === y1) break
    const e2 = 2 * err
    if (e2 >= dy) { err += dy; x0 += sx }
    if (e2 <= dx) { err += dx; y0 += sy }
  }
}

export function drawLine(
  ctx: PaintCtx, brush: Brush, x0: number, y0: number, x1: number, y1: number, color: RGBA,
): void {
  if (brush.size === 1) bresenham(x0, y0, x1, y1, (x, y) => putPixel(ctx, x, y, color))
  else bresenham(x0, y0, x1, y1, (x, y) => stampBrush(ctx, brush, x, y, color))
}

const norm = (a: number, b: number) => (a <= b ? [a, b] : [b, a])

export function drawRect(
  ctx: PaintCtx, brush: Brush, x0: number, y0: number, x1: number, y1: number,
  color: RGBA, fill: boolean, stroke: boolean,
): void {
  const [ax, bx] = norm(x0 | 0, x1 | 0)
  const [ay, by] = norm(y0 | 0, y1 | 0)
  if (fill) {
    for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) putPixel(ctx, x, y, color)
  }
  if (stroke) {
    for (let x = ax; x <= bx; x++) { stampBrush(ctx, brush, x, ay, color); stampBrush(ctx, brush, x, by, color) }
    for (let y = ay; y <= by; y++) { stampBrush(ctx, brush, ax, y, color); stampBrush(ctx, brush, bx, y, color) }
  }
}

/** Conjunto de pixels de uma elipse inscrita na caixa; devolve máscara local + offset. */
function ellipseMask(x0: number, y0: number, x1: number, y1: number) {
  const [ax, bx] = norm(x0 | 0, x1 | 0)
  const [ay, by] = norm(y0 | 0, y1 | 0)
  const w = bx - ax + 1, h = by - ay + 1
  const m = new Uint8Array(w * h)
  const rx = w / 2, ry = h / 2
  const cx = rx - 0.5, cy = ry - 0.5
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x - cx) / rx, ny = (y - cy) / ry
      if (nx * nx + ny * ny <= 1.0) m[y * w + x] = 1
    }
  }
  return { m, w, h, ax, ay }
}

export function drawEllipse(
  ctx: PaintCtx, brush: Brush, x0: number, y0: number, x1: number, y1: number,
  color: RGBA, fill: boolean, stroke: boolean,
): void {
  const { m, w, h, ax, ay } = ellipseMask(x0, y0, x1, y1)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!m[y * w + x]) continue
      const edge =
        x === 0 || y === 0 || x === w - 1 || y === h - 1 ||
        !m[y * w + x - 1] || !m[y * w + x + 1] || !m[(y - 1) * w + x] || !m[(y + 1) * w + x]
      if (edge) {
        if (stroke) stampBrush(ctx, brush, ax + x, ay + y, color)
        else if (fill) putPixel(ctx, ax + x, ay + y, color)
      } else if (fill) {
        putPixel(ctx, ax + x, ay + y, color)
      }
    }
  }
}

/** Polígono fechado por scanline + contorno. */
export function drawPolygon(
  ctx: PaintCtx, brush: Brush, pts: { x: number; y: number }[],
  color: RGBA, fill: boolean, stroke: boolean,
): void {
  if (pts.length === 0) return
  if (fill && pts.length >= 3) {
    let minY = Infinity, maxY = -Infinity
    for (const p of pts) { if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y }
    minY = Math.max(0, Math.floor(minY)); maxY = Math.min(ctx.h - 1, Math.ceil(maxY))
    for (let y = minY; y <= maxY; y++) {
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
        const to = Math.min(ctx.w - 1, Math.floor(xs[i + 1]))
        for (let x = from; x <= to; x++) putPixel(ctx, x, y, color)
      }
    }
  }
  if (stroke) {
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length]
      if (pts.length === 1) { stampBrush(ctx, brush, a.x | 0, a.y | 0, color); break }
      drawLine(ctx, brush, a.x | 0, a.y | 0, b.x | 0, b.y | 0, color)
    }
  }
}

/* ── Preenchimento (balde) ───────────────────────────────────────────────── */

export interface FillOpts {
  tolerance: number
  contiguous: boolean
  /** buffer alternativo para amostrar a cor de origem (ex.: composição de todas as camadas) */
  sample?: Uint32Array
}

export function floodFill(
  ctx: PaintCtx, sx: number, sy: number, color: RGBA, opts: FillOpts,
): void {
  const { w, h } = ctx
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return
  const src = opts.sample ?? ctx.data
  const target = src[sy * w + sx]
  const tol = opts.tolerance

  const matches = (c: number) => (tol <= 0 ? c === target : colorDistance(c, target) <= tol)

  if (!opts.contiguous) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) if (matches(src[y * w + x])) putPixel(ctx, x, y, color)
    }
    return
  }

  const seen = new Uint8Array(w * h)
  const stack: number[] = [sx, sy]
  while (stack.length) {
    const y = stack.pop()!
    let x = stack.pop()!
    let i = y * w + x
    while (x >= 0 && !seen[i] && matches(src[i])) { x--; i-- }
    x++; i++
    let spanUp = false, spanDown = false
    while (x < w && !seen[i] && matches(src[i])) {
      seen[i] = 1
      putPixel(ctx, x, y, color)
      if (y > 0) {
        const up = i - w
        const ok = !seen[up] && matches(src[up])
        if (ok && !spanUp) { stack.push(x, y - 1); spanUp = true }
        else if (!ok) spanUp = false
      }
      if (y < h - 1) {
        const dn = i + w
        const ok = !seen[dn] && matches(src[dn])
        if (ok && !spanDown) { stack.push(x, y + 1); spanDown = true }
        else if (!ok) spanDown = false
      }
      x++; i++
    }
  }
}

/** Substitui todos os pixels de uma cor por outra (respeita a máscara). */
export function replaceColor(ctx: PaintCtx, from: RGBA, to: RGBA, tolerance: number): void {
  for (let y = 0; y < ctx.h; y++) {
    for (let x = 0; x < ctx.w; x++) {
      const c = ctx.data[y * ctx.w + x]
      const hit = tolerance <= 0 ? c === from : colorDistance(c, from) <= tolerance
      if (hit) setRaw(ctx, x, y, to)
    }
  }
}

/* ── Spray ───────────────────────────────────────────────────────────────── */

export function spray(
  ctx: PaintCtx, cx: number, cy: number, radius: number, density: number, color: RGBA,
): void {
  const n = Math.max(1, Math.round(density))
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2
    const r = Math.sqrt(Math.random()) * radius
    putPixel(ctx, Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), color)
  }
}

/* ── Desfoque ────────────────────────────────────────────────────────────── */

export function blurAt(ctx: PaintCtx, brush: Brush, cx: number, cy: number, strength: number): void {
  const src = ctx.data
  const { w, h } = ctx
  const o = brush.offsets
  for (let k = 0; k < o.length; k += 2) {
    const x = cx + o[k], y = cy + o[k + 1]
    if (x < 0 || y < 0 || x >= w || y >= h) continue
    let r = 0, g = 0, b = 0, a = 0, n = 0
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const px = x + dx, py = y + dy
        if (px < 0 || py < 0 || px >= w || py >= h) continue
        const c = src[py * w + px]
        const ca = getA(c)
        r += getR(c) * ca; g += getG(c) * ca; b += getB(c) * ca; a += ca
        n++
      }
    }
    if (n === 0) continue
    const avgA = a / n
    const out = avgA <= 0 ? 0 : rgba(Math.round(r / a), Math.round(g / a), Math.round(b / a), Math.round(avgA))
    const cur = src[y * w + x]
    setRaw(ctx, x, y, mix(cur, out, Math.max(0, Math.min(1, strength))))
  }
}

/* ── Sombreamento (clarear/escurecer) ────────────────────────────────────── */

export function shadeAt(
  ctx: PaintCtx, brush: Brush, cx: number, cy: number, amount: number, ramp: RGBA[] | null,
): void {
  const o = brush.offsets
  for (let k = 0; k < o.length; k += 2) {
    const x = cx + o[k], y = cy + o[k + 1]
    if (x < 0 || y < 0 || x >= ctx.w || y >= ctx.h) continue
    const cur = ctx.data[y * ctx.w + x]
    if (getA(cur) === 0) continue
    let out: RGBA
    if (ramp && ramp.length > 1) {
      // Anda pela rampa da paleta: encontra a cor mais próxima e desloca o índice
      let best = 0, bestD = Infinity
      for (let i = 0; i < ramp.length; i++) {
        const d = colorDistance(cur, ramp[i])
        if (d < bestD) { bestD = d; best = i }
      }
      const step = amount > 0 ? 1 : -1
      const idx = Math.max(0, Math.min(ramp.length - 1, best + step))
      out = ((ramp[idx] & 0x00ffffff) | (getA(cur) << 24)) >>> 0
    } else {
      const t = Math.abs(amount)
      out = mix(cur, amount > 0 ? rgba(255, 255, 255, getA(cur)) : rgba(0, 0, 0, getA(cur)), t)
    }
    setRaw(ctx, x, y, out)
  }
}

/* ── Gradiente ───────────────────────────────────────────────────────────── */

export function drawGradient(
  ctx: PaintCtx, x0: number, y0: number, x1: number, y1: number,
  c0: RGBA, c1: RGBA, dithered: boolean, radial: boolean,
): void {
  const dx = x1 - x0, dy = y1 - y0
  const len2 = dx * dx + dy * dy
  const len = Math.sqrt(len2)
  for (let y = 0; y < ctx.h; y++) {
    for (let x = 0; x < ctx.w; x++) {
      if (ctx.mask && ctx.mask[y * ctx.w + x] === 0) continue
      let t: number
      if (radial) {
        t = len === 0 ? 1 : Math.sqrt((x - x0) ** 2 + (y - y0) ** 2) / len
      } else {
        t = len2 === 0 ? 0 : ((x - x0) * dx + (y - y0) * dy) / len2
      }
      t = Math.max(0, Math.min(1, t))
      const col = dithered ? (t > bayerThreshold(x, y) ? c1 : c0) : mix(c0, c1, t)
      setRaw(ctx, x, y, col)
    }
  }
}

/* ── Transformações ──────────────────────────────────────────────────────── */

export function flipBuffer(data: Uint32Array, w: number, h: number, horizontal: boolean): Uint32Array {
  const out = new Uint32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = horizontal ? w - 1 - x : x
      const sy = horizontal ? y : h - 1 - y
      out[y * w + x] = data[sy * w + sx]
    }
  }
  return out
}

/** Rotação em múltiplos de 90°. Devolve o buffer e as novas dimensões. */
export function rotateBuffer(data: Uint32Array, w: number, h: number, quarters: number) {
  const q = ((quarters % 4) + 4) % 4
  if (q === 0) return { data: new Uint32Array(data), w, h }
  if (q === 2) {
    const out = new Uint32Array(w * h)
    for (let i = 0; i < data.length; i++) out[data.length - 1 - i] = data[i]
    return { data: out, w, h }
  }
  const nw = h, nh = w
  const out = new Uint32Array(nw * nh)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = data[y * w + x]
      if (q === 1) out[x * nw + (h - 1 - y)] = v
      else out[(w - 1 - x) * nw + y] = v
    }
  }
  return { data: out, w: nw, h: nh }
}

/** Redimensiona por vizinho mais próximo. */
export function resampleNearest(
  data: Uint32Array, w: number, h: number, nw: number, nh: number,
): Uint32Array {
  const out = new Uint32Array(nw * nh)
  for (let y = 0; y < nh; y++) {
    const sy = Math.min(h - 1, Math.floor((y * h) / nh))
    for (let x = 0; x < nw; x++) {
      const sx = Math.min(w - 1, Math.floor((x * w) / nw))
      out[y * nw + x] = data[sy * w + sx]
    }
  }
  return out
}

/** Recorta / expande o buffer para uma nova caixa (coordenadas na origem antiga). */
export function cropBuffer(
  data: Uint32Array, w: number, h: number, rect: Rect,
): Uint32Array {
  const out = new Uint32Array(rect.w * rect.h)
  for (let y = 0; y < rect.h; y++) {
    const sy = rect.y + y
    if (sy < 0 || sy >= h) continue
    for (let x = 0; x < rect.w; x++) {
      const sx = rect.x + x
      if (sx < 0 || sx >= w) continue
      out[y * rect.w + x] = data[sy * w + sx]
    }
  }
  return out
}

/** Caixa dos pixels não transparentes; null se tudo vazio. */
export function opaqueBounds(data: Uint32Array, w: number, h: number): Rect | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (getA(data[y * w + x]) === 0) continue
      if (x < x0) x0 = x
      if (y < y0) y0 = y
      if (x > x1) x1 = x
      if (y > y1) y1 = y
    }
  }
  if (x1 < x0) return null
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

/* ── Utilitários ─────────────────────────────────────────────────────────── */

/** Remove pixels "em L" de um traço à mão livre (pixel-perfect). */
export function pixelPerfectFilter(pts: { x: number; y: number }[]): { x: number; y: number }[] {
  const out = pts.slice()
  let i = 1
  while (i < out.length - 1) {
    const a = out[i - 1], b = out[i], c = out[i + 1]
    const isCorner =
      Math.abs(a.x - c.x) === 1 && Math.abs(a.y - c.y) === 1 &&
      (b.x === a.x || b.x === c.x) && (b.y === a.y || b.y === c.y)
    if (isCorner) { out.splice(i, 1); if (i > 1) i-- } else i++
  }
  return out
}

/** Envolve o buffer como ImageData (memória compartilhada, sem cópia). */
export function toImageData(data: Uint32Array, w: number, h: number): ImageData {
  const bytes = new Uint8ClampedArray(data.buffer as ArrayBuffer, data.byteOffset, w * h * 4)
  return new ImageData(bytes, w, h)
}

export function fromImageData(img: ImageData): Uint32Array {
  return new Uint32Array(img.data.buffer.slice(0))
}
