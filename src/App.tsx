import { useEffect } from 'react'
import { useEditor } from './store/editor'
import { finishPolygon, useOverlay } from './store/drawing'
import { loadAutosave } from './core/io/project'
import { cssColor } from './core/color'
import { Viewport } from './ui/Viewport'
import { ToolsPanel } from './ui/ToolsPanel'
import { ColorPanel } from './ui/ColorPanel'
import { LayersPanel } from './ui/LayersPanel'
import { FramesPanel } from './ui/FramesPanel'
import { MenuSheet } from './ui/MenuSheet'
import { Dialogs } from './ui/Dialogs'
import { Sheet } from './ui/widgets'
import { Icon } from './ui/icons'
import { useAndroidBackButton, useKeyboard, usePlayback, useUnloadGuard } from './ui/hooks'

/* ── Barra superior ──────────────────────────────────────────────────────── */

function TopBar({ onMenu }: { onMenu: () => void }) {
  const undo = useEditor((s) => s.undo)
  const redo = useEditor((s) => s.redo)
  const historyRev = useEditor((s) => s.historyRev)
  const history = useEditor((s) => s.history)
  const sprite = useEditor((s) => s.sprite)
  const dirty = useEditor((s) => s.dirty)
  const playing = useEditor((s) => s.playing)
  const togglePlay = useEditor((s) => s.togglePlay)
  const fitView = useEditor((s) => s.fitView)
  void historyRev

  return (
    <header className="topbar">
      <button className="ibtn" onClick={onMenu} aria-label="Menu">
        <Icon name="menu" />
      </button>
      <button className="ibtn" onClick={undo} disabled={!history.canUndo} aria-label="Desfazer">
        <Icon name="undo" />
      </button>
      <button className="ibtn" onClick={redo} disabled={!history.canRedo} aria-label="Refazer">
        <Icon name="redo" />
      </button>

      <span className="title">
        {sprite.name}{dirty ? ' •' : ''}
      </span>

      <button
        className={`ibtn${playing ? ' on' : ''}`}
        onClick={togglePlay}
        disabled={sprite.frames.length < 2}
        aria-label="Reproduzir"
      >
        <Icon name={playing ? 'pause' : 'play'} />
      </button>
      <button className="ibtn" onClick={() => fitView()} aria-label="Ajustar à tela">
        <Icon name="fit" />
      </button>
    </header>
  )
}

/* ── Barra rápida ────────────────────────────────────────────────────────── */

const TOOL_ICON: Record<string, string> = {
  pencil: 'pencil', eraser: 'eraser', bucket: 'bucket', eyedropper: 'eyedropper',
  line: 'line', rectangle: 'rectangle', ellipse: 'ellipse', contour: 'contour',
  polygon: 'polygon', spray: 'spray', gradient: 'gradient', blur: 'blur',
  shading: 'shading', move: 'move', 'select-rect': 'select-rect',
  'select-ellipse': 'select-ellipse', lasso: 'lasso', wand: 'wand',
  hand: 'hand', zoom: 'zoom',
}

function QuickBar({ onColor }: { onColor: () => void }) {
  const settings = useEditor((s) => s.settings)
  const setSettings = useEditor((s) => s.setSettings)
  const primary = useEditor((s) => s.primary)
  const secondary = useEditor((s) => s.secondary)
  const swapColors = useEditor((s) => s.swapColors)
  const palette = useEditor((s) => s.sprite.palette)
  const setPrimary = useEditor((s) => s.setPrimary)

  return (
    <div className="quickbar">
      <button className="swatch-pair" onClick={onColor} aria-label="Cores">
        <span className="sw a checker" style={{ background: cssColor(primary) }} />
        <span className="sw b checker" style={{ background: cssColor(secondary) }} />
      </button>
      <button className="ibtn" onClick={swapColors} aria-label="Trocar cores" style={{ minWidth: 32 }}>
        <Icon name="swap" size={18} />
      </button>

      <span className="qsize">
        <button
          onClick={() => setSettings({ size: Math.max(1, settings.size - 1) })}
          aria-label="Diminuir pincel"
        >
          <Icon name="minus" size={16} />
        </button>
        <b>{settings.size}</b>
        <button
          onClick={() => setSettings({ size: Math.min(64, settings.size + 1) })}
          aria-label="Aumentar pincel"
        >
          <Icon name="plus" size={16} />
        </button>
      </span>

      <div className="strip" style={{ flex: 1, minWidth: 60 }}>
        {palette.map((c, i) => (
          <button
            key={`${c}-${i}`}
            className={`cell checker${c === primary ? ' on' : ''}`}
            style={{ background: cssColor(c) }}
            onClick={() => setPrimary(c)}
            aria-label={`Cor ${i + 1}`}
          />
        ))}
      </div>
    </div>
  )
}

/* ── Sobreposições do palco ──────────────────────────────────────────────── */

function StageOverlays({ onPickTool }: { onPickTool: () => void }) {
  const zoom = useEditor((s) => s.zoom)
  const zoomBy = useEditor((s) => s.zoomBy)
  const frameIndex = useEditor((s) => s.frameIndex)
  const total = useEditor((s) => s.sprite.frames.length)
  const setFrameIndex = useEditor((s) => s.setFrameIndex)
  const tool = useEditor((s) => s.tool)
  const polygon = useOverlay((s) => s.polygon)
  const cursor = useOverlay((s) => s.cursor)
  const sprite = useEditor((s) => s.sprite)

  const inside =
    cursor && cursor.x >= 0 && cursor.y >= 0 && cursor.x < sprite.width && cursor.y < sprite.height

  return (
    <>
      <div className="stage-overlay tl">
        <span className="pill">
          {zoom >= 1 ? `${Math.round(zoom * 100)}%` : `${zoom.toFixed(2)}×`}
          {inside && ` · ${cursor!.x},${cursor!.y}`}
        </span>
      </div>

      <div className="stage-overlay tr">
        <button className="fab" onClick={() => zoomBy(2)} aria-label="Aproximar">
          <Icon name="plus" size={20} />
        </button>
        <button className="fab" onClick={() => zoomBy(0.5)} aria-label="Afastar">
          <Icon name="minus" size={20} />
        </button>
      </div>

      {total > 1 && (
        <div className="stage-overlay bl">
          <button className="fab" onClick={() => setFrameIndex(frameIndex - 1)} aria-label="Frame anterior">
            <Icon name="chevron-left" size={20} />
          </button>
          <span className="pill">{frameIndex + 1}/{total}</span>
          <button className="fab" onClick={() => setFrameIndex(frameIndex + 1)} aria-label="Próximo frame">
            <Icon name="chevron-right" size={20} />
          </button>
        </div>
      )}

      {tool === 'polygon' && polygon.length >= 2 && (
        <div className="stage-overlay br" style={{ flexDirection: 'column', bottom: 62 }}>
          <button className="fab accent" onClick={finishPolygon} aria-label="Concluir polígono">
            <Icon name="check" size={22} />
          </button>
        </div>
      )}

      <div className="stage-overlay br">
        <button className="fab" onClick={onPickTool} aria-label="Escolher ferramenta">
          <Icon name={TOOL_ICON[tool] ?? 'pencil'} size={21} />
        </button>
      </div>
    </>
  )
}

/* ── Avisos ──────────────────────────────────────────────────────────────── */

function Toasts() {
  const toasts = useEditor((s) => s.toasts)
  if (!toasts.length) return null
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>
      ))}
    </div>
  )
}

/* ── App ─────────────────────────────────────────────────────────────────── */

const TABS = [
  { id: 'tools', label: 'Ferramentas', icon: 'brush' },
  { id: 'color', label: 'Cores', icon: 'palette' },
  { id: 'layers', label: 'Camadas', icon: 'layers' },
  { id: 'frames', label: 'Frames', icon: 'film' },
] as const

export default function App() {
  const panel = useEditor((s) => s.panel)
  const openPanel = useEditor((s) => s.openPanel)
  const loadSprite = useEditor((s) => s.loadSprite)
  const toast = useEditor((s) => s.toast)
  usePlayback()
  useKeyboard()
  useUnloadGuard()
  useAndroidBackButton()

  /* Recupera o trabalho anterior */
  useEffect(() => {
    const saved = loadAutosave()
    if (saved) {
      loadSprite(saved)
      useEditor.setState({ dirty: false })
      toast('Trabalho anterior recuperado')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const closePanel = () => openPanel(null)

  return (
    <div className="app">
      <TopBar onMenu={() => openPanel('menu')} />

      <Viewport>
        <StageOverlays onPickTool={() => openPanel('tools')} />
      </Viewport>

      <QuickBar onColor={() => openPanel('color')} />

      <nav className="tabbar">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={panel === t.id ? 'on' : ''}
            onClick={() => openPanel(t.id)}
          >
            <Icon name={t.icon} size={21} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      {panel === 'tools' && (
        <Sheet title="Ferramentas" onClose={closePanel}><ToolsPanel /></Sheet>
      )}
      {panel === 'color' && (
        <Sheet title="Cores" onClose={closePanel}><ColorPanel /></Sheet>
      )}
      {panel === 'layers' && (
        <Sheet title="Camadas" onClose={closePanel}><LayersPanel /></Sheet>
      )}
      {panel === 'frames' && (
        <Sheet title="Frames e animação" onClose={closePanel}><FramesPanel /></Sheet>
      )}

      {panel === 'menu' && <MenuSheet onClose={closePanel} />}

      <Dialogs />
      <Toasts />
    </div>
  )
}
