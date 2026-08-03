import { create } from 'zustand'
import type {
  BlendMode, GridSettings, Layer, OnionSettings, RGBA, Sprite, ToolId, ToolSettings, Tag,
} from '../core/types'
import { DEFAULT_TOOL_SETTINGS, celKey, uid } from '../core/types'
import {
  addFrame, addLayer, createSprite, duplicateLayer, ensureCel, getCel, makeTag, mergeDown,
  moveFrame, moveLayer, removeFrame, removeLayer, resizeCanvas, resizeSprite,
} from '../core/doc'
import { History, PixelTx, takeSnapshot } from '../core/history'
import {
  cropBuffer, flipBuffer, opaqueBounds, replaceColor, rotateBuffer, makePaintCtx, type Rect,
} from '../core/raster'
import { composeCel, compositeFrame, spriteColors } from '../core/composite'
import {
  combine, invertMask, makeMask, maskBounds, type Mask,
} from '../core/selection'
import { rgba, toHex } from '../core/color'
import { saveAutosave } from '../core/io/project'

/* ── Área de transferência ───────────────────────────────────────────────── */

export interface Clipboard {
  data: Uint32Array
  width: number
  height: number
  mask: Mask | null
}

/* ── Estado ──────────────────────────────────────────────────────────────── */

export interface Toast { id: string; text: string; kind: 'info' | 'error' | 'success' }

export type PanelId = 'tools' | 'color' | 'layers' | 'frames' | 'menu' | null
export type DialogId =
  | null | 'new' | 'resize-canvas' | 'resize-sprite' | 'grid' | 'export' | 'about'
  | 'palette' | 'tag' | 'import-sheet' | 'shortcuts' | 'preferences'

export interface EditorState {
  sprite: Sprite
  /** incrementado a cada alteração — dispara redesenho */
  rev: number
  /** incrementado quando a estrutura (camadas/frames) muda */
  structRev: number

  layerIndex: number
  frameIndex: number

  tool: ToolId
  prevTool: ToolId
  settings: ToolSettings
  primary: RGBA
  secondary: RGBA
  recentColors: RGBA[]

  selection: Mask | null
  clipboard: Clipboard | null

  zoom: number
  panX: number
  panY: number
  tiled: boolean
  /** tamanho do palco em pixels CSS, informado pelo Viewport */
  stageW: number
  stageH: number
  /** altura coberta pelo painel deslizante — a área útil é stageH menos isto */
  sheetH: number

  grid: GridSettings
  onion: OnionSettings

  playing: boolean
  loopTag: string | null

  history: History
  historyRev: number

  panel: PanelId
  dialog: DialogId
  dialogArg: unknown
  toasts: Toast[]
  dirty: boolean

  /** preview ao vivo do traço em andamento (índice do cel → dados) */
  strokeActive: boolean
}

export interface EditorActions {
  bump(struct?: boolean): void
  toast(text: string, kind?: Toast['kind']): void
  dismissToast(id: string): void

  currentLayer(): Layer
  currentFrameId(): string
  currentCelKey(): string

  setLayerIndex(i: number): void
  setFrameIndex(i: number): void

  setTool(t: ToolId): void
  setSettings(patch: Partial<ToolSettings>): void
  setPrimary(c: RGBA): void
  setSecondary(c: RGBA): void
  swapColors(): void
  pushRecent(c: RGBA): void

  setZoom(z: number): void
  setPan(x: number, y: number): void
  setView(z: number, x: number, y: number): void
  setStageSize(w: number, h: number): void
  setSheetHeight(h: number): void
  fitView(padding?: number): void
  zoomBy(factor: number): void
  toggleTiled(): void
  setGrid(patch: Partial<GridSettings>): void
  setOnion(patch: Partial<OnionSettings>): void

  openPanel(p: PanelId): void
  openDialog(d: DialogId, arg?: unknown): void

  /* Documento */
  newSprite(w: number, h: number, name?: string): void
  loadSprite(s: Sprite): void

  /* Histórico */
  undo(): void
  redo(): void
  transaction(label: string, fn: (tx: PixelTx) => void): void
  structuralEdit(label: string, fn: () => void): void

  /* Seleção */
  setSelection(m: Mask | null, label?: string): void
  selectAll(): void
  deselect(): void
  invertSelection(): void
  selectionBounds(): Rect | null

  /* Edição */
  copy(): void
  cut(): void
  paste(): void
  deleteSelection(): void

  /* Transformações */
  flip(horizontal: boolean, allFrames?: boolean): void
  rotate(quarters: number): void
  cropToSelection(): void
  trim(): void
  doResizeCanvas(rect: Rect): void
  doResizeSprite(w: number, h: number): void

  /* Camadas */
  addLayerAction(): void
  duplicateLayerAction(): void
  deleteLayerAction(): void
  moveLayerAction(delta: number): void
  mergeDownAction(): void
  flattenAction(): void
  setLayerProp(id: string, patch: Partial<Layer>): void
  clearLayer(): void

  /* Frames */
  addFrameAction(copy: boolean): void
  deleteFrameAction(): void
  moveFrameAction(delta: number): void
  setFrameDuration(index: number, ms: number): void
  setAllFrameDurations(ms: number): void
  togglePlay(): void

  /* Tags */
  addTagAction(name: string, from: number, to: number): void
  updateTag(id: string, patch: Partial<Tag>): void
  deleteTag(id: string): void

  /* Paleta */
  setPalette(colors: RGBA[]): void
  addPaletteColor(c: RGBA): void
  removePaletteColor(index: number): void
  setPaletteColor(index: number, c: RGBA): void
  paletteFromSprite(): void
  replaceSpriteColor(from: RGBA, to: RGBA, tolerance?: number): void

  /* Composição para exibição/exportação */
  compositeCurrent(includeReference?: boolean): Uint32Array
  compositeFrameAt(index: number, includeReference?: boolean): Uint32Array
}

export type Store = EditorState & EditorActions

const DEFAULT_GRID: GridSettings = {
  visible: false, width: 8, height: 8, offsetX: 0, offsetY: 0, pixelGrid: true,
}
const DEFAULT_ONION: OnionSettings = { enabled: false, prev: 1, next: 1, opacity: 110, tint: true }

let autosaveTimer: number | undefined
function scheduleAutosave(sprite: Sprite) {
  clearTimeout(autosaveTimer)
  autosaveTimer = window.setTimeout(() => saveAutosave(sprite), 1500)
}

export const useEditor = create<Store>()((set, get) => ({
  sprite: createSprite(32, 32),
  rev: 0,
  structRev: 0,
  layerIndex: 0,
  frameIndex: 0,

  tool: 'pencil',
  prevTool: 'pencil',
  settings: { ...DEFAULT_TOOL_SETTINGS },
  primary: rgba(0, 0, 0, 255),
  secondary: rgba(255, 255, 255, 255),
  recentColors: [],

  selection: null,
  clipboard: null,

  zoom: 8,
  panX: 0,
  panY: 0,
  tiled: false,
  stageW: 0,
  stageH: 0,
  sheetH: 0,

  grid: { ...DEFAULT_GRID },
  onion: { ...DEFAULT_ONION },

  playing: false,
  loopTag: null,

  history: new History(),
  historyRev: 0,

  panel: null,
  dialog: null,
  dialogArg: null,
  toasts: [],
  dirty: false,
  strokeActive: false,

  /* ── Básico ────────────────────────────────────────────────────────────── */

  bump(struct = false) {
    const s = get()
    set({ rev: s.rev + 1, structRev: struct ? s.structRev + 1 : s.structRev, dirty: true })
    scheduleAutosave(s.sprite)
  },

  toast(text, kind = 'info') {
    const id = uid('t')
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, kind }] }))
    setTimeout(() => get().dismissToast(id), kind === 'error' ? 4500 : 2600)
  },

  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },

  currentLayer() {
    const s = get()
    return s.sprite.layers[Math.min(s.layerIndex, s.sprite.layers.length - 1)]
  },

  currentFrameId() {
    const s = get()
    return s.sprite.frames[Math.min(s.frameIndex, s.sprite.frames.length - 1)].id
  },

  currentCelKey() {
    return celKey(get().currentLayer().id, get().currentFrameId())
  },

  setLayerIndex(i) {
    const max = get().sprite.layers.length - 1
    set({ layerIndex: Math.max(0, Math.min(max, i)) })
  },

  setFrameIndex(i) {
    const n = get().sprite.frames.length
    set({ frameIndex: ((i % n) + n) % n })
  },

  /* ── Ferramentas e cores ───────────────────────────────────────────────── */

  setTool(t) {
    const cur = get().tool
    if (cur === t) return
    set({ tool: t, prevTool: cur })
  },

  setSettings(patch) {
    set((s) => ({ settings: { ...s.settings, ...patch } }))
  },

  setPrimary(c) { set({ primary: c }); get().pushRecent(c) },
  setSecondary(c) { set({ secondary: c }) },
  swapColors() { set((s) => ({ primary: s.secondary, secondary: s.primary })) },

  pushRecent(c) {
    set((s) => ({ recentColors: [c, ...s.recentColors.filter((x) => x !== c)].slice(0, 16) }))
  },

  /* ── Visualização ──────────────────────────────────────────────────────── */

  setZoom(z) {
    set({ zoom: Math.max(0.25, Math.min(64, z)) })
  },
  setPan(x, y) { set({ panX: x, panY: y }) },
  setView(z, x, y) { set({ zoom: Math.max(0.25, Math.min(64, z)), panX: x, panY: y }) },

  setStageSize(w, h) {
    const s = get()
    if (s.stageW === w && s.stageH === h) return
    const first = s.stageW === 0
    set({ stageW: w, stageH: h })
    if (first) get().fitView()
  },

  /**
   * Enquadra o sprite na parte do palco que não está coberta pelo painel.
   * Sem isto o desenho fica centralizado atrás do painel e some da vista.
   */
  fitView(padding = 24) {
    const s = get()
    if (!s.stageW || !s.stageH) return
    const usableH = Math.max(80, s.stageH - s.sheetH)
    const zx = (s.stageW - padding * 2) / s.sprite.width
    const zy = (usableH - padding * 2) / s.sprite.height
    let z = Math.min(zx, zy)
    // Prefere ampliações inteiras quando cabem
    z = z >= 1 ? Math.max(1, Math.floor(z)) : Math.max(0.25, z)
    z = Math.min(64, z)
    set({
      zoom: z,
      panX: (s.stageW - s.sprite.width * z) / 2,
      panY: (usableH - s.sprite.height * z) / 2,
    })
  },

  /**
   * O painel abriu ou fechou: desloca a vista pela metade da diferença, para o
   * desenho continuar centralizado no espaço que sobrou (sem mexer no zoom).
   */
  setSheetHeight(h) {
    const s = get()
    const next = Math.max(0, Math.round(h))
    if (next === s.sheetH) return
    set({ sheetH: next, panY: s.panY - (next - s.sheetH) / 2 })
  },

  zoomBy(factor) {
    const s = get()
    const z = Math.max(0.25, Math.min(64, s.zoom * factor))
    if (z === s.zoom) return
    // Mantém fixo o centro da área visível (fora do painel)
    const cx = s.stageW / 2, cy = (s.stageH - s.sheetH) / 2
    const k = z / s.zoom
    set({ zoom: z, panX: cx - (cx - s.panX) * k, panY: cy - (cy - s.panY) * k })
  },
  toggleTiled() { set((s) => ({ tiled: !s.tiled })) },
  setGrid(patch) { set((s) => ({ grid: { ...s.grid, ...patch } })) },
  setOnion(patch) { set((s) => ({ onion: { ...s.onion, ...patch } })) },

  openPanel(p) { set((s) => ({ panel: s.panel === p ? null : p })) },
  openDialog(d, arg) { set({ dialog: d, dialogArg: arg ?? null }) },

  /* ── Documento ─────────────────────────────────────────────────────────── */

  newSprite(w, h, name) {
    const sprite = createSprite(w, h, name ?? 'Sem título')
    get().loadSprite(sprite)
  },

  loadSprite(sprite) {
    const hist = new History()
    set({
      sprite, rev: get().rev + 1, structRev: get().structRev + 1,
      layerIndex: sprite.layers.length - 1, frameIndex: 0,
      selection: null, history: hist, historyRev: 0, playing: false, dirty: false,
    })
    get().fitView()
  },

  /* ── Histórico ─────────────────────────────────────────────────────────── */

  undo() {
    const s = get()
    const e = s.history.undo(s.sprite)
    if (!e) { s.toast('Nada para desfazer'); return }
    set({
      selection: e.selBefore !== undefined ? e.selBefore : s.selection,
      layerIndex: Math.min(e.ctxBefore?.layer ?? s.layerIndex, s.sprite.layers.length - 1),
      frameIndex: Math.min(e.ctxBefore?.frame ?? s.frameIndex, s.sprite.frames.length - 1),
      historyRev: s.historyRev + 1,
    })
    s.bump(!!e.before)
  },

  redo() {
    const s = get()
    const e = s.history.redo(s.sprite)
    if (!e) { s.toast('Nada para refazer'); return }
    set({
      selection: e.selAfter !== undefined ? e.selAfter : s.selection,
      layerIndex: Math.min(e.ctxAfter?.layer ?? s.layerIndex, s.sprite.layers.length - 1),
      frameIndex: Math.min(e.ctxAfter?.frame ?? s.frameIndex, s.sprite.frames.length - 1),
      historyRev: s.historyRev + 1,
    })
    s.bump(!!e.after)
  },

  /** Edição de pixels: registra apenas as regiões alteradas. */
  transaction(label, fn) {
    const s = get()
    const tx = new PixelTx(s.sprite, label)
    const selBefore = s.selection
    fn(tx)
    const patches = tx.commit()
    const selAfter = get().selection
    const selChanged = selBefore !== selAfter
    if (patches.length === 0 && !selChanged) return
    s.history.push({
      label,
      patches: patches.length ? patches : undefined,
      selBefore: selChanged ? selBefore : undefined,
      selAfter: selChanged ? selAfter : undefined,
      ctxBefore: { frame: s.frameIndex, layer: s.layerIndex },
      ctxAfter: { frame: get().frameIndex, layer: get().layerIndex },
    })
    set({ historyRev: s.historyRev + 1 })
    s.bump()
  },

  /** Edição estrutural: guarda um snapshot completo antes/depois. */
  structuralEdit(label, fn) {
    const s = get()
    const before = takeSnapshot(s.sprite)
    const ctxBefore = { frame: s.frameIndex, layer: s.layerIndex }
    const selBefore = s.selection
    fn()
    const after = takeSnapshot(s.sprite)
    s.history.push({
      label, before, after,
      selBefore, selAfter: get().selection,
      ctxBefore, ctxAfter: { frame: get().frameIndex, layer: get().layerIndex },
    })
    set({ historyRev: s.historyRev + 1 })
    s.bump(true)
  },

  /* ── Seleção ───────────────────────────────────────────────────────────── */

  setSelection(m) {
    if (m) {
      let any = false
      for (let i = 0; i < m.length; i++) if (m[i]) { any = true; break }
      if (!any) m = null
    }
    set({ selection: m })
  },

  selectAll() {
    const s = get()
    const m = makeMask(s.sprite.width, s.sprite.height, 1)
    s.structuralEdit('Selecionar tudo', () => set({ selection: m }))
  },

  deselect() {
    const s = get()
    if (!s.selection) return
    s.structuralEdit('Desmarcar', () => set({ selection: null }))
  },

  invertSelection() {
    const s = get()
    const { width: w, height: h } = s.sprite
    const inv = s.selection ? invertMask(s.selection, w, h) : makeMask(w, h, 1)
    s.structuralEdit('Inverter seleção', () => set({ selection: inv }))
  },

  selectionBounds() {
    const s = get()
    if (!s.selection) return null
    return maskBounds(s.selection, s.sprite.width, s.sprite.height)
  },

  /* ── Copiar / colar ────────────────────────────────────────────────────── */

  copy() {
    const s = get()
    const cel = s.sprite.cels.get(s.currentCelKey())
    if (!cel) return
    const { width: w, height: h } = s.sprite
    const b = s.selection ? maskBounds(s.selection, w, h) : { x: 0, y: 0, w, h }
    if (!b) { s.toast('Seleção vazia'); return }

    const data = cropBuffer(cel.data, w, h, b)
    let mask: Mask | null = null
    if (s.selection) {
      mask = new Uint8Array(b.w * b.h)
      for (let y = 0; y < b.h; y++) {
        for (let x = 0; x < b.w; x++) mask[y * b.w + x] = s.selection[(b.y + y) * w + b.x + x]
      }
      for (let i = 0; i < data.length; i++) if (!mask[i]) data[i] = 0
    }
    set({ clipboard: { data, width: b.w, height: b.h, mask } })
    s.toast(`Copiado ${b.w}×${b.h}`, 'success')
  },

  cut() {
    const s = get()
    s.copy()
    s.deleteSelection()
  },

  paste() {
    const s = get()
    const clip = s.clipboard
    if (!clip) { s.toast('Área de transferência vazia'); return }
    const layer = s.currentLayer()
    if (layer.locked) { s.toast('Camada bloqueada', 'error'); return }

    const { width: w, height: h } = s.sprite
    const ox = Math.max(0, ((w - clip.width) / 2) | 0)
    const oy = Math.max(0, ((h - clip.height) / 2) | 0)
    const key = s.currentCelKey()

    s.transaction('Colar', (tx) => {
      tx.touch(key)
      const cel = ensureCel(s.sprite, layer.id, s.currentFrameId())
      for (let y = 0; y < clip.height; y++) {
        for (let x = 0; x < clip.width; x++) {
          const i = y * clip.width + x
          if (clip.mask && !clip.mask[i]) continue
          const c = clip.data[i]
          if ((c >>> 24) === 0) continue
          const dx = ox + x, dy = oy + y
          if (dx < 0 || dy < 0 || dx >= w || dy >= h) continue
          cel.data[dy * w + dx] = c
        }
      }
      // Seleciona o que foi colado, para permitir mover em seguida
      const m = makeMask(w, h)
      for (let y = 0; y < clip.height; y++) {
        for (let x = 0; x < clip.width; x++) {
          if (clip.mask && !clip.mask[y * clip.width + x]) continue
          const dx = ox + x, dy = oy + y
          if (dx < 0 || dy < 0 || dx >= w || dy >= h) continue
          m[dy * w + dx] = 1
        }
      }
      set({ selection: m })
    })
    set({ tool: 'move' })
  },

  deleteSelection() {
    const s = get()
    const layer = s.currentLayer()
    if (layer.locked) { s.toast('Camada bloqueada', 'error'); return }
    const key = s.currentCelKey()
    const cel = s.sprite.cels.get(key)
    if (!cel) return
    s.transaction('Apagar', (tx) => {
      tx.touch(key)
      if (!s.selection) cel.data.fill(0)
      else for (let i = 0; i < cel.data.length; i++) if (s.selection[i]) cel.data[i] = 0
    })
  },

  /* ── Transformações ────────────────────────────────────────────────────── */

  flip(horizontal, allFrames = false) {
    const s = get()
    const { width: w, height: h } = s.sprite
    const label = horizontal ? 'Espelhar horizontal' : 'Espelhar vertical'
    const sel = s.selection
    const bounds = sel ? maskBounds(sel, w, h) : null

    s.transaction(label, (tx) => {
      const targets = allFrames
        ? s.sprite.frames.map((f) => celKey(s.currentLayer().id, f.id))
        : [s.currentCelKey()]
      for (const key of targets) {
        const cel = s.sprite.cels.get(key)
        if (!cel) continue
        tx.touch(key)
        if (!bounds) {
          cel.data.set(flipBuffer(cel.data, w, h, horizontal))
        } else {
          const sub = cropBuffer(cel.data, w, h, bounds)
          const flipped = flipBuffer(sub, bounds.w, bounds.h, horizontal)
          for (let y = 0; y < bounds.h; y++) {
            for (let x = 0; x < bounds.w; x++) {
              const gi = (bounds.y + y) * w + bounds.x + x
              if (sel && !sel[gi]) continue
              cel.data[gi] = flipped[y * bounds.w + x]
            }
          }
        }
      }
    })
  },

  rotate(quarters) {
    const s = get()
    const q = ((quarters % 4) + 4) % 4
    if (q === 0) return
    const { width: w, height: h } = s.sprite
    const label = `Girar ${q * 90}°`

    if (q === 2) {
      s.transaction(label, (tx) => {
        const key = s.currentCelKey()
        const cel = s.sprite.cels.get(key)
        if (!cel) return
        tx.touch(key)
        cel.data.set(rotateBuffer(cel.data, w, h, 2).data)
      })
      return
    }

    // 90/270 alteram as dimensões: afeta o sprite inteiro
    s.structuralEdit(label, () => {
      for (const [k, cel] of s.sprite.cels) {
        const r = rotateBuffer(cel.data, w, h, q)
        s.sprite.cels.set(k, { data: r.data, opacity: cel.opacity })
      }
      s.sprite.width = h
      s.sprite.height = w
      set({ selection: null })
    })
  },

  cropToSelection() {
    const s = get()
    const b = s.selectionBounds()
    if (!b) { s.toast('Faça uma seleção primeiro', 'error'); return }
    s.structuralEdit('Recortar para a seleção', () => {
      resizeCanvas(s.sprite, b)
      set({ selection: null })
    })
  },

  trim() {
    const s = get()
    const { width: w, height: h } = s.sprite
    let box: Rect | null = null
    for (let i = 0; i < s.sprite.frames.length; i++) {
      const buf = s.compositeFrameAt(i, true)
      const b = opaqueBounds(buf, w, h)
      if (!b) continue
      box = box
        ? {
            x: Math.min(box.x, b.x), y: Math.min(box.y, b.y),
            w: Math.max(box.x + box.w, b.x + b.w) - Math.min(box.x, b.x),
            h: Math.max(box.y + box.h, b.y + b.h) - Math.min(box.y, b.y),
          }
        : b
    }
    if (!box) { s.toast('O sprite está vazio', 'error'); return }
    if (box.x === 0 && box.y === 0 && box.w === w && box.h === h) {
      s.toast('Nada para aparar'); return
    }
    s.structuralEdit('Aparar', () => {
      resizeCanvas(s.sprite, box!)
      set({ selection: null })
    })
  },

  doResizeCanvas(rect) {
    const s = get()
    s.structuralEdit('Redimensionar tela', () => {
      resizeCanvas(s.sprite, rect)
      set({ selection: null })
    })
  },

  doResizeSprite(w, h) {
    const s = get()
    if (w < 1 || h < 1 || w > 4096 || h > 4096) { s.toast('Tamanho inválido', 'error'); return }
    s.structuralEdit('Redimensionar sprite', () => {
      resizeSprite(s.sprite, w, h)
      set({ selection: null })
    })
  },

  /* ── Camadas ───────────────────────────────────────────────────────────── */

  addLayerAction() {
    const s = get()
    s.structuralEdit('Nova camada', () => {
      addLayer(s.sprite, s.layerIndex)
      set({ layerIndex: s.layerIndex + 1 })
    })
  },

  duplicateLayerAction() {
    const s = get()
    s.structuralEdit('Duplicar camada', () => {
      duplicateLayer(s.sprite, s.currentLayer().id)
      set({ layerIndex: s.layerIndex + 1 })
    })
  },

  deleteLayerAction() {
    const s = get()
    if (s.sprite.layers.length <= 1) { s.toast('É preciso ter ao menos uma camada', 'error'); return }
    const id = s.currentLayer().id
    s.structuralEdit('Excluir camada', () => {
      removeLayer(s.sprite, id)
      set({ layerIndex: Math.max(0, s.layerIndex - 1) })
    })
  },

  moveLayerAction(delta) {
    const s = get()
    const id = s.currentLayer().id
    const i = s.sprite.layers.findIndex((l) => l.id === id)
    if (i + delta < 0 || i + delta >= s.sprite.layers.length) return
    s.structuralEdit('Reordenar camada', () => {
      moveLayer(s.sprite, id, delta)
      set({ layerIndex: i + delta })
    })
  },

  mergeDownAction() {
    const s = get()
    if (s.layerIndex === 0) { s.toast('Não há camada abaixo', 'error'); return }
    const id = s.currentLayer().id
    s.structuralEdit('Mesclar abaixo', () => {
      mergeDown(s.sprite, id, (below, above, layer) => composeCel(below.data, above, layer))
      set({ layerIndex: Math.max(0, s.layerIndex - 1) })
    })
  },

  flattenAction() {
    const s = get()
    if (s.sprite.layers.length <= 1) return
    s.structuralEdit('Achatar imagem', () => {
      const sp = s.sprite
      const merged = sp.layers[0]
      for (const f of sp.frames) {
        const flat = compositeFrame(sp, f.id, { includeReference: false })
        sp.cels.set(celKey(merged.id, f.id), { data: flat, opacity: 255 })
      }
      for (const l of sp.layers.slice(1)) {
        for (const f of sp.frames) sp.cels.delete(celKey(l.id, f.id))
      }
      sp.layers = [{ ...merged, opacity: 255, blend: 'normal', visible: true, name: 'Achatada' }]
      set({ layerIndex: 0 })
    })
  },

  setLayerProp(id, patch) {
    const s = get()
    const layer = s.sprite.layers.find((l) => l.id === id)
    if (!layer) return
    Object.assign(layer, patch)
    s.bump(true)
  },

  clearLayer() {
    const s = get()
    const key = s.currentCelKey()
    s.transaction('Limpar camada', (tx) => {
      tx.touch(key)
      s.sprite.cels.get(key)?.data.fill(0)
    })
  },

  /* ── Frames ────────────────────────────────────────────────────────────── */

  addFrameAction(copy) {
    const s = get()
    s.structuralEdit(copy ? 'Duplicar frame' : 'Novo frame', () => {
      addFrame(s.sprite, s.frameIndex, copy ? s.frameIndex : undefined)
      set({ frameIndex: s.frameIndex + 1 })
    })
  },

  deleteFrameAction() {
    const s = get()
    if (s.sprite.frames.length <= 1) { s.toast('É preciso ter ao menos um frame', 'error'); return }
    const id = s.currentFrameId()
    s.structuralEdit('Excluir frame', () => {
      removeFrame(s.sprite, id)
      set({ frameIndex: Math.max(0, s.frameIndex - 1) })
    })
  },

  moveFrameAction(delta) {
    const s = get()
    const id = s.currentFrameId()
    const i = s.frameIndex
    if (i + delta < 0 || i + delta >= s.sprite.frames.length) return
    s.structuralEdit('Mover frame', () => {
      moveFrame(s.sprite, id, delta)
      set({ frameIndex: i + delta })
    })
  },

  setFrameDuration(index, ms) {
    const s = get()
    const f = s.sprite.frames[index]
    if (!f) return
    f.duration = Math.max(10, Math.min(10_000, Math.round(ms)))
    s.bump(true)
  },

  setAllFrameDurations(ms) {
    const s = get()
    const v = Math.max(10, Math.min(10_000, Math.round(ms)))
    for (const f of s.sprite.frames) f.duration = v
    s.bump(true)
  },

  togglePlay() {
    if (get().sprite.frames.length < 2) { get().toast('Adicione mais frames'); return }
    set((s) => ({ playing: !s.playing }))
  },

  /* ── Tags ──────────────────────────────────────────────────────────────── */

  addTagAction(name, from, to) {
    const s = get()
    s.structuralEdit('Nova tag', () => {
      s.sprite.tags.push(makeTag(name, Math.min(from, to), Math.max(from, to)))
    })
  },

  updateTag(id, patch) {
    const s = get()
    const t = s.sprite.tags.find((x) => x.id === id)
    if (!t) return
    Object.assign(t, patch)
    s.bump(true)
  },

  deleteTag(id) {
    const s = get()
    s.structuralEdit('Excluir tag', () => {
      s.sprite.tags = s.sprite.tags.filter((t) => t.id !== id)
    })
  },

  /* ── Paleta ────────────────────────────────────────────────────────────── */

  setPalette(colors) {
    const s = get()
    s.sprite.palette = colors.slice()
    s.bump(true)
  },

  addPaletteColor(c) {
    const s = get()
    if (s.sprite.palette.includes(c)) { s.toast(`${toHex(c)} já está na paleta`); return }
    s.sprite.palette = [...s.sprite.palette, c]
    s.bump(true)
  },

  removePaletteColor(index) {
    const s = get()
    s.sprite.palette = s.sprite.palette.filter((_, i) => i !== index)
    s.bump(true)
  },

  setPaletteColor(index, c) {
    const s = get()
    const p = s.sprite.palette.slice()
    if (index < 0 || index >= p.length) return
    p[index] = c
    s.sprite.palette = p
    s.bump(true)
  },

  paletteFromSprite() {
    const s = get()
    const colors = spriteColors(s.sprite).slice(0, 256)
    if (!colors.length) { s.toast('O sprite está vazio', 'error'); return }
    s.sprite.palette = colors
    s.bump(true)
    s.toast(`${colors.length} cores extraídas`, 'success')
  },

  replaceSpriteColor(from, to, tolerance = 0) {
    const s = get()
    s.transaction('Substituir cor', (tx) => {
      for (const layer of s.sprite.layers) {
        if (layer.locked) continue
        for (const frame of s.sprite.frames) {
          const key = celKey(layer.id, frame.id)
          const cel = s.sprite.cels.get(key)
          if (!cel) continue
          tx.touch(key)
          const ctx = makePaintCtx(cel.data, s.sprite.width, s.sprite.height, { mask: s.selection })
          replaceColor(ctx, from, to, tolerance)
        }
      }
    })
  },

  /* ── Composição ────────────────────────────────────────────────────────── */

  compositeCurrent(includeReference = false) {
    const s = get()
    return compositeFrame(s.sprite, s.currentFrameId(), { includeReference })
  },

  compositeFrameAt(index, includeReference = false) {
    const s = get()
    const f = s.sprite.frames[index]
    if (!f) return new Uint32Array(s.sprite.width * s.sprite.height)
    return compositeFrame(s.sprite, f.id, { includeReference })
  },
}))

/* ── Seletores auxiliares ────────────────────────────────────────────────── */

export const useSprite = () => useEditor((s) => s.sprite)
export const useRev = () => useEditor((s) => s.rev)

export function getCurrentCel(s: Store) {
  return getCel(s.sprite, s.currentLayer().id, s.currentFrameId())
}

export { celKey }
export type { BlendMode, Mask }
