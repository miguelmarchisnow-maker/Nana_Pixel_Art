import type { Cel, Layer, Frame, Tag, Sprite } from '../types'
import { celKey } from '../types'

/* ── RLE + base64 ────────────────────────────────────────────────────────── */

/** Codifica em runs de [contagem u16][valor u32] — ótimo para pixel art. */
export function rleEncode(data: Uint32Array): Uint8Array {
  const runs: number[] = []
  let i = 0
  while (i < data.length) {
    const v = data[i]
    let n = 1
    while (i + n < data.length && data[i + n] === v && n < 65535) n++
    runs.push(n, v)
    i += n
  }
  const out = new Uint8Array((runs.length / 2) * 6)
  const dv = new DataView(out.buffer)
  for (let k = 0, o = 0; k < runs.length; k += 2, o += 6) {
    dv.setUint16(o, runs[k], true)
    dv.setUint32(o + 2, runs[k + 1], true)
  }
  return out
}

export function rleDecode(bytes: Uint8Array, length: number): Uint32Array {
  const out = new Uint32Array(length)
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let p = 0
  for (let o = 0; o + 6 <= bytes.byteLength && p < length; o += 6) {
    const n = dv.getUint16(o, true)
    const v = dv.getUint32(o + 2, true)
    const end = Math.min(length, p + n)
    if (v !== 0) out.fill(v, p, end)
    p = end
  }
  return out
}

export function toBase64(bytes: Uint8Array): string {
  let s = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[])
  }
  return btoa(s)
}

export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

/* ── Formato do projeto ──────────────────────────────────────────────────── */

export const PROJECT_EXT = 'pxpaint'
const FORMAT = 'pixel-painter'
const VERSION = 1

interface ProjectFile {
  format: string
  version: number
  name: string
  width: number
  height: number
  layers: Layer[]
  frames: Frame[]
  tags: Tag[]
  palette: number[]
  cels: { l: string; f: string; o: number; d: string }[]
}

export function serializeProject(s: Sprite): string {
  const cels: ProjectFile['cels'] = []
  for (const layer of s.layers) {
    for (const frame of s.frames) {
      const cel = s.cels.get(celKey(layer.id, frame.id))
      if (!cel) continue
      // Pula cels totalmente vazios com opacidade padrão
      let empty = true
      for (let i = 0; i < cel.data.length; i++) if (cel.data[i] !== 0) { empty = false; break }
      if (empty && cel.opacity === 255) continue
      cels.push({ l: layer.id, f: frame.id, o: cel.opacity, d: toBase64(rleEncode(cel.data)) })
    }
  }
  const file: ProjectFile = {
    format: FORMAT,
    version: VERSION,
    name: s.name,
    width: s.width,
    height: s.height,
    layers: s.layers,
    frames: s.frames,
    tags: s.tags,
    palette: s.palette,
    cels,
  }
  return JSON.stringify(file)
}

export function deserializeProject(json: string): Sprite {
  const f = JSON.parse(json) as ProjectFile
  if (f.format !== FORMAT) throw new Error('Arquivo de projeto inválido')
  if (!f.width || !f.height || !f.layers?.length || !f.frames?.length) {
    throw new Error('Projeto corrompido')
  }

  const cels = new Map<string, Cel>()
  const size = f.width * f.height
  for (const layer of f.layers) {
    for (const frame of f.frames) {
      cels.set(celKey(layer.id, frame.id), { data: new Uint32Array(size), opacity: 255 })
    }
  }
  for (const c of f.cels ?? []) {
    cels.set(celKey(c.l, c.f), { data: rleDecode(fromBase64(c.d), size), opacity: c.o ?? 255 })
  }

  return {
    width: f.width,
    height: f.height,
    name: f.name || 'Sem título',
    layers: f.layers.map((l) => ({ ...l, reference: l.reference ?? false })),
    frames: f.frames,
    tags: f.tags ?? [],
    palette: f.palette ?? [],
    cels,
  }
}

/* ── Autosave em localStorage ────────────────────────────────────────────── */

const AUTOSAVE_KEY = 'pixel-painter:autosave'

export function saveAutosave(s: Sprite): boolean {
  try {
    localStorage.setItem(AUTOSAVE_KEY, serializeProject(s))
    return true
  } catch {
    return false // quota excedida
  }
}

export function loadAutosave(): Sprite | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY)
    if (!raw) return null
    return deserializeProject(raw)
  } catch {
    return null
  }
}

export const clearAutosave = () => localStorage.removeItem(AUTOSAVE_KEY)
