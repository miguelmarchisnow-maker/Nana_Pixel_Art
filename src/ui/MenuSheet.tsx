import { useEditor } from '../store/editor'
import { Icon } from './icons'
import { Sheet } from './widgets'
import {
  exportGifFile, exportPng, importImageAsLayer, importImageAsSprite, loadPalette,
  openProject, saveProject, savePalette,
} from './actions'

function Item({
  icon, label, hint, onClick, disabled, danger,
}: {
  icon: string
  label: string
  hint?: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button className="menu-item" onClick={onClick} disabled={disabled}>
      <span className="ico" style={danger ? { color: 'var(--danger)' } : undefined}>
        <Icon name={icon} size={19} />
      </span>
      <span className="lbl" style={danger ? { color: 'var(--danger)' } : undefined}>{label}</span>
      {hint && <span className="hint">{hint}</span>}
    </button>
  )
}

export function MenuSheet({ onClose }: { onClose: () => void }) {
  const s = useEditor()
  const close = (fn: () => void) => () => { fn(); onClose() }

  const hasSel = !!s.selection
  const frames = s.sprite.frames.length

  return (
    <Sheet title="Menu" onClose={onClose}>
      <div className="section-title">Arquivo</div>
      <div className="menu-list">
        <Item icon="new" label="Novo sprite" onClick={close(() => s.openDialog('new'))} />
        <Item icon="folder" label="Abrir projeto" hint={`.pxpaint`} onClick={close(openProject)} />
        <Item icon="save" label="Salvar projeto" onClick={close(saveProject)} />
        <Item icon="image" label="Importar imagem como sprite" onClick={close(importImageAsSprite)} />
        <Item icon="layers" label="Importar imagem como camada" onClick={close(importImageAsLayer)} />
        <Item icon="film" label="Importar spritesheet" onClick={close(() => s.openDialog('import-sheet'))} />
        <Item icon="share" label="Exportar PNG" onClick={close(() => exportPng(1))} />
        <Item
          icon="film"
          label="Exportar GIF animado"
          hint={frames < 2 ? 'só 1 frame' : `${frames} frames`}
          onClick={close(() => exportGifFile(1))}
        />
        <Item icon="export" label="Exportar…" hint="mais opções" onClick={close(() => s.openDialog('export'))} />
      </div>

      <div className="section-title">Editar</div>
      <div className="menu-list">
        <Item
          icon="undo"
          label="Desfazer"
          hint={s.history.undoLabel}
          disabled={!s.history.canUndo}
          onClick={() => s.undo()}
        />
        <Item
          icon="redo"
          label="Refazer"
          hint={s.history.redoLabel}
          disabled={!s.history.canRedo}
          onClick={() => s.redo()}
        />
        <Item icon="copy" label="Copiar" onClick={close(() => s.copy())} />
        <Item icon="duplicate" label="Recortar" onClick={close(() => s.cut())} />
        <Item icon="plus" label="Colar" disabled={!s.clipboard} onClick={close(() => s.paste())} />
        <Item icon="trash" label="Apagar seleção" disabled={!hasSel} onClick={close(() => s.deleteSelection())} />
        <Item icon="select-rect" label="Selecionar tudo" onClick={close(() => s.selectAll())} />
        <Item icon="close" label="Desmarcar" disabled={!hasSel} onClick={close(() => s.deselect())} />
        <Item icon="swap" label="Inverter seleção" onClick={close(() => s.invertSelection())} />
      </div>

      <div className="section-title">Sprite</div>
      <div className="menu-list">
        <Item icon="resize" label="Tamanho do sprite" onClick={close(() => s.openDialog('resize-sprite'))} />
        <Item icon="crop" label="Tamanho da tela" onClick={close(() => s.openDialog('resize-canvas'))} />
        <Item icon="crop" label="Recortar para a seleção" disabled={!hasSel} onClick={close(() => s.cropToSelection())} />
        <Item icon="fit" label="Aparar bordas vazias" onClick={close(() => s.trim())} />
        <Item icon="flip-h" label="Espelhar horizontal" onClick={close(() => s.flip(true))} />
        <Item icon="flip-v" label="Espelhar vertical" onClick={close(() => s.flip(false))} />
        <Item icon="rotate" label="Girar 90° horário" onClick={close(() => s.rotate(1))} />
        <Item icon="rotate-ccw" label="Girar 90° anti-horário" onClick={close(() => s.rotate(3))} />
        <Item icon="rotate" label="Girar 180°" onClick={close(() => s.rotate(2))} />
      </div>

      <div className="section-title">Paleta</div>
      <div className="menu-list">
        <Item icon="palette" label="Paletas prontas" onClick={close(() => s.openDialog('palette'))} />
        <Item icon="folder" label="Carregar arquivo de paleta" hint=".gpl .pal .hex" onClick={close(loadPalette)} />
        <Item icon="save" label="Exportar paleta" hint=".gpl" onClick={close(savePalette)} />
        <Item icon="wand" label="Extrair cores do sprite" onClick={close(() => s.paletteFromSprite())} />
      </div>

      <div className="section-title">Ver</div>
      <div className="menu-list">
        <Item icon="fit" label="Ajustar à tela" onClick={close(() => s.fitView())} />
        <Item icon="zoom-in" label="Aproximar" onClick={() => s.zoomBy(2)} />
        <Item icon="zoom-out" label="Afastar" onClick={() => s.zoomBy(0.5)} />
        <Item icon="grid" label="Configurar grade" onClick={close(() => s.openDialog('grid'))} />
        <Item
          icon="grid"
          label={s.grid.visible ? 'Ocultar grade' : 'Mostrar grade'}
          onClick={() => s.setGrid({ visible: !s.grid.visible })}
        />
        <Item
          icon="frames"
          label={s.tiled ? 'Desativar modo lado a lado' : 'Modo lado a lado'}
          onClick={() => s.toggleTiled()}
        />
        <Item
          icon="onion"
          label={s.onion.enabled ? 'Desativar onion skin' : 'Ativar onion skin'}
          onClick={() => s.setOnion({ enabled: !s.onion.enabled })}
        />
      </div>

      <div className="section-title">Sobre</div>
      <div className="menu-list">
        <Item icon="info" label="Sobre o Pixel Painter" onClick={close(() => s.openDialog('about'))} />
        <Item icon="settings" label="Atalhos de teclado" onClick={close(() => s.openDialog('shortcuts'))} />
      </div>

      <p className="muted center" style={{ marginTop: 14 }}>
        {s.sprite.width}×{s.sprite.height} · {s.sprite.layers.length} camadas · {frames} frames ·
        histórico {s.history.memoryMB.toFixed(1)} MB
      </p>
    </Sheet>
  )
}
