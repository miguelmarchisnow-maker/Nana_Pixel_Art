import { useState } from 'react'
import { useEditor } from '../store/editor'
import type { LoopDirection } from '../core/types'
import { BUILTIN_PALETTES } from '../core/palettes'
import { cssColor } from '../core/color'
import type { SheetLayout } from '../core/io/sheet'
import { Dialog, NumberField, Slider, Switch } from './widgets'
import { Icon } from './icons'
import { exportGifFile, exportPng, exportSpriteSheet, importSpriteSheet } from './actions'

const PRESETS: [number, number, string][] = [
  [8, 8, 'Ícone'],
  [16, 16, 'Tile'],
  [32, 32, 'Sprite'],
  [48, 48, ''],
  [64, 64, 'Personagem'],
  [96, 96, ''],
  [128, 128, 'Cena'],
  [160, 144, 'Game Boy'],
  [256, 224, 'SNES'],
  [320, 180, 'Widescreen'],
]

export function Dialogs() {
  const dialog = useEditor((s) => s.dialog)
  const openDialog = useEditor((s) => s.openDialog)
  const close = () => openDialog(null)

  switch (dialog) {
    case 'new': return <NewSpriteDialog onClose={close} />
    case 'resize-sprite': return <ResizeSpriteDialog onClose={close} />
    case 'resize-canvas': return <ResizeCanvasDialog onClose={close} />
    case 'grid': return <GridDialog onClose={close} />
    case 'export': return <ExportDialog onClose={close} />
    case 'palette': return <PaletteDialog onClose={close} />
    case 'tag': return <TagDialog onClose={close} />
    case 'import-sheet': return <ImportSheetDialog onClose={close} />
    case 'about': return <AboutDialog onClose={close} />
    case 'shortcuts': return <ShortcutsDialog onClose={close} />
    default: return null
  }
}

/* ── Novo sprite ─────────────────────────────────────────────────────────── */

function NewSpriteDialog({ onClose }: { onClose: () => void }) {
  const newSprite = useEditor((s) => s.newSprite)
  const dirty = useEditor((s) => s.dirty)
  const [w, setW] = useState(32)
  const [h, setH] = useState(32)
  const [name, setName] = useState('Sem título')

  return (
    <Dialog
      title="Novo sprite"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button
            className="btn primary"
            onClick={() => { newSprite(Math.max(1, w), Math.max(1, h), name); onClose() }}
          >
            Criar
          </button>
        </>
      }
    >
      {dirty && (
        <p className="muted" style={{ color: 'var(--warn)', marginTop: 0 }}>
          O trabalho atual não foi salvo em arquivo. Ele continua no salvamento automático,
          mas será substituído.
        </p>
      )}
      <div className="row">
        <label>Nome</label>
        <input className="grow" type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <NumberField label="Largura" value={w} min={1} max={4096} onChange={setW} suffix="px" />
      <NumberField label="Altura" value={h} min={1} max={4096} onChange={setH} suffix="px" />

      <div className="section-title">Modelos</div>
      <div className="chips">
        {PRESETS.map(([pw, ph, label]) => (
          <button
            key={`${pw}x${ph}`}
            className={`chip${w === pw && h === ph ? ' on' : ''}`}
            onClick={() => { setW(pw); setH(ph) }}
          >
            {pw}×{ph}{label && ` · ${label}`}
          </button>
        ))}
      </div>
    </Dialog>
  )
}

/* ── Redimensionar ───────────────────────────────────────────────────────── */

function ResizeSpriteDialog({ onClose }: { onClose: () => void }) {
  const sprite = useEditor((s) => s.sprite)
  const doResizeSprite = useEditor((s) => s.doResizeSprite)
  const [w, setW] = useState(sprite.width)
  const [h, setH] = useState(sprite.height)
  const [linked, setLinked] = useState(true)
  const ratio = sprite.width / sprite.height

  return (
    <Dialog
      title="Tamanho do sprite"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" onClick={() => { doResizeSprite(w, h); onClose() }}>
            Aplicar
          </button>
        </>
      }
    >
      <p className="muted" style={{ marginTop: 0 }}>
        Escala o conteúdo por vizinho mais próximo, preservando os pixels nítidos.
      </p>
      <NumberField
        label="Largura"
        value={w}
        min={1}
        max={4096}
        onChange={(v) => { setW(v); if (linked) setH(Math.max(1, Math.round(v / ratio))) }}
        suffix="px"
      />
      <NumberField
        label="Altura"
        value={h}
        min={1}
        max={4096}
        onChange={(v) => { setH(v); if (linked) setW(Math.max(1, Math.round(v * ratio))) }}
        suffix="px"
      />
      <Switch label="Manter proporção" checked={linked} onChange={setLinked} />

      <div className="section-title">Múltiplos rápidos</div>
      <div className="chips">
        {[2, 3, 4, 8].map((k) => (
          <button
            key={k}
            className="chip"
            onClick={() => { setW(sprite.width * k); setH(sprite.height * k) }}
          >
            {k}×
          </button>
        ))}
        {[2, 4].map((k) => (
          <button
            key={`d${k}`}
            className="chip"
            onClick={() => {
              setW(Math.max(1, Math.round(sprite.width / k)))
              setH(Math.max(1, Math.round(sprite.height / k)))
            }}
          >
            1/{k}
          </button>
        ))}
      </div>
    </Dialog>
  )
}

const ANCHORS = [
  ['↖', 0, 0], ['↑', 0.5, 0], ['↗', 1, 0],
  ['←', 0, 0.5], ['•', 0.5, 0.5], ['→', 1, 0.5],
  ['↙', 0, 1], ['↓', 0.5, 1], ['↘', 1, 1],
] as const

function ResizeCanvasDialog({ onClose }: { onClose: () => void }) {
  const sprite = useEditor((s) => s.sprite)
  const doResizeCanvas = useEditor((s) => s.doResizeCanvas)
  const [w, setW] = useState(sprite.width)
  const [h, setH] = useState(sprite.height)
  const [anchor, setAnchor] = useState(4)

  const apply = () => {
    const [, ax, ay] = ANCHORS[anchor]
    const x = Math.round((sprite.width - w) * ax)
    const y = Math.round((sprite.height - h) * ay)
    doResizeCanvas({ x, y, w: Math.max(1, w), h: Math.max(1, h) })
    onClose()
  }

  return (
    <Dialog
      title="Tamanho da tela"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" onClick={apply}>Aplicar</button>
        </>
      }
    >
      <p className="muted" style={{ marginTop: 0 }}>
        Muda a área de desenho sem escalar o conteúdo.
      </p>
      <NumberField label="Largura" value={w} min={1} max={4096} onChange={setW} suffix="px" />
      <NumberField label="Altura" value={h} min={1} max={4096} onChange={setH} suffix="px" />

      <div className="section-title">Ancoragem</div>
      <div className="grid3" style={{ maxWidth: 170 }}>
        {ANCHORS.map(([sym], i) => (
          <button
            key={i}
            className={`chip${anchor === i ? ' on' : ''}`}
            style={{ textAlign: 'center', padding: '10px 0' }}
            onClick={() => setAnchor(i)}
          >
            {sym}
          </button>
        ))}
      </div>
    </Dialog>
  )
}

/* ── Grade ───────────────────────────────────────────────────────────────── */

function GridDialog({ onClose }: { onClose: () => void }) {
  const grid = useEditor((s) => s.grid)
  const setGrid = useEditor((s) => s.setGrid)

  return (
    <Dialog
      title="Grade"
      onClose={onClose}
      footer={<button className="btn primary" onClick={onClose}>Pronto</button>}
    >
      <Switch label="Mostrar grade" checked={grid.visible} onChange={(visible) => setGrid({ visible })} />
      <Switch
        label="Grade de pixels (zoom alto)"
        checked={grid.pixelGrid}
        onChange={(pixelGrid) => setGrid({ pixelGrid })}
      />
      <NumberField label="Largura" value={grid.width} min={1} max={256} onChange={(width) => setGrid({ width })} />
      <NumberField label="Altura" value={grid.height} min={1} max={256} onChange={(height) => setGrid({ height })} />
      <NumberField label="Deslocar X" value={grid.offsetX} min={0} max={255} onChange={(offsetX) => setGrid({ offsetX })} />
      <NumberField label="Deslocar Y" value={grid.offsetY} min={0} max={255} onChange={(offsetY) => setGrid({ offsetY })} />
    </Dialog>
  )
}

/* ── Exportar ────────────────────────────────────────────────────────────── */

const LAYOUTS: { id: SheetLayout; label: string }[] = [
  { id: 'horizontal', label: 'Linha' },
  { id: 'vertical', label: 'Coluna' },
  { id: 'grid', label: 'Grade' },
]

function ExportDialog({ onClose }: { onClose: () => void }) {
  const sprite = useEditor((s) => s.sprite)
  const [scale, setScale] = useState(1)
  const [layout, setLayout] = useState<SheetLayout>('horizontal')
  const [columns, setColumns] = useState(Math.ceil(Math.sqrt(sprite.frames.length)))
  const [padding, setPadding] = useState(0)
  const [withJson, setWithJson] = useState(true)

  return (
    <Dialog
      title="Exportar"
      onClose={onClose}
      footer={<button className="btn" onClick={onClose}>Fechar</button>}
    >
      <Slider label="Escala" value={scale} min={1} max={16} onChange={setScale} format={(v) => `${v}×`} />
      <p className="muted">
        Saída: {sprite.width * scale}×{sprite.height * scale} px
      </p>

      <div className="section-title">Imagem</div>
      <div className="grid2">
        <button className="btn" onClick={() => exportPng(scale)}>
          <Icon name="image" size={16} /> PNG do frame
        </button>
        <button className="btn" onClick={() => exportGifFile(scale)} disabled={sprite.frames.length < 2}>
          <Icon name="film" size={16} /> GIF animado
        </button>
      </div>

      <div className="section-title">Spritesheet</div>
      <div className="chips">
        {LAYOUTS.map((l) => (
          <button
            key={l.id}
            className={`chip${layout === l.id ? ' on' : ''}`}
            onClick={() => setLayout(l.id)}
          >
            {l.label}
          </button>
        ))}
      </div>
      {layout === 'grid' && (
        <NumberField label="Colunas" value={columns} min={1} max={64} onChange={setColumns} />
      )}
      <NumberField label="Espaçamento" value={padding} min={0} max={32} onChange={setPadding} suffix="px" />
      <Switch label="Gerar arquivo .json" checked={withJson} onChange={setWithJson} />
      <button
        className="btn wide primary"
        style={{ marginTop: 8 }}
        onClick={() => exportSpriteSheet({ layout, columns, padding, scale, withJson })}
      >
        <Icon name="export" size={16} /> Exportar spritesheet
      </button>
    </Dialog>
  )
}

/* ── Paletas ─────────────────────────────────────────────────────────────── */

function PaletteDialog({ onClose }: { onClose: () => void }) {
  const setPalette = useEditor((s) => s.setPalette)
  const paletteFromSprite = useEditor((s) => s.paletteFromSprite)

  return (
    <Dialog
      title="Paletas"
      onClose={onClose}
      footer={<button className="btn" onClick={onClose}>Fechar</button>}
    >
      {BUILTIN_PALETTES.map((p) => (
        <button
          key={p.name}
          className="list-item"
          style={{ width: '100%', marginBottom: 6 }}
          onClick={() => { setPalette(p.colors); onClose() }}
        >
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div className="name">{p.name}</div>
            <div style={{ display: 'flex', height: 12, borderRadius: 3, overflow: 'hidden', marginTop: 4 }}>
              {p.colors.slice(0, 32).map((c, i) => (
                <div key={i} style={{ flex: 1, background: cssColor(c) }} />
              ))}
            </div>
          </div>
          <span className="meta">{p.colors.length}</span>
        </button>
      ))}
      <button className="btn wide" style={{ marginTop: 8 }} onClick={() => { paletteFromSprite(); onClose() }}>
        <Icon name="wand" size={16} /> Extrair do sprite atual
      </button>
    </Dialog>
  )
}

/* ── Tags ────────────────────────────────────────────────────────────────── */

const DIRECTIONS: { id: LoopDirection; label: string }[] = [
  { id: 'forward', label: 'Frente' },
  { id: 'reverse', label: 'Trás' },
  { id: 'pingpong', label: 'Vai e volta' },
]

function TagDialog({ onClose }: { onClose: () => void }) {
  const sprite = useEditor((s) => s.sprite)
  const updateTag = useEditor((s) => s.updateTag)
  const deleteTag = useEditor((s) => s.deleteTag)
  const max = sprite.frames.length - 1

  return (
    <Dialog
      title="Tags de animação"
      onClose={onClose}
      footer={<button className="btn" onClick={onClose}>Fechar</button>}
    >
      {sprite.tags.length === 0 && <p className="muted">Nenhuma tag criada ainda.</p>}
      {sprite.tags.map((t) => (
        <div key={t.id} style={{ marginBottom: 14 }}>
          <div className="row">
            <input
              className="grow"
              type="text"
              value={t.name}
              onChange={(e) => updateTag(t.id, { name: e.target.value })}
            />
            <button
              className="ibtn"
              style={{ color: 'var(--danger)' }}
              onClick={() => deleteTag(t.id)}
              aria-label="Excluir"
            >
              <Icon name="trash" />
            </button>
          </div>
          <Slider
            label="De"
            value={t.from}
            min={0}
            max={max}
            onChange={(v) => updateTag(t.id, { from: Math.min(v, t.to) })}
            format={(v) => `${v + 1}`}
          />
          <Slider
            label="Até"
            value={t.to}
            min={0}
            max={max}
            onChange={(v) => updateTag(t.id, { to: Math.max(v, t.from) })}
            format={(v) => `${v + 1}`}
          />
          <div className="chips">
            {DIRECTIONS.map((d) => (
              <button
                key={d.id}
                className={`chip${t.direction === d.id ? ' on' : ''}`}
                onClick={() => updateTag(t.id, { direction: d.id })}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </Dialog>
  )
}

/* ── Importar spritesheet ────────────────────────────────────────────────── */

function ImportSheetDialog({ onClose }: { onClose: () => void }) {
  const [fw, setFw] = useState(32)
  const [fh, setFh] = useState(32)

  return (
    <Dialog
      title="Importar spritesheet"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button
            className="btn primary"
            onClick={() => { importSpriteSheet(Math.max(1, fw), Math.max(1, fh)); onClose() }}
          >
            Escolher imagem
          </button>
        </>
      }
    >
      <p className="muted" style={{ marginTop: 0 }}>
        Informe o tamanho de cada quadro. A imagem será fatiada da esquerda para a direita,
        de cima para baixo, e cada pedaço vira um frame.
      </p>
      <NumberField label="Largura" value={fw} min={1} max={1024} onChange={setFw} suffix="px" />
      <NumberField label="Altura" value={fh} min={1} max={1024} onChange={setFh} suffix="px" />
    </Dialog>
  )
}

/* ── Sobre / atalhos ─────────────────────────────────────────────────────── */

function AboutDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog
      title="Pixel Painter"
      onClose={onClose}
      footer={<button className="btn primary" onClick={onClose}>Fechar</button>}
    >
      <p>Editor de pixel art e sprites feito para telas de toque.</p>
      <div className="section-title">Gestos</div>
      <ul className="muted" style={{ paddingLeft: 18, lineHeight: 1.7 }}>
        <li><b>Um dedo</b> — desenha com a ferramenta ativa</li>
        <li><b>Dois dedos</b> — move e amplia a tela</li>
        <li><b>Toque longo na paleta</b> — opções da cor</li>
      </ul>
      <div className="section-title">Instalar no celular</div>
      <p className="muted">
        No navegador, abra o menu e escolha <b>Adicionar à tela inicial</b>. O app passa a abrir
        em tela cheia e funciona sem internet.
      </p>
      <p className="muted">
        Seu trabalho é salvo automaticamente no aparelho. Para guardar em arquivo, use
        <b> Menu → Salvar projeto</b>.
      </p>
    </Dialog>
  )
}

function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ['B', 'Lápis'], ['E', 'Borracha'], ['G', 'Balde'], ['I', 'Conta-gotas'],
    ['L', 'Linha'], ['U', 'Retângulo'], ['O', 'Elipse'], ['M', 'Seleção retangular'],
    ['V', 'Mover'], ['H', 'Mão'], ['Z', 'Zoom'],
    ['Ctrl+Z', 'Desfazer'], ['Ctrl+Shift+Z', 'Refazer'],
    ['Ctrl+C / X / V', 'Copiar / recortar / colar'],
    ['Ctrl+A', 'Selecionar tudo'], ['Ctrl+D', 'Desmarcar'],
    ['Delete', 'Apagar seleção'],
    ['[ / ]', 'Diminuir / aumentar o pincel'],
    [', / .', 'Frame anterior / próximo'],
    ['Espaço', 'Reproduzir'],
    ['+ / -', 'Zoom'], ['0', 'Ajustar à tela'],
    ['X', 'Trocar as cores'],
  ]
  return (
    <Dialog
      title="Atalhos de teclado"
      onClose={onClose}
      footer={<button className="btn primary" onClick={onClose}>Fechar</button>}
    >
      <p className="muted" style={{ marginTop: 0 }}>Úteis com teclado físico ou tablet acoplado.</p>
      {rows.map(([k, v]) => (
        <div key={k} className="row" style={{ minHeight: 32 }}>
          <kbd>{k}</kbd>
          <span className="grow muted">{v}</span>
        </div>
      ))}
    </Dialog>
  )
}
