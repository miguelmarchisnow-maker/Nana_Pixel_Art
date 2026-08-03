import { useCallback, useEffect, useRef } from 'react'
import { useEditor } from '../store/editor'
import {
  isNavTool, isSelectionTool, selectionEnd, selectionMove, strokeBegin, strokeCancel,
  strokeEnd, strokeMove, useOverlay,
} from '../store/drawing'
import { compositeFrame, tintBuffer } from '../core/composite'
import { toImageData } from '../core/raster'
import { maskOutline } from '../core/selection'
import { rgba } from '../core/color'

const ONION_PREV = rgba(255, 80, 80)
const ONION_NEXT = rgba(80, 160, 255)

interface Ptr { id: number; x: number; y: number }

export function Viewport({ children }: { children?: React.ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  /* Buffers auxiliares reutilizados entre quadros */
  const offRef = useRef<HTMLCanvasElement | null>(null)
  const cacheRef = useRef<{ key: string; canvas: HTMLCanvasElement } | null>(null)
  const antsRef = useRef(0)
  const rafRef = useRef(0)
  const dirtyRef = useRef(true)

  /* Estado dos ponteiros */
  const ptrs = useRef<Map<number, Ptr>>(new Map())
  const modeRef = useRef<'idle' | 'draw' | 'select' | 'pan' | 'pinch'>('idle')
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 })
  const pinchStart = useRef({ dist: 0, midX: 0, midY: 0, zoom: 1, panX: 0, panY: 0 })

  const invalidate = useCallback(() => {
    dirtyRef.current = true
  }, [])

  /* ── Conversão de coordenadas ──────────────────────────────────────────── */

  const toSprite = useCallback((clientX: number, clientY: number) => {
    const cv = canvasRef.current
    if (!cv) return { x: 0, y: 0 }
    const r = cv.getBoundingClientRect()
    const s = useEditor.getState()
    return {
      x: (clientX - r.left - s.panX) / s.zoom,
      y: (clientY - r.top - s.panY) / s.zoom,
    }
  }, [])

  /* ── Renderização ──────────────────────────────────────────────────────── */

  const render = useCallback(() => {
    const cv = canvasRef.current
    const wrap = wrapRef.current
    if (!cv || !wrap) return

    const s = useEditor.getState()
    const ov = useOverlay.getState()
    const sp = s.sprite
    const dpr = Math.min(3, window.devicePixelRatio || 1)
    const cw = wrap.clientWidth
    const ch = wrap.clientHeight
    if (cw === 0 || ch === 0) return

    if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) {
      cv.width = Math.round(cw * dpr)
      cv.height = Math.round(ch * dpr)
    }

    const g = cv.getContext('2d')
    if (!g) return
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, cw, ch)
    g.imageSmoothingEnabled = false

    const z = s.zoom
    const ox = s.panX
    const oy = s.panY
    const dw = sp.width * z
    const dh = sp.height * z

    /* Fundo xadrez */
    g.save()
    g.beginPath()
    g.rect(ox, oy, dw, dh)
    g.clip()
    const cell = 8
    g.fillStyle = '#a8a8a8'
    g.fillRect(ox, oy, dw, dh)
    g.fillStyle = '#8e8e8e'
    const startX = Math.floor(-Math.min(0, ox) / cell) * cell
    const startY = Math.floor(-Math.min(0, oy) / cell) * cell
    for (let y = startY; y < dh; y += cell) {
      for (let x = startX; x < dw; x += cell) {
        if (((x / cell) + (y / cell)) % 2 === 0) continue
        g.fillRect(ox + x, oy + y, cell, cell)
      }
    }
    g.restore()

    /* Composição do frame atual (com cache) */
    const key = [
      s.rev, s.structRev, s.frameIndex, sp.width, sp.height,
      s.onion.enabled ? `${s.onion.prev}/${s.onion.next}/${s.onion.opacity}/${s.onion.tint}` : '0',
    ].join(':')

    let off = cacheRef.current
    if (!off || off.key !== key) {
      let canvas = offRef.current
      if (!canvas) { canvas = document.createElement('canvas'); offRef.current = canvas }
      if (canvas.width !== sp.width || canvas.height !== sp.height) {
        canvas.width = sp.width
        canvas.height = sp.height
      }
      const oc = canvas.getContext('2d')!
      oc.clearRect(0, 0, sp.width, sp.height)

      /* Onion skin: dos frames mais distantes para os mais próximos */
      if (s.onion.enabled && sp.frames.length > 1) {
        const stack: { idx: number; tint: number | null }[] = []
        for (let k = s.onion.prev; k >= 1; k--) {
          stack.push({ idx: s.frameIndex - k, tint: s.onion.tint ? ONION_PREV : null })
        }
        for (let k = s.onion.next; k >= 1; k--) {
          stack.push({ idx: s.frameIndex + k, tint: s.onion.tint ? ONION_NEXT : null })
        }
        const layersBuf = new Uint32Array(sp.width * sp.height)
        for (const it of stack) {
          if (it.idx < 0 || it.idx >= sp.frames.length) continue
          const buf = compositeFrame(sp, sp.frames[it.idx].id, { includeReference: true })
          tintBuffer(buf, it.tint, s.onion.opacity)
          for (let i = 0; i < buf.length; i++) {
            const c = buf[i]
            if ((c >>> 24) === 0) continue
            layersBuf[i] = c
          }
        }
        oc.putImageData(toImageData(layersBuf, sp.width, sp.height), 0, 0)
      }

      /* Frame atual por cima */
      const cur = compositeFrame(sp, sp.frames[Math.min(s.frameIndex, sp.frames.length - 1)].id, {
        includeReference: true,
      })
      const tmp = document.createElement('canvas')
      tmp.width = sp.width
      tmp.height = sp.height
      tmp.getContext('2d')!.putImageData(toImageData(cur, sp.width, sp.height), 0, 0)
      oc.drawImage(tmp, 0, 0)

      off = { key, canvas }
      cacheRef.current = off
    }

    /* Modo lado a lado */
    if (s.tiled) {
      g.globalAlpha = 0.45
      for (let ty = -1; ty <= 1; ty++) {
        for (let tx = -1; tx <= 1; tx++) {
          if (tx === 0 && ty === 0) continue
          g.drawImage(off.canvas, ox + tx * dw, oy + ty * dh, dw, dh)
        }
      }
      g.globalAlpha = 1
    }

    g.drawImage(off.canvas, ox, oy, dw, dh)

    /* Borda da tela */
    g.strokeStyle = 'rgba(255,255,255,0.28)'
    g.lineWidth = 1
    g.strokeRect(ox - 0.5, oy - 0.5, dw + 1, dh + 1)

    /* Grades */
    if (z >= 6 && s.grid.pixelGrid) {
      g.strokeStyle = 'rgba(255,255,255,0.09)'
      g.beginPath()
      for (let x = 1; x < sp.width; x++) {
        const px = Math.round(ox + x * z) + 0.5
        g.moveTo(px, oy); g.lineTo(px, oy + dh)
      }
      for (let y = 1; y < sp.height; y++) {
        const py = Math.round(oy + y * z) + 0.5
        g.moveTo(ox, py); g.lineTo(ox + dw, py)
      }
      g.stroke()
    }

    if (s.grid.visible && s.grid.width > 0 && s.grid.height > 0 && z * s.grid.width >= 5) {
      g.strokeStyle = 'rgba(90,155,255,0.5)'
      g.beginPath()
      for (let x = s.grid.offsetX % s.grid.width; x < sp.width; x += s.grid.width) {
        if (x <= 0) continue
        const px = Math.round(ox + x * z) + 0.5
        g.moveTo(px, oy); g.lineTo(px, oy + dh)
      }
      for (let y = s.grid.offsetY % s.grid.height; y < sp.height; y += s.grid.height) {
        if (y <= 0) continue
        const py = Math.round(oy + y * z) + 0.5
        g.moveTo(ox, py); g.lineTo(ox + dw, py)
      }
      g.stroke()
    }

    /* Eixos de simetria */
    if (s.settings.symmetry !== 'none') {
      g.strokeStyle = 'rgba(255,120,200,0.75)'
      g.setLineDash([6, 5])
      g.lineWidth = 1.5
      g.beginPath()
      if (s.settings.symmetry === 'horizontal' || s.settings.symmetry === 'both') {
        const px = ox + dw / 2
        g.moveTo(px, oy); g.lineTo(px, oy + dh)
      }
      if (s.settings.symmetry === 'vertical' || s.settings.symmetry === 'both') {
        const py = oy + dh / 2
        g.moveTo(ox, py); g.lineTo(ox + dw, py)
      }
      g.stroke()
      g.setLineDash([])
    }

    /* Seleção — formigas marchando */
    if (s.selection) {
      const segs = maskOutline(s.selection, sp.width, sp.height)
      if (segs.length) {
        g.lineWidth = 1
        g.setLineDash([4, 4])
        for (const [color, offset] of [['#000', 0], ['#fff', 4]] as const) {
          g.strokeStyle = color
          g.lineDashOffset = offset - antsRef.current
          g.beginPath()
          for (let i = 0; i < segs.length; i += 4) {
            g.moveTo(ox + segs[i] * z, oy + segs[i + 1] * z)
            g.lineTo(ox + segs[i + 2] * z, oy + segs[i + 3] * z)
          }
          g.stroke()
        }
        g.setLineDash([])
        g.lineDashOffset = 0
      }
    }

    /* Marquise em construção */
    const mq = ov.marquee
    if (mq) {
      g.strokeStyle = '#fff'
      g.lineWidth = 1.5
      g.setLineDash([5, 4])
      g.beginPath()
      if (mq.kind === 'rect') {
        const x0 = Math.min(mq.x0, mq.x1), y0 = Math.min(mq.y0, mq.y1)
        const w = Math.abs(mq.x1 - mq.x0) + 1, h = Math.abs(mq.y1 - mq.y0) + 1
        g.rect(ox + x0 * z, oy + y0 * z, w * z, h * z)
      } else if (mq.kind === 'ellipse') {
        const x0 = Math.min(mq.x0, mq.x1), y0 = Math.min(mq.y0, mq.y1)
        const w = Math.abs(mq.x1 - mq.x0) + 1, h = Math.abs(mq.y1 - mq.y0) + 1
        g.ellipse(ox + (x0 + w / 2) * z, oy + (y0 + h / 2) * z, (w * z) / 2, (h * z) / 2, 0, 0, Math.PI * 2)
      } else if (mq.pts) {
        mq.pts.forEach((p, i) => {
          const px = ox + (p.x + 0.5) * z, py = oy + (p.y + 0.5) * z
          if (i === 0) g.moveTo(px, py)
          else g.lineTo(px, py)
        })
        g.closePath()
      }
      g.stroke()
      g.setLineDash([])
    }

    /* Polígono em construção */
    if (ov.polygon.length) {
      g.strokeStyle = '#5b9bff'
      g.lineWidth = 2
      g.beginPath()
      ov.polygon.forEach((p, i) => {
        const px = ox + (p.x + 0.5) * z, py = oy + (p.y + 0.5) * z
        if (i === 0) g.moveTo(px, py)
        else g.lineTo(px, py)
      })
      g.stroke()
      g.fillStyle = '#5b9bff'
      for (const p of ov.polygon) {
        g.beginPath()
        g.arc(ox + (p.x + 0.5) * z, oy + (p.y + 0.5) * z, 3.5, 0, Math.PI * 2)
        g.fill()
      }
    }

    /* Cursor do pincel */
    const cur = ov.cursor
    if (cur && z >= 3 && !isNavTool(s.tool)) {
      const size = s.settings.size
      const half = Math.floor((size - 1) / 2)
      g.strokeStyle = 'rgba(255,255,255,0.85)'
      g.lineWidth = 1
      g.strokeRect(
        Math.round(ox + (cur.x - half) * z) + 0.5,
        Math.round(oy + (cur.y - half) * z) + 0.5,
        size * z, size * z,
      )
    }
  }, [])

  /* ── Laço de animação ──────────────────────────────────────────────────── */

  useEffect(() => {
    let last = 0
    const loop = (t: number) => {
      rafRef.current = requestAnimationFrame(loop)
      const s = useEditor.getState()
      const needsAnts = !!s.selection || !!useOverlay.getState().marquee
      if (needsAnts && t - last > 90) {
        antsRef.current = (antsRef.current + 1) % 8
        dirtyRef.current = true
        last = t
      }
      if (!dirtyRef.current) return
      dirtyRef.current = false
      render()
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [render])

  /* Redesenha quando o estado relevante muda */
  useEffect(() => {
    const unsubA = useEditor.subscribe(invalidate)
    const unsubB = useOverlay.subscribe(invalidate)
    return () => { unsubA(); unsubB() }
  }, [invalidate])

  /* Observa o tamanho do palco */
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const ro = new ResizeObserver(() => {
      useEditor.getState().setStageSize(wrap.clientWidth, wrap.clientHeight)
      invalidate()
    })
    ro.observe(wrap)
    useEditor.getState().setStageSize(wrap.clientWidth, wrap.clientHeight)
    return () => ro.disconnect()
  }, [invalidate])

  /* ── Ponteiros ─────────────────────────────────────────────────────────── */

  const dist = (a: Ptr, b: Ptr) => Math.hypot(a.x - b.x, a.y - b.y)

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const cv = canvasRef.current
    if (!cv) return
    cv.setPointerCapture(e.pointerId)
    ptrs.current.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY })
    const n = ptrs.current.size
    const s = useEditor.getState()

    if (n === 2) {
      // Dois dedos: cancela o traço e entra em navegação
      if (modeRef.current === 'draw') strokeCancel()
      if (modeRef.current === 'select') { useOverlay.getState().setMarquee(null) }
      const [a, b] = [...ptrs.current.values()]
      pinchStart.current = {
        dist: Math.max(1, dist(a, b)),
        midX: (a.x + b.x) / 2,
        midY: (a.y + b.y) / 2,
        zoom: s.zoom,
        panX: s.panX,
        panY: s.panY,
      }
      modeRef.current = 'pinch'
      return
    }

    if (n > 2) return

    /* Um ponteiro */
    const secondary = e.button === 2 || e.pointerType === 'pen' && e.buttons === 32

    if (s.tool === 'hand' || e.button === 1) {
      panStart.current = { x: e.clientX, y: e.clientY, panX: s.panX, panY: s.panY }
      modeRef.current = 'pan'
      return
    }

    const p = toSprite(e.clientX, e.clientY)
    useOverlay.getState().setCursor({ x: Math.floor(p.x), y: Math.floor(p.y) })

    if (s.tool === 'zoom') {
      s.zoomBy(secondary ? 1 / 1.5 : 1.5)
      modeRef.current = 'idle'
      return
    }

    if (isSelectionTool(s.tool)) {
      modeRef.current = 'select'
      strokeBegin(p.x, p.y, secondary)
      return
    }

    modeRef.current = 'draw'
    strokeBegin(p.x, p.y, secondary)
  }, [toSprite])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!ptrs.current.has(e.pointerId)) {
      // Move sem pressionar: só atualiza o cursor
      if (e.pointerType === 'mouse') {
        const p = toSprite(e.clientX, e.clientY)
        useOverlay.getState().setCursor({ x: Math.floor(p.x), y: Math.floor(p.y) })
      }
      return
    }
    ptrs.current.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY })

    const mode = modeRef.current

    if (mode === 'pinch' && ptrs.current.size >= 2) {
      const [a, b] = [...ptrs.current.values()]
      const d = Math.max(1, dist(a, b))
      const midX = (a.x + b.x) / 2
      const midY = (a.y + b.y) / 2
      const st = pinchStart.current
      const z = Math.max(0.25, Math.min(64, st.zoom * (d / st.dist)))
      const k = z / st.zoom
      // Mantém o ponto do sprite sob o centro dos dedos
      useEditor.getState().setView(z, midX - (st.midX - st.panX) * k, midY - (st.midY - st.panY) * k)
      return
    }

    if (mode === 'pan') {
      const st = panStart.current
      useEditor.getState().setPan(st.panX + (e.clientX - st.x), st.panY + (e.clientY - st.y))
      return
    }

    const p = toSprite(e.clientX, e.clientY)
    useOverlay.getState().setCursor({ x: Math.floor(p.x), y: Math.floor(p.y) })

    if (mode === 'draw') strokeMove(p.x, p.y)
    else if (mode === 'select') selectionMove(p.x, p.y)
  }, [toSprite])

  const finishPointer = useCallback((e: React.PointerEvent) => {
    ptrs.current.delete(e.pointerId)
    const mode = modeRef.current

    if (ptrs.current.size === 0) {
      if (mode === 'draw') strokeEnd()
      else if (mode === 'select') selectionEnd()
      modeRef.current = 'idle'
      if (e.pointerType !== 'mouse') useOverlay.getState().setCursor(null)
    } else if (mode === 'pinch' && ptrs.current.size === 1) {
      // Um dedo levantado: continua em modo panorâmico
      const s = useEditor.getState()
      const rest = [...ptrs.current.values()][0]
      panStart.current = { x: rest.x, y: rest.y, panX: s.panX, panY: s.panY }
      modeRef.current = 'pan'
    }
  }, [])

  return (
    <div className="stage" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
        onContextMenu={(e) => e.preventDefault()}
      />
      {children}
    </div>
  )
}
