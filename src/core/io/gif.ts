import type { RGBA } from '../types'
import { getA, getB, getG, getR, colorDistance } from '../color'
import { medianCut } from '../palettes'

/* ── Escrita de bytes ────────────────────────────────────────────────────── */

class ByteWriter {
  private buf = new Uint8Array(1 << 16)
  private len = 0

  private ensure(n: number) {
    if (this.len + n <= this.buf.length) return
    let cap = this.buf.length
    while (cap < this.len + n) cap *= 2
    const nb = new Uint8Array(cap)
    nb.set(this.buf.subarray(0, this.len))
    this.buf = nb
  }

  byte(v: number) { this.ensure(1); this.buf[this.len++] = v & 255 }
  short(v: number) { this.byte(v); this.byte(v >> 8) }
  bytes(a: ArrayLike<number>) { this.ensure(a.length); this.buf.set(a as Uint8Array, this.len); this.len += a.length }
  ascii(s: string) { for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i)) }
  result() { return this.buf.slice(0, this.len) }
}

/* ── LZW (variante GIF) ──────────────────────────────────────────────────── */

function lzwEncode(out: ByteWriter, minCodeSize: number, indices: Uint8Array): void {
  out.byte(minCodeSize)

  const clearCode = 1 << minCodeSize
  const eoiCode = clearCode + 1
  let nextCode = eoiCode + 1
  let codeSize = minCodeSize + 1
  let table = new Map<number, number>()

  // Sub-blocos de no máximo 255 bytes
  let block: number[] = []
  let bitBuf = 0
  let bitCount = 0

  const flushBlock = () => {
    if (block.length === 0) return
    out.byte(block.length)
    out.bytes(block)
    block = []
  }
  const emit = (code: number) => {
    bitBuf |= code << bitCount
    bitCount += codeSize
    while (bitCount >= 8) {
      block.push(bitBuf & 255)
      bitBuf >>= 8
      bitCount -= 8
      if (block.length === 255) flushBlock()
    }
  }

  emit(clearCode)

  if (indices.length > 0) {
    let ib = indices[0]
    for (let i = 1; i < indices.length; i++) {
      const k = indices[i]
      const key = (ib << 8) | k
      const found = table.get(key)
      if (found !== undefined) {
        ib = found
        continue
      }
      emit(ib)
      if (nextCode === 4096) {
        emit(clearCode)
        nextCode = eoiCode + 1
        codeSize = minCodeSize + 1
        table = new Map()
      } else {
        if (nextCode >= 1 << codeSize) codeSize++
        table.set(key, nextCode++)
      }
      ib = k
    }
    emit(ib)
  }
  emit(eoiCode)

  if (bitCount > 0) {
    block.push(bitBuf & 255)
    if (block.length === 255) flushBlock()
  }
  flushBlock()
  out.byte(0) // fim dos sub-blocos
}

/* ── Quantização ─────────────────────────────────────────────────────────── */

export interface GifFrame {
  data: Uint32Array
  /** duração em milissegundos */
  delay: number
}

/** Alfa abaixo deste valor vira transparente (GIF só tem 1 bit de transparência). */
const ALPHA_CUTOFF = 128

function buildPalette(frames: GifFrame[], forced?: RGBA[]): RGBA[] {
  if (forced && forced.length) {
    const uniq: RGBA[] = []
    const seen = new Set<number>()
    for (const c of forced) {
      const opaque = (c & 0x00ffffff) >>> 0
      if (seen.has(opaque)) continue
      seen.add(opaque)
      uniq.push(opaque)
      if (uniq.length >= 255) break
    }
    if (uniq.length) return uniq
  }

  const hist = new Map<number, number>()
  for (const f of frames) {
    for (let i = 0; i < f.data.length; i++) {
      const c = f.data[i]
      if (getA(c) < ALPHA_CUTOFF) continue
      const opaque = (c & 0x00ffffff) >>> 0
      hist.set(opaque, (hist.get(opaque) ?? 0) + 1)
    }
  }
  if (hist.size === 0) return [0x000000]
  return medianCut(hist, 255).map((c) => (c & 0x00ffffff) >>> 0)
}

function makeMapper(palette: RGBA[]) {
  const cache = new Map<number, number>()
  return (color: RGBA): number => {
    const key = (color & 0x00ffffff) >>> 0
    const hit = cache.get(key)
    if (hit !== undefined) return hit
    let best = 0, bestD = Infinity
    for (let i = 0; i < palette.length; i++) {
      const p = palette[i]
      const dr = getR(key) - getR(p), dg = getG(key) - getG(p), db = getB(key) - getB(p)
      const d = dr * dr + dg * dg + db * db
      if (d < bestD) { bestD = d; best = i }
      if (d === 0) break
    }
    cache.set(key, best)
    return best
  }
}

/* ── Codificador ─────────────────────────────────────────────────────────── */

export interface GifOptions {
  width: number
  height: number
  /** 0 = repetir para sempre */
  loop?: number
  /** paleta fixa (usa as cores do sprite quando ≤ 255) */
  palette?: RGBA[]
  /** ampliação inteira */
  scale?: number
}

export function encodeGif(frames: GifFrame[], opts: GifOptions): Blob {
  const scale = Math.max(1, Math.round(opts.scale ?? 1))
  const w = opts.width * scale
  const h = opts.height * scale
  const palette = buildPalette(frames, opts.palette)
  const mapColor = makeMapper(palette)

  // Índice 0 reservado para transparência; as cores começam em 1
  const tableSize = Math.max(2, 1 << Math.ceil(Math.log2(Math.max(2, palette.length + 1))))
  const bits = Math.log2(tableSize) - 1

  const out = new ByteWriter()
  out.ascii('GIF89a')
  out.short(w)
  out.short(h)
  out.byte(0x80 | (7 << 4) | bits) // tabela global, 8 bits de resolução
  out.byte(0) // índice de fundo
  out.byte(0) // proporção do pixel

  // Tabela global de cores
  out.byte(0); out.byte(0); out.byte(0) // 0 = transparente
  for (let i = 0; i < tableSize - 1; i++) {
    const c = palette[i]
    if (c === undefined) { out.byte(0); out.byte(0); out.byte(0) }
    else { out.byte(getR(c)); out.byte(getG(c)); out.byte(getB(c)) }
  }

  // Extensão NETSCAPE (loop)
  if (frames.length > 1) {
    out.byte(0x21); out.byte(0xff); out.byte(0x0b)
    out.ascii('NETSCAPE2.0')
    out.byte(0x03); out.byte(0x01)
    out.short(opts.loop ?? 0)
    out.byte(0x00)
  }

  const indices = new Uint8Array(w * h)

  for (const frame of frames) {
    // Converte para índices, ampliando
    for (let y = 0; y < h; y++) {
      const sy = (y / scale) | 0
      for (let x = 0; x < w; x++) {
        const sx = (x / scale) | 0
        const c = frame.data[sy * opts.width + sx]
        indices[y * w + x] = getA(c) < ALPHA_CUTOFF ? 0 : mapColor(c) + 1
      }
    }

    // Controle gráfico
    const delayCs = Math.max(2, Math.round(frame.delay / 10))
    out.byte(0x21); out.byte(0xf9); out.byte(0x04)
    out.byte((2 << 2) | 0x01) // descarte = restaurar fundo, transparência ligada
    out.short(delayCs)
    out.byte(0) // índice transparente
    out.byte(0)

    // Descritor da imagem
    out.byte(0x2c)
    out.short(0); out.short(0)
    out.short(w); out.short(h)
    out.byte(0) // sem tabela local, sem entrelaçamento

    lzwEncode(out, Math.max(2, bits + 1), indices)
  }

  out.byte(0x3b) // fim do arquivo
  return new Blob([out.result()], { type: 'image/gif' })
}

export { colorDistance }
