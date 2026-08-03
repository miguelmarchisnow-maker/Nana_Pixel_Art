import type { Cel, Sprite } from './types'
import type { Rect } from './raster'
import { snapshotMeta, restoreMeta, cloneCels, type SpriteMeta } from './doc'
import type { Mask } from './selection'

/* ── Estruturas ──────────────────────────────────────────────────────────── */

interface Patch {
  key: string
  rect: Rect
  before: Uint32Array
  after: Uint32Array
}

interface FullSnapshot {
  meta: SpriteMeta
  cels: Map<string, Cel>
}

export interface Entry {
  label: string
  patches?: Patch[]
  before?: FullSnapshot
  after?: FullSnapshot
  selBefore?: Mask | null
  selAfter?: Mask | null
  /** posição do cursor de frame/camada no momento, para restaurar o contexto */
  ctxBefore?: { frame: number; layer: number }
  ctxAfter?: { frame: number; layer: number }
  bytes: number
}

const patchBytes = (p: Patch) => p.before.byteLength + p.after.byteLength + 64
const snapBytes = (s: FullSnapshot) => {
  let n = 512
  for (const c of s.cels.values()) n += c.data.byteLength + 32
  return n
}

/* ── Transação de pixels ─────────────────────────────────────────────────── */

/** Captura o estado "antes" dos cels tocados e gera o patch mínimo no commit. */
export class PixelTx {
  private before = new Map<string, Uint32Array>()
  constructor(private sprite: Sprite, public label: string) {}

  /** Chame antes de modificar o cel. */
  touch(key: string): void {
    if (this.before.has(key)) return
    const cel = this.sprite.cels.get(key)
    if (!cel) return
    this.before.set(key, new Uint32Array(cel.data))
  }

  commit(): Patch[] {
    const { width: w } = this.sprite
    const patches: Patch[] = []
    for (const [key, before] of this.before) {
      const cel = this.sprite.cels.get(key)
      if (!cel) continue
      const after = cel.data
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
      for (let i = 0; i < after.length; i++) {
        if (after[i] === before[i]) continue
        const x = i % w, y = (i / w) | 0
        if (x < x0) x0 = x
        if (y < y0) y0 = y
        if (x > x1) x1 = x
        if (y > y1) y1 = y
      }
      if (x1 < x0) continue
      const rect: Rect = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
      const n = rect.w * rect.h
      const bBuf = new Uint32Array(n)
      const aBuf = new Uint32Array(n)
      for (let y = 0; y < rect.h; y++) {
        const srcOff = (rect.y + y) * w + rect.x
        bBuf.set(before.subarray(srcOff, srcOff + rect.w), y * rect.w)
        aBuf.set(after.subarray(srcOff, srcOff + rect.w), y * rect.w)
      }
      patches.push({ key, rect, before: bBuf, after: aBuf })
    }
    this.before.clear()
    return patches
  }
}

function applyPatch(sprite: Sprite, p: Patch, useBefore: boolean): void {
  const cel = sprite.cels.get(p.key)
  if (!cel) return
  const src = useBefore ? p.before : p.after
  const w = sprite.width
  for (let y = 0; y < p.rect.h; y++) {
    const dstOff = (p.rect.y + y) * w + p.rect.x
    if (dstOff < 0 || dstOff + p.rect.w > cel.data.length) continue
    cel.data.set(src.subarray(y * p.rect.w, (y + 1) * p.rect.w), dstOff)
  }
}

/* ── Snapshot completo (mudanças estruturais) ────────────────────────────── */

export const takeSnapshot = (s: Sprite): FullSnapshot => ({
  meta: snapshotMeta(s),
  cels: cloneCels(s),
})

function restoreSnapshot(s: Sprite, snap: FullSnapshot): void {
  restoreMeta(s, snap.meta)
  s.cels = new Map()
  for (const [k, c] of snap.cels) s.cels.set(k, { data: new Uint32Array(c.data), opacity: c.opacity })
}

/* ── Pilha ───────────────────────────────────────────────────────────────── */

export interface HistoryLimits {
  maxSteps: number
  maxBytes: number
}

export class History {
  private undoStack: Entry[] = []
  private redoStack: Entry[] = []
  private bytes = 0

  constructor(private limits: HistoryLimits = { maxSteps: 120, maxBytes: 96 * 1024 * 1024 }) {}

  get canUndo() { return this.undoStack.length > 0 }
  get canRedo() { return this.redoStack.length > 0 }
  get undoLabel() { return this.undoStack.at(-1)?.label ?? '' }
  get redoLabel() { return this.redoStack.at(-1)?.label ?? '' }
  get depth() { return this.undoStack.length }

  clear(): void {
    this.undoStack = []
    this.redoStack = []
    this.bytes = 0
  }

  push(entry: Omit<Entry, 'bytes'>): void {
    let bytes = 128
    for (const p of entry.patches ?? []) bytes += patchBytes(p)
    if (entry.before) bytes += snapBytes(entry.before)
    if (entry.after) bytes += snapBytes(entry.after)
    if (entry.selBefore) bytes += entry.selBefore.byteLength
    if (entry.selAfter) bytes += entry.selAfter.byteLength

    const full: Entry = { ...entry, bytes }
    this.undoStack.push(full)
    this.bytes += bytes

    for (const e of this.redoStack) this.bytes -= e.bytes
    this.redoStack = []

    while (
      this.undoStack.length > this.limits.maxSteps ||
      (this.bytes > this.limits.maxBytes && this.undoStack.length > 1)
    ) {
      const dropped = this.undoStack.shift()
      if (!dropped) break
      this.bytes -= dropped.bytes
    }
  }

  /** Devolve a entrada aplicada, para o chamador restaurar seleção/contexto. */
  undo(sprite: Sprite): Entry | null {
    const e = this.undoStack.pop()
    if (!e) return null
    if (e.before) restoreSnapshot(sprite, e.before)
    if (e.patches) for (const p of e.patches) applyPatch(sprite, p, true)
    this.redoStack.push(e)
    return e
  }

  redo(sprite: Sprite): Entry | null {
    const e = this.redoStack.pop()
    if (!e) return null
    if (e.after) restoreSnapshot(sprite, e.after)
    if (e.patches) for (const p of e.patches) applyPatch(sprite, p, false)
    this.undoStack.push(e)
    return e
  }

  get memoryMB() { return this.bytes / (1024 * 1024) }
}
