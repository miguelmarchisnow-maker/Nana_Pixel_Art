import { useState } from 'react'
import { useEditor } from '../store/editor'
import { BLEND_MODES, celKey } from '../core/types'
import type { BlendMode } from '../core/types'
import { Icon } from './icons'
import { Slider } from './widgets'
import { Thumb } from './Thumb'

export function LayersPanel() {
  const sprite = useEditor((s) => s.sprite)
  const layerIndex = useEditor((s) => s.layerIndex)
  const setLayerIndex = useEditor((s) => s.setLayerIndex)
  const setLayerProp = useEditor((s) => s.setLayerProp)
  const frameIndex = useEditor((s) => s.frameIndex)
  const rev = useEditor((s) => s.rev)
  const addLayerAction = useEditor((s) => s.addLayerAction)
  const duplicateLayerAction = useEditor((s) => s.duplicateLayerAction)
  const deleteLayerAction = useEditor((s) => s.deleteLayerAction)
  const moveLayerAction = useEditor((s) => s.moveLayerAction)
  const mergeDownAction = useEditor((s) => s.mergeDownAction)
  const flattenAction = useEditor((s) => s.flattenAction)
  const clearLayer = useEditor((s) => s.clearLayer)

  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const frameId = sprite.frames[Math.min(frameIndex, sprite.frames.length - 1)]?.id
  const current = sprite.layers[Math.min(layerIndex, sprite.layers.length - 1)]

  // Exibe de cima para baixo (última camada primeiro)
  const ordered = sprite.layers.map((l, i) => ({ layer: l, index: i })).reverse()

  return (
    <>
      <div className="spread" style={{ marginBottom: 10 }}>
        <button className="ibtn" onClick={addLayerAction} aria-label="Nova camada"><Icon name="plus" /></button>
        <button className="ibtn" onClick={duplicateLayerAction} aria-label="Duplicar"><Icon name="duplicate" /></button>
        <button
          className="ibtn"
          onClick={() => moveLayerAction(1)}
          disabled={layerIndex >= sprite.layers.length - 1}
          aria-label="Subir"
        >
          <Icon name="chevron-up" />
        </button>
        <button className="ibtn" onClick={() => moveLayerAction(-1)} disabled={layerIndex <= 0} aria-label="Descer">
          <Icon name="chevron-down" />
        </button>
        <button className="ibtn" onClick={mergeDownAction} disabled={layerIndex <= 0} aria-label="Mesclar abaixo">
          <Icon name="merge" />
        </button>
        <button
          className="ibtn"
          onClick={deleteLayerAction}
          disabled={sprite.layers.length <= 1}
          aria-label="Excluir"
          style={{ color: 'var(--danger)' }}
        >
          <Icon name="trash" />
        </button>
      </div>

      <div className="list">
        {ordered.map(({ layer, index }) => {
          const cel = frameId ? sprite.cels.get(celKey(layer.id, frameId)) : undefined
          const on = index === layerIndex
          return (
            <div key={layer.id} className={`list-item${on ? ' on' : ''}`}>
              <button
                className="ibtn"
                style={{ minWidth: 32, height: 32 }}
                onClick={() => setLayerProp(layer.id, { visible: !layer.visible })}
                aria-label={layer.visible ? 'Ocultar' : 'Mostrar'}
              >
                <Icon name={layer.visible ? 'eye' : 'eye-off'} size={18} />
              </button>

              {cel ? (
                <Thumb
                  key={`${layer.id}-${rev}`}
                  data={cel.data}
                  w={sprite.width}
                  h={sprite.height}
                  className="thumb"
                />
              ) : (
                <div className="thumb checker" />
              )}

              <button
                className="name"
                style={{ textAlign: 'left' }}
                onClick={() => {
                  if (on) { setRenaming(layer.id); setDraft(layer.name) }
                  else setLayerIndex(index)
                }}
              >
                {renaming === layer.id ? (
                  <input
                    autoFocus
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => {
                      setLayerProp(layer.id, { name: draft.trim() || layer.name })
                      setRenaming(null)
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                  />
                ) : (
                  <>
                    <div>{layer.name}</div>
                    <div className="meta">
                      {layer.blend !== 'normal' && `${BLEND_MODES.find((b) => b.id === layer.blend)?.label} · `}
                      {Math.round((layer.opacity / 255) * 100)}%
                      {layer.reference && ' · ref'}
                    </div>
                  </>
                )}
              </button>

              <button
                className="ibtn"
                style={{ minWidth: 32, height: 32 }}
                onClick={() => setLayerProp(layer.id, { locked: !layer.locked })}
                aria-label={layer.locked ? 'Desbloquear' : 'Bloquear'}
              >
                <Icon name={layer.locked ? 'lock' : 'unlock'} size={17} />
              </button>
            </div>
          )
        })}
      </div>

      {current && (
        <>
          <div className="section-title">Camada: {current.name}</div>

          <Slider
            label="Opacidade"
            value={current.opacity}
            min={0}
            max={255}
            onChange={(v) => setLayerProp(current.id, { opacity: v })}
            format={(v) => `${Math.round((v / 255) * 100)}%`}
          />

          <div className="row">
            <label>Mesclagem</label>
            <select
              className="grow"
              value={current.blend}
              onChange={(e) => setLayerProp(current.id, { blend: e.target.value as BlendMode })}
            >
              {BLEND_MODES.map((b) => (
                <option key={b.id} value={b.id}>{b.label}</option>
              ))}
            </select>
          </div>

          <div className="grid2" style={{ marginTop: 8 }}>
            <button
              className={`btn${current.reference ? ' primary' : ''}`}
              onClick={() => setLayerProp(current.id, { reference: !current.reference })}
            >
              <Icon name="reference" size={16} /> Referência
            </button>
            <button className="btn" onClick={clearLayer}>
              Limpar cel
            </button>
            <button className="btn" onClick={flattenAction} disabled={sprite.layers.length <= 1}>
              <Icon name="layers" size={16} /> Achatar tudo
            </button>
            <button className="btn" onClick={() => { setRenaming(current.id); setDraft(current.name) }}>
              <Icon name="text" size={16} /> Renomear
            </button>
          </div>

          <p className="muted" style={{ marginTop: 10 }}>
            Camadas de referência aparecem no editor mas não são exportadas.
          </p>
        </>
      )}
    </>
  )
}
