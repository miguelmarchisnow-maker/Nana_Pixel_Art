import { create } from 'zustand'
import type { RGBA, SymmetryMode, ToolId } from '../core/types'
import { celKey } from '../core/types'
import {
  blurAt, drawEllipse, drawGradient, drawLine, drawPolygon, drawRect, floodFill,
  makeBrush, makePaintCtx, pixelPerfectFilter, putPixel, shadeAt, spray, stampBrush,
  type PaintCtx,
} from '../core/raster'
import { combine, ellipseMaskOf, makeMask, polygonMask, rectMask, type Mask } from '../core/selection'
import { compositeFrame } from '../core/composite'
import { colorDistance, getA } from '../core/color'
import { ensureCel } from '../core/doc'
import { PixelTx } from '../core/history'
import { useEditor } from './editor'

/* ── Sobreposição transitória (marquise, polígono em construção) ─────────── */

export interface Marquee {
  kind: 'rect' | 'ellipse' | 'path'
  x0: number
  y0: number
  x1: number
  y1: number
  pts?: { x: number; y: number }[]
}

interface OverlayState {
  marquee: Marquee | null
  polygon: { x: number; y: number }[]
  cursor: { x: number; y: number } | null
  setMarquee(m: Marquee | null): void
  setPolygon(p: { x: number; y: number }[]): void
  setCursor(c: { x: number; y: number } | null): void
}

export const useOverlay = create<OverlayState>()((set) => ({
  marquee: null,
  polygon: [],
  cursor: null,
  setMarquee: (marquee) => set({ marquee }),
  setPolygon: (polygon) => set({ polygon }),
  setCursor: (cursor) => set({ cursor }),
}))

/* ── Utilidades ──────────────────────────────────────────────────────────── */

export type Pt = { x: number; y: number }

const FREEHAND: ToolId[] = ['pencil', 'eraser', 'spray', 'blur', 'shading']
const SHAPES: ToolId[] = ['line', 'rectangle', 'ellipse', 'gradient']
const SELECTORS: ToolId[] = ['select-rect', 'select-ellipse', 'lasso', 'wand']
const ACCUMULATIVE: ToolId[] = ['spray', 'blur', 'shading']

export const isSelectionTool = (t: ToolId) => SELECTORS.includes(t)
export const isNavTool = (t: ToolId) => t === 'hand' || t === 'zoom'

/** Pontos espelhados conforme o modo de simetria. */
function mirror(p: Pt, mode: SymmetryMode, w: number, h: number): Pt[] {
  const out: Pt[] = [p]
  const mx = w - 1 - p.x
  const my = h - 1 - p.y
  if (mode === 'horizontal' || mode === 'both') out.push({ x: mx, y: p.y })
  if (mode === 'vertical' || mode === 'both') out.push({ x: p.x, y: my })
  if (mode === 'both') out.push({ x: mx, y: my })
  return out
}

/* ── Sessão de traço ─────────────────────────────────────────────────────── */

interface Session {
  tool: ToolId
  color: RGBA
  altColor: RGBA
  useSecondary: boolean
  key: string
  baseline: Uint32Array
  tx: PixelTx
  start: Pt
  last: Pt
  points: Pt[]
  /** para a ferramenta mover */
  floatData?: Uint32Array
  floatMask?: Mask | null
  selBase?: Mask | null
  moved: boolean
}

let session: Session | null = null

export const strokeInProgress = () => session !== null

function paintCtxFor(data: Uint32Array, erase: boolean): PaintCtx {
  const s = useEditor.getState()
  const st = s.settings
  return makePaintCtx(data, s.sprite.width, s.sprite.height, {
    mask: s.selection,
    alpha: st.alpha,
    dither: st.dither,
    ditherAlt: st.dither === 'none' ? null : null,
    erase,
  })
}

/** Redesenha o traço inteiro a partir da cópia inicial do cel. */
function rebuildFromBaseline(sess: Session, data: Uint32Array) {
  data.set(sess.baseline)
}

/* ── Início ──────────────────────────────────────────────────────────────── */

export function strokeBegin(x: number, y: number, useSecondary = false): void {
  const s = useEditor.getState()
  const tool = s.tool
  if (isNavTool(tool)) return

  const p = { x: Math.floor(x), y: Math.floor(y) }

  /* Conta-gotas: ação imediata */
  if (tool === 'eyedropper') {
    pickColor(p.x, p.y, useSecondary)
    return
  }

  /* Ferramentas de seleção não tocam nos pixels */
  if (isSelectionTool(tool)) {
    beginSelection(p, tool)
    return
  }

  /* Polígono: acumula vértices por toque */
  if (tool === 'polygon') {
    const cur = useOverlay.getState().polygon
    const first = cur[0]
    if (first && cur.length >= 3 && Math.abs(first.x - p.x) <= 2 && Math.abs(first.y - p.y) <= 2) {
      finishPolygon()
    } else {
      useOverlay.getState().setPolygon([...cur, p])
    }
    return
  }

  const layer = s.currentLayer()
  if (layer.locked) { s.toast('Camada bloqueada', 'error'); return }
  if (!layer.visible) { s.toast('Camada invisível', 'error'); return }

  const frameId = s.currentFrameId()
  const cel = ensureCel(s.sprite, layer.id, frameId)
  const key = celKey(layer.id, frameId)

  const color = useSecondary ? s.secondary : s.primary
  const altColor = useSecondary ? s.primary : s.secondary

  const tx = new PixelTx(s.sprite, toolLabel(tool))
  tx.touch(key)

  session = {
    tool, color, altColor, useSecondary, key,
    baseline: new Uint32Array(cel.data),
    tx,
    start: p, last: p, points: [p],
    selBase: s.selection,
    moved: false,
  }

  /* Balde: uma ação só */
  if (tool === 'bucket') {
    applyBucket(p, color)
    commitStroke()
    return
  }

  if (tool === 'move') {
    prepareMove(cel.data)
  }

  useEditor.setState({ strokeActive: true })
  applyStroke(p)
}

/* ── Movimento ───────────────────────────────────────────────────────────── */

export function strokeMove(x: number, y: number): void {
  if (!session) {
    // O conta-gotas continua capturando enquanto o dedo arrasta
    if (useEditor.getState().tool === 'eyedropper') pickColor(Math.floor(x), Math.floor(y))
    return
  }
  const p = { x: Math.floor(x), y: Math.floor(y) }
  if (p.x === session.last.x && p.y === session.last.y) return
  session.moved = true
  session.points.push(p)
  applyStroke(p)
  session.last = p
}

export function strokeEnd(): void {
  if (!session) return
  const s = useEditor.getState()

  if (session.tool === 'contour') {
    // Fecha e preenche o contorno desenhado à mão livre
    const cel = s.sprite.cels.get(session.key)
    if (cel && s.settings.fill && session.points.length > 2) {
      rebuildFromBaseline(session, cel.data)
      const ctx = paintCtxFor(cel.data, false)
      const brush = makeBrush(s.settings.size, s.settings.shape)
      drawPolygon(ctx, brush, session.points, session.color, true, s.settings.stroke)
    }
  }

  if (session.tool === 'move' && session.floatMask) {
    // Move também a seleção
    const dx = session.last.x - session.start.x
    const dy = session.last.y - session.start.y
    if ((dx || dy) && s.selection) {
      const { width: w, height: h } = s.sprite
      const nm = makeMask(w, h)
      for (let yy = 0; yy < h; yy++) {
        for (let xx = 0; xx < w; xx++) {
          if (!s.selection[yy * w + xx]) continue
          const nx = xx + dx, ny = yy + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          nm[ny * w + nx] = 1
        }
      }
      useEditor.setState({ selection: nm })
    }
  }

  commitStroke()
}

export function strokeCancel(): void {
  if (!session) return
  const s = useEditor.getState()
  const cel = s.sprite.cels.get(session.key)
  if (cel) cel.data.set(session.baseline)
  session = null
  useEditor.setState({ strokeActive: false })
  s.bump()
}

function commitStroke(): void {
  if (!session) return
  const s = useEditor.getState()
  const sess = session
  session = null

  const patches = sess.tx.commit()
  const selChanged = sess.selBase !== useEditor.getState().selection
  if (patches.length === 0 && !selChanged) {
    useEditor.setState({ strokeActive: false })
    s.bump()
    return
  }

  s.history.push({
    label: sess.tx.label,
    patches: patches.length ? patches : undefined,
    selBefore: selChanged ? sess.selBase : undefined,
    selAfter: selChanged ? useEditor.getState().selection : undefined,
    ctxBefore: { frame: s.frameIndex, layer: s.layerIndex },
    ctxAfter: { frame: s.frameIndex, layer: s.layerIndex },
  })
  useEditor.setState({ strokeActive: false, historyRev: s.historyRev + 1 })
  s.bump()
}

/* ── Aplicação por ferramenta ────────────────────────────────────────────── */

function applyStroke(p: Pt): void {
  if (!session) return
  const s = useEditor.getState()
  const cel = s.sprite.cels.get(session.key)
  if (!cel) return

  const st = s.settings
  const { width: w, height: h } = s.sprite
  const brush = makeBrush(st.size, st.shape)
  const tool = session.tool

  const redraw = !ACCUMULATIVE.includes(tool)
  if (redraw) rebuildFromBaseline(session, cel.data)

  const ctx = paintCtxFor(cel.data, tool === 'eraser')
  const color = session.color

  switch (tool) {
    case 'pencil':
    case 'eraser':
    case 'contour': {
      let pts = session.points
      if (st.pixelPerfect && st.size === 1) pts = pixelPerfectFilter(pts)
      for (const sym of [0, 1, 2, 3]) {
        const variants = pts.map((q) => mirror(q, st.symmetry, w, h)[sym]).filter(Boolean)
        if (variants.length === 0) continue
        if (variants.length === 1) stampBrush(ctx, brush, variants[0].x, variants[0].y, color)
        for (let i = 1; i < variants.length; i++) {
          drawLine(ctx, brush, variants[i - 1].x, variants[i - 1].y, variants[i].x, variants[i].y, color)
        }
      }
      break
    }

    case 'spray': {
      for (const m of mirror(p, st.symmetry, w, h)) {
        spray(ctx, m.x, m.y, Math.max(1, st.size), st.sprayDensity, color)
      }
      break
    }

    case 'blur': {
      for (const m of mirror(p, st.symmetry, w, h)) {
        blurAt(ctx, brush, m.x, m.y, st.alpha / 255)
      }
      break
    }

    case 'shading': {
      const ramp = s.sprite.palette.length > 1 ? s.sprite.palette : null
      for (const m of mirror(p, st.symmetry, w, h)) {
        shadeAt(ctx, brush, m.x, m.y, session.useSecondary ? -st.shadeAmount : st.shadeAmount, ramp)
      }
      break
    }

    case 'line': {
      const a = session.start
      const b = p
      for (let i = 0; i < 4; i++) {
        const ma = mirror(a, st.symmetry, w, h)[i]
        const mb = mirror(b, st.symmetry, w, h)[i]
        if (!ma || !mb) continue
        drawLine(ctx, brush, ma.x, ma.y, mb.x, mb.y, color)
      }
      break
    }

    case 'rectangle': {
      const a = session.start
      const b = p
      for (let i = 0; i < 4; i++) {
        const ma = mirror(a, st.symmetry, w, h)[i]
        const mb = mirror(b, st.symmetry, w, h)[i]
        if (!ma || !mb) continue
        drawRect(ctx, brush, ma.x, ma.y, mb.x, mb.y, color, st.fill, st.stroke)
      }
      break
    }

    case 'ellipse': {
      const a = session.start
      const b = p
      for (let i = 0; i < 4; i++) {
        const ma = mirror(a, st.symmetry, w, h)[i]
        const mb = mirror(b, st.symmetry, w, h)[i]
        if (!ma || !mb) continue
        drawEllipse(ctx, brush, ma.x, ma.y, mb.x, mb.y, color, st.fill, st.stroke)
      }
      break
    }

    case 'gradient': {
      drawGradient(
        ctx, session.start.x, session.start.y, p.x, p.y,
        session.color, session.altColor,
        st.dither !== 'none', false,
      )
      break
    }

    case 'move': {
      applyMove(cel.data, p)
      break
    }
  }

  s.bump()
}

/* ── Balde ───────────────────────────────────────────────────────────────── */

function applyBucket(p: Pt, color: RGBA): void {
  if (!session) return
  const s = useEditor.getState()
  const cel = s.sprite.cels.get(session.key)
  if (!cel) return
  const st = s.settings
  const ctx = paintCtxFor(cel.data, false)
  const sample = st.sampleAllLayers
    ? compositeFrame(s.sprite, s.currentFrameId(), { includeReference: false })
    : undefined
  floodFill(ctx, p.x, p.y, color, {
    tolerance: st.tolerance,
    contiguous: st.contiguous,
    sample,
  })
}

/* ── Conta-gotas ─────────────────────────────────────────────────────────── */

export function pickColor(x: number, y: number, toSecondary = false): void {
  const s = useEditor.getState()
  const { width: w, height: h } = s.sprite
  if (x < 0 || y < 0 || x >= w || y >= h) return
  const buf = s.settings.sampleAllLayers === false
    ? s.sprite.cels.get(s.currentCelKey())?.data
    : compositeFrame(s.sprite, s.currentFrameId(), { includeReference: true })
  const c = (buf ?? new Uint32Array(0))[y * w + x] ?? 0
  if (toSecondary) s.setSecondary(c)
  else s.setPrimary(c)
  s.toast(getA(c) === 0 ? 'Transparente' : `Cor capturada`)
}

/* ── Mover ───────────────────────────────────────────────────────────────── */

function prepareMove(data: Uint32Array): void {
  if (!session) return
  const s = useEditor.getState()
  const { width: w, height: h } = s.sprite
  const mask = s.selection
  const float = new Uint32Array(w * h)
  if (mask) {
    for (let i = 0; i < float.length; i++) if (mask[i]) float[i] = data[i]
  } else {
    float.set(data)
  }
  session.floatData = float
  session.floatMask = mask ?? makeMask(w, h, 1)
}

function applyMove(data: Uint32Array, p: Pt): void {
  if (!session?.floatData || !session.floatMask) return
  const s = useEditor.getState()
  const { width: w, height: h } = s.sprite
  const dx = p.x - session.start.x
  const dy = p.y - session.start.y

  // Limpa a origem
  for (let i = 0; i < data.length; i++) if (session.floatMask[i]) data[i] = 0

  // Escreve no destino
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (!session.floatMask[i]) continue
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const c = session.floatData[i]
      if ((c >>> 24) === 0) continue
      data[ny * w + nx] = c
    }
  }
}

/* ── Seleção ─────────────────────────────────────────────────────────────── */

let selSession: { tool: ToolId; start: Pt; pts: Pt[]; base: Mask | null } | null = null

function beginSelection(p: Pt, tool: ToolId): void {
  const s = useEditor.getState()

  if (tool === 'wand') {
    applyWand(p)
    return
  }

  selSession = { tool, start: p, pts: [p], base: s.selection }
  useOverlay.getState().setMarquee({
    kind: tool === 'select-ellipse' ? 'ellipse' : tool === 'lasso' ? 'path' : 'rect',
    x0: p.x, y0: p.y, x1: p.x, y1: p.y,
    pts: tool === 'lasso' ? [p] : undefined,
  })
}

export function selectionMove(x: number, y: number): void {
  if (!selSession) return
  const p = { x: Math.floor(x), y: Math.floor(y) }
  const last = selSession.pts.at(-1)!
  if (p.x === last.x && p.y === last.y) return
  selSession.pts.push(p)
  useOverlay.getState().setMarquee({
    kind: selSession.tool === 'select-ellipse' ? 'ellipse' : selSession.tool === 'lasso' ? 'path' : 'rect',
    x0: selSession.start.x, y0: selSession.start.y, x1: p.x, y1: p.y,
    pts: selSession.tool === 'lasso' ? selSession.pts : undefined,
  })
}

export function selectionEnd(): void {
  if (!selSession) return
  const s = useEditor.getState()
  const { width: w, height: h } = s.sprite
  const { tool, start, pts, base } = selSession
  const end = pts.at(-1)!
  selSession = null
  useOverlay.getState().setMarquee(null)

  const x0 = Math.min(start.x, end.x), y0 = Math.min(start.y, end.y)
  const rect = { x: x0, y: y0, w: Math.abs(end.x - start.x) + 1, h: Math.abs(end.y - start.y) + 1 }

  let add: Mask
  if (tool === 'select-rect') add = rectMask(w, h, rect)
  else if (tool === 'select-ellipse') add = ellipseMaskOf(w, h, rect)
  else add = polygonMask(w, h, pts.map((q) => ({ x: q.x + 0.5, y: q.y + 0.5 })))

  // Toque simples sem arrastar limpa a seleção
  if (tool !== 'lasso' && rect.w <= 1 && rect.h <= 1 && s.settings.selectMode === 'replace') {
    if (base) s.structuralEdit('Desmarcar', () => useEditor.setState({ selection: null }))
    return
  }

  const next = combine(base, add, s.settings.selectMode, w, h)
  s.structuralEdit('Selecionar', () => s.setSelection(next))
}

function applyWand(p: Pt): void {
  const s = useEditor.getState()
  const { width: w, height: h } = s.sprite
  if (p.x < 0 || p.y < 0 || p.x >= w || p.y >= h) return

  const src = s.settings.sampleAllLayers
    ? compositeFrame(s.sprite, s.currentFrameId(), { includeReference: true })
    : s.sprite.cels.get(s.currentCelKey())?.data
  if (!src) return

  const target = src[p.y * w + p.x]
  const tol = s.settings.tolerance
  const matches = (c: number) => (tol <= 0 ? c === target : colorDistance(c, target) <= tol)

  const add = makeMask(w, h)
  if (!s.settings.contiguous) {
    for (let i = 0; i < add.length; i++) if (matches(src[i])) add[i] = 1
  } else {
    const stack: number[] = [p.x, p.y]
    while (stack.length) {
      const y = stack.pop()!
      const x = stack.pop()!
      const i = y * w + x
      if (x < 0 || y < 0 || x >= w || y >= h || add[i] || !matches(src[i])) continue
      add[i] = 1
      stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1)
    }
  }

  const next = combine(s.selection, add, s.settings.selectMode, w, h)
  s.structuralEdit('Varinha mágica', () => s.setSelection(next))
}

/* ── Polígono ────────────────────────────────────────────────────────────── */

export function finishPolygon(): void {
  const s = useEditor.getState()
  const pts = useOverlay.getState().polygon
  useOverlay.getState().setPolygon([])
  if (pts.length < 2) return

  const layer = s.currentLayer()
  if (layer.locked) { s.toast('Camada bloqueada', 'error'); return }
  const frameId = s.currentFrameId()
  ensureCel(s.sprite, layer.id, frameId)
  const key = celKey(layer.id, frameId)

  s.transaction('Polígono', (tx) => {
    tx.touch(key)
    const cel = s.sprite.cels.get(key)!
    const ctx = paintCtxFor(cel.data, false)
    const brush = makeBrush(s.settings.size, s.settings.shape)
    drawPolygon(ctx, brush, pts, s.primary, s.settings.fill, s.settings.stroke)
  })
}

export const cancelPolygon = () => useOverlay.getState().setPolygon([])

/* ── Rótulos ─────────────────────────────────────────────────────────────── */

const LABELS: Record<string, string> = {
  pencil: 'Lápis', eraser: 'Borracha', bucket: 'Balde', line: 'Linha',
  rectangle: 'Retângulo', ellipse: 'Elipse', contour: 'Contorno', polygon: 'Polígono',
  spray: 'Spray', gradient: 'Gradiente', blur: 'Desfoque', shading: 'Sombreamento',
  move: 'Mover',
}
export const toolLabel = (t: ToolId) => LABELS[t] ?? 'Desenhar'

export { putPixel }
