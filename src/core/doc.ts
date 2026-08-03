import type { BlendMode, Cel, Frame, Layer, RGBA, Sprite, Tag } from './types'
import { celKey, uid } from './types'
import { makeBuffer, cropBuffer, resampleNearest, type Rect } from './raster'
import { rgba } from './color'
import { DB32 } from './palettes'

/* ── Criação ─────────────────────────────────────────────────────────────── */

export function makeLayer(name: string): Layer {
  return { id: uid('L'), name, visible: true, locked: false, opacity: 255, blend: 'normal', reference: false }
}

export function makeFrame(duration = 100): Frame {
  return { id: uid('F'), duration }
}

export function makeCel(w: number, h: number): Cel {
  return { data: makeBuffer(w, h), opacity: 255 }
}

export function createSprite(width: number, height: number, name = 'Sem título'): Sprite {
  const layer = makeLayer('Camada 1')
  const frame = makeFrame()
  const cels = new Map<string, Cel>()
  cels.set(celKey(layer.id, frame.id), makeCel(width, height))
  return {
    width, height, name,
    layers: [layer],
    frames: [frame],
    cels,
    palette: DB32.slice(),
    tags: [],
  }
}

/* ── Acesso a cels ───────────────────────────────────────────────────────── */

export const getCel = (s: Sprite, layerId: string, frameId: string): Cel | undefined =>
  s.cels.get(celKey(layerId, frameId))

export function ensureCel(s: Sprite, layerId: string, frameId: string): Cel {
  const k = celKey(layerId, frameId)
  let c = s.cels.get(k)
  if (!c) { c = makeCel(s.width, s.height); s.cels.set(k, c) }
  return c
}

export const layerIndex = (s: Sprite, id: string) => s.layers.findIndex((l) => l.id === id)
export const frameIndex = (s: Sprite, id: string) => s.frames.findIndex((f) => f.id === id)

/* ── Camadas ─────────────────────────────────────────────────────────────── */

export function addLayer(s: Sprite, aboveIndex: number, name?: string): Layer {
  const l = makeLayer(name ?? `Camada ${s.layers.length + 1}`)
  s.layers.splice(aboveIndex + 1, 0, l)
  for (const f of s.frames) s.cels.set(celKey(l.id, f.id), makeCel(s.width, s.height))
  return l
}

export function duplicateLayer(s: Sprite, id: string): Layer | null {
  const i = layerIndex(s, id)
  if (i < 0) return null
  const src = s.layers[i]
  const l: Layer = { ...src, id: uid('L'), name: `${src.name} cópia` }
  s.layers.splice(i + 1, 0, l)
  for (const f of s.frames) {
    const c = getCel(s, src.id, f.id)
    s.cels.set(celKey(l.id, f.id), { data: c ? new Uint32Array(c.data) : makeBuffer(s.width, s.height), opacity: c?.opacity ?? 255 })
  }
  return l
}

export function removeLayer(s: Sprite, id: string): boolean {
  if (s.layers.length <= 1) return false
  const i = layerIndex(s, id)
  if (i < 0) return false
  s.layers.splice(i, 1)
  for (const f of s.frames) s.cels.delete(celKey(id, f.id))
  return true
}

export function moveLayer(s: Sprite, id: string, delta: number): boolean {
  const i = layerIndex(s, id)
  const j = i + delta
  if (i < 0 || j < 0 || j >= s.layers.length) return false
  const [l] = s.layers.splice(i, 1)
  s.layers.splice(j, 0, l)
  return true
}

/** Mescla a camada em cima da de baixo (destrói a de cima). */
export function mergeDown(s: Sprite, id: string, compose: (below: Cel, above: Cel, layer: Layer) => void): boolean {
  const i = layerIndex(s, id)
  if (i <= 0) return false
  const upper = s.layers[i]
  const lower = s.layers[i - 1]
  for (const f of s.frames) {
    const a = getCel(s, upper.id, f.id)
    if (!a) continue
    const b = ensureCel(s, lower.id, f.id)
    compose(b, a, upper)
  }
  s.layers.splice(i, 1)
  for (const f of s.frames) s.cels.delete(celKey(upper.id, f.id))
  return true
}

/* ── Frames ──────────────────────────────────────────────────────────────── */

export function addFrame(s: Sprite, afterIndex: number, copyFrom?: number): Frame {
  const f = makeFrame(s.frames[afterIndex]?.duration ?? 100)
  s.frames.splice(afterIndex + 1, 0, f)
  const srcFrame = copyFrom !== undefined ? s.frames[copyFrom] : undefined
  for (const l of s.layers) {
    const src = srcFrame ? getCel(s, l.id, srcFrame.id) : undefined
    s.cels.set(celKey(l.id, f.id), {
      data: src ? new Uint32Array(src.data) : makeBuffer(s.width, s.height),
      opacity: src?.opacity ?? 255,
    })
  }
  shiftTags(s, afterIndex + 1, 1)
  return f
}

export function removeFrame(s: Sprite, id: string): boolean {
  if (s.frames.length <= 1) return false
  const i = frameIndex(s, id)
  if (i < 0) return false
  s.frames.splice(i, 1)
  for (const l of s.layers) s.cels.delete(celKey(l.id, id))
  shiftTags(s, i, -1)
  return true
}

export function moveFrame(s: Sprite, id: string, delta: number): boolean {
  const i = frameIndex(s, id)
  const j = i + delta
  if (i < 0 || j < 0 || j >= s.frames.length) return false
  const [f] = s.frames.splice(i, 1)
  s.frames.splice(j, 0, f)
  return true
}

function shiftTags(s: Sprite, at: number, delta: number) {
  for (const t of s.tags) {
    if (t.from >= at) t.from += delta
    if (t.to >= at) t.to += delta
    t.from = Math.max(0, Math.min(s.frames.length - 1, t.from))
    t.to = Math.max(t.from, Math.min(s.frames.length - 1, t.to))
  }
  s.tags = s.tags.filter((t) => t.from <= t.to)
}

export function makeTag(name: string, from: number, to: number): Tag {
  return { id: uid('T'), name, from, to, direction: 'forward', color: rgba(90, 190, 255) }
}

/* ── Dimensões ───────────────────────────────────────────────────────────── */

/** Redimensiona a tela (sem escalar o conteúdo). `rect` em coordenadas atuais. */
export function resizeCanvas(s: Sprite, rect: Rect): void {
  for (const [k, cel] of s.cels) {
    s.cels.set(k, { data: cropBuffer(cel.data, s.width, s.height, rect), opacity: cel.opacity })
  }
  s.width = rect.w
  s.height = rect.h
}

/** Redimensiona o sprite escalando o conteúdo (vizinho mais próximo). */
export function resizeSprite(s: Sprite, nw: number, nh: number): void {
  for (const [k, cel] of s.cels) {
    s.cels.set(k, { data: resampleNearest(cel.data, s.width, s.height, nw, nh), opacity: cel.opacity })
  }
  s.width = nw
  s.height = nh
}

/* ── Serialização estrutural (sem os pixels) ─────────────────────────────── */

export interface SpriteMeta {
  width: number
  height: number
  name: string
  layers: Layer[]
  frames: Frame[]
  tags: Tag[]
  palette: RGBA[]
}

export const snapshotMeta = (s: Sprite): SpriteMeta => ({
  width: s.width,
  height: s.height,
  name: s.name,
  layers: s.layers.map((l) => ({ ...l })),
  frames: s.frames.map((f) => ({ ...f })),
  tags: s.tags.map((t) => ({ ...t })),
  palette: s.palette.slice(),
})

export function restoreMeta(s: Sprite, m: SpriteMeta): void {
  s.width = m.width
  s.height = m.height
  s.name = m.name
  s.layers = m.layers.map((l) => ({ ...l }))
  s.frames = m.frames.map((f) => ({ ...f }))
  s.tags = m.tags.map((t) => ({ ...t }))
  s.palette = m.palette.slice()
}

export const cloneCels = (s: Sprite): Map<string, Cel> => {
  const out = new Map<string, Cel>()
  for (const [k, c] of s.cels) out.set(k, { data: new Uint32Array(c.data), opacity: c.opacity })
  return out
}

export const BLEND_LABEL = (b: BlendMode) => b
