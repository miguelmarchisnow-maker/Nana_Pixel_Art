import { useEditor } from '../store/editor'
import { cancelPolygon, finishPolygon, useOverlay } from '../store/drawing'
import type { BrushShape, DitherPattern, SelectMode, SymmetryMode, ToolId } from '../core/types'
import { Icon } from './icons'
import { Chips, Slider, Switch } from './widgets'

interface ToolDef { id: ToolId; label: string; icon: string }

const TOOL_GROUPS: { title: string; tools: ToolDef[] }[] = [
  {
    title: 'Desenho',
    tools: [
      { id: 'pencil', label: 'Lápis', icon: 'pencil' },
      { id: 'eraser', label: 'Borracha', icon: 'eraser' },
      { id: 'bucket', label: 'Balde', icon: 'bucket' },
      { id: 'eyedropper', label: 'Conta-gotas', icon: 'eyedropper' },
      { id: 'spray', label: 'Spray', icon: 'spray' },
      { id: 'blur', label: 'Desfoque', icon: 'blur' },
      { id: 'shading', label: 'Sombra', icon: 'shading' },
      { id: 'gradient', label: 'Gradiente', icon: 'gradient' },
    ],
  },
  {
    title: 'Formas',
    tools: [
      { id: 'line', label: 'Linha', icon: 'line' },
      { id: 'rectangle', label: 'Retângulo', icon: 'rectangle' },
      { id: 'ellipse', label: 'Elipse', icon: 'ellipse' },
      { id: 'contour', label: 'Contorno', icon: 'contour' },
      { id: 'polygon', label: 'Polígono', icon: 'polygon' },
    ],
  },
  {
    title: 'Seleção',
    tools: [
      { id: 'select-rect', label: 'Retângulo', icon: 'select-rect' },
      { id: 'select-ellipse', label: 'Elipse', icon: 'select-ellipse' },
      { id: 'lasso', label: 'Laço', icon: 'lasso' },
      { id: 'wand', label: 'Varinha', icon: 'wand' },
      { id: 'move', label: 'Mover', icon: 'move' },
    ],
  },
  {
    title: 'Navegação',
    tools: [
      { id: 'hand', label: 'Mão', icon: 'hand' },
      { id: 'zoom', label: 'Zoom', icon: 'zoom' },
    ],
  },
]

const SHAPE_OPTS: { id: BrushShape; label: string }[] = [
  { id: 'circle', label: 'Círculo' },
  { id: 'square', label: 'Quadrado' },
  { id: 'diamond', label: 'Losango' },
]

const DITHER_OPTS: { id: DitherPattern; label: string }[] = [
  { id: 'none', label: 'Sólido' },
  { id: 'checker', label: 'Xadrez' },
  { id: 'dots25', label: '25%' },
  { id: 'dots75', label: '75%' },
  { id: 'bayer4', label: 'Bayer' },
  { id: 'lines-h', label: '—' },
  { id: 'lines-v', label: '|' },
]

const SYM_OPTS: { id: SymmetryMode; label: string }[] = [
  { id: 'none', label: 'Nenhuma' },
  { id: 'horizontal', label: 'Horizontal' },
  { id: 'vertical', label: 'Vertical' },
  { id: 'both', label: 'Ambas' },
]

const SELMODE_OPTS: { id: SelectMode; label: string }[] = [
  { id: 'replace', label: 'Substituir' },
  { id: 'add', label: 'Somar' },
  { id: 'subtract', label: 'Subtrair' },
  { id: 'intersect', label: 'Interseção' },
]

const HAS_BRUSH: ToolId[] = ['pencil', 'eraser', 'line', 'rectangle', 'ellipse', 'contour', 'polygon', 'blur', 'shading', 'spray']
const HAS_FILL: ToolId[] = ['rectangle', 'ellipse', 'contour', 'polygon']
const HAS_TOLERANCE: ToolId[] = ['bucket', 'wand']
const HAS_SYMMETRY: ToolId[] = ['pencil', 'eraser', 'line', 'rectangle', 'ellipse', 'contour', 'spray', 'blur', 'shading']
const HAS_DITHER: ToolId[] = ['pencil', 'line', 'rectangle', 'ellipse', 'contour', 'polygon', 'gradient', 'bucket']

export function ToolsPanel() {
  const tool = useEditor((s) => s.tool)
  const st = useEditor((s) => s.settings)
  const setTool = useEditor((s) => s.setTool)
  const set = useEditor((s) => s.setSettings)
  const polygon = useOverlay((s) => s.polygon)

  return (
    <>
      {TOOL_GROUPS.map((g) => (
        <div key={g.title}>
          <div className="section-title">{g.title}</div>
          <div className="tool-grid">
            {g.tools.map((t) => (
              <button
                key={t.id}
                className={`tool-cell${tool === t.id ? ' on' : ''}`}
                onClick={() => setTool(t.id)}
              >
                <Icon name={t.icon} size={21} />
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      {tool === 'polygon' && polygon.length > 0 && (
        <>
          <div className="hr" />
          <div className="spread">
            <button className="btn primary" onClick={finishPolygon}>
              <Icon name="check" size={18} /> Concluir ({polygon.length})
            </button>
            <button className="btn" onClick={cancelPolygon}>Cancelar</button>
          </div>
        </>
      )}

      <div className="section-title">Opções</div>

      {HAS_BRUSH.includes(tool) && (
        <>
          <Slider label="Tamanho" value={st.size} min={1} max={64} onChange={(v) => set({ size: v })} />
          <div className="row">
            <label>Ponta</label>
            <div className="grow">
              <Chips options={SHAPE_OPTS} value={st.shape} onChange={(shape) => set({ shape })} />
            </div>
          </div>
        </>
      )}

      <Slider
        label={tool === 'blur' ? 'Força' : 'Opacidade'}
        value={st.alpha}
        min={1}
        max={255}
        onChange={(v) => set({ alpha: v })}
        format={(v) => `${Math.round((v / 255) * 100)}%`}
      />

      {HAS_TOLERANCE.includes(tool) && (
        <>
          <Slider
            label="Tolerância"
            value={st.tolerance}
            min={0}
            max={255}
            onChange={(v) => set({ tolerance: v })}
          />
          <Switch
            label="Somente área conectada"
            checked={st.contiguous}
            onChange={(contiguous) => set({ contiguous })}
          />
          <Switch
            label="Amostrar todas as camadas"
            checked={st.sampleAllLayers}
            onChange={(sampleAllLayers) => set({ sampleAllLayers })}
          />
        </>
      )}

      {tool === 'eyedropper' && (
        <Switch
          label="Amostrar todas as camadas"
          checked={st.sampleAllLayers}
          onChange={(sampleAllLayers) => set({ sampleAllLayers })}
        />
      )}

      {HAS_FILL.includes(tool) && (
        <>
          <Switch label="Preencher" checked={st.fill} onChange={(fill) => set({ fill })} />
          <Switch label="Contorno" checked={st.stroke} onChange={(stroke) => set({ stroke })} />
        </>
      )}

      {tool === 'spray' && (
        <Slider
          label="Densidade"
          value={st.sprayDensity}
          min={1}
          max={120}
          onChange={(sprayDensity) => set({ sprayDensity })}
        />
      )}

      {tool === 'shading' && (
        <Slider
          label="Intensidade"
          value={Math.round(st.shadeAmount * 100)}
          min={5}
          max={100}
          onChange={(v) => set({ shadeAmount: v / 100 })}
          format={(v) => `${v}%`}
        />
      )}

      {(tool === 'pencil' || tool === 'eraser') && (
        <Switch
          label="Pixel perfect"
          checked={st.pixelPerfect}
          onChange={(pixelPerfect) => set({ pixelPerfect })}
        />
      )}

      {HAS_DITHER.includes(tool) && (
        <div className="row">
          <label>Dither</label>
          <div className="grow">
            <Chips options={DITHER_OPTS} value={st.dither} onChange={(dither) => set({ dither })} />
          </div>
        </div>
      )}

      {HAS_SYMMETRY.includes(tool) && (
        <div className="row">
          <label>Simetria</label>
          <div className="grow">
            <Chips options={SYM_OPTS} value={st.symmetry} onChange={(symmetry) => set({ symmetry })} />
          </div>
        </div>
      )}

      {(tool === 'select-rect' || tool === 'select-ellipse' || tool === 'lasso' || tool === 'wand') && (
        <div className="row">
          <label>Modo</label>
          <div className="grow">
            <Chips options={SELMODE_OPTS} value={st.selectMode} onChange={(selectMode) => set({ selectMode })} />
          </div>
        </div>
      )}
    </>
  )
}
