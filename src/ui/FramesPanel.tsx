import { useMemo, useState } from 'react'
import { useEditor } from '../store/editor'
import { compositeFrame } from '../core/composite'
import { cssColor } from '../core/color'
import { Icon } from './icons'
import { Slider, Switch } from './widgets'
import { Thumb } from './Thumb'

export function FramesPanel() {
  const sprite = useEditor((s) => s.sprite)
  const frameIndex = useEditor((s) => s.frameIndex)
  const setFrameIndex = useEditor((s) => s.setFrameIndex)
  const rev = useEditor((s) => s.rev)
  const playing = useEditor((s) => s.playing)
  const togglePlay = useEditor((s) => s.togglePlay)
  const onion = useEditor((s) => s.onion)
  const setOnion = useEditor((s) => s.setOnion)
  const addFrameAction = useEditor((s) => s.addFrameAction)
  const deleteFrameAction = useEditor((s) => s.deleteFrameAction)
  const moveFrameAction = useEditor((s) => s.moveFrameAction)
  const setFrameDuration = useEditor((s) => s.setFrameDuration)
  const setAllFrameDurations = useEditor((s) => s.setAllFrameDurations)
  const addTagAction = useEditor((s) => s.addTagAction)
  const deleteTag = useEditor((s) => s.deleteTag)
  const openDialog = useEditor((s) => s.openDialog)

  const [tagName, setTagName] = useState('')

  const thumbs = useMemo(
    () => sprite.frames.map((f) => compositeFrame(sprite, f.id, { includeReference: true })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sprite, rev],
  )

  const current = sprite.frames[Math.min(frameIndex, sprite.frames.length - 1)]
  const totalMs = sprite.frames.reduce((a, f) => a + f.duration, 0)

  return (
    <>
      <div className="spread" style={{ marginBottom: 10 }}>
        <button className="ibtn" onClick={() => setFrameIndex(frameIndex - 1)} aria-label="Anterior">
          <Icon name="skip-back" />
        </button>
        <button className={`ibtn${playing ? ' on' : ''}`} onClick={togglePlay} aria-label="Reproduzir">
          <Icon name={playing ? 'pause' : 'play'} />
        </button>
        <button className="ibtn" onClick={() => setFrameIndex(frameIndex + 1)} aria-label="Próximo">
          <Icon name="skip-fwd" />
        </button>
        <button className="ibtn" onClick={() => addFrameAction(false)} aria-label="Novo frame">
          <Icon name="plus" />
        </button>
        <button className="ibtn" onClick={() => addFrameAction(true)} aria-label="Duplicar frame">
          <Icon name="duplicate" />
        </button>
        <button
          className="ibtn"
          onClick={deleteFrameAction}
          disabled={sprite.frames.length <= 1}
          style={{ color: 'var(--danger)' }}
          aria-label="Excluir frame"
        >
          <Icon name="trash" />
        </button>
      </div>

      <div className="timeline">
        {sprite.frames.map((f, i) => (
          <button
            key={f.id}
            className={`frame-cell${i === frameIndex ? ' on' : ''}`}
            onClick={() => setFrameIndex(i)}
          >
            <Thumb
              key={`${f.id}-${rev}`}
              data={thumbs[i]}
              w={sprite.width}
              h={sprite.height}
              className="fthumb"
            />
            <span className="fnum">{i + 1} · {f.duration}ms</span>
          </button>
        ))}
      </div>

      <div className="spread" style={{ marginTop: 6 }}>
        <button className="btn" onClick={() => moveFrameAction(-1)} disabled={frameIndex <= 0}>
          <Icon name="chevron-left" size={16} /> Mover
        </button>
        <button
          className="btn"
          onClick={() => moveFrameAction(1)}
          disabled={frameIndex >= sprite.frames.length - 1}
        >
          Mover <Icon name="chevron-right" size={16} />
        </button>
      </div>

      <div className="section-title">
        Tempo · {sprite.frames.length} frames · {(totalMs / 1000).toFixed(2)}s ·{' '}
        {(1000 / Math.max(1, totalMs / sprite.frames.length)).toFixed(1)} fps
      </div>

      {current && (
        <Slider
          label="Duração"
          value={current.duration}
          min={10}
          max={2000}
          step={10}
          onChange={(v) => setFrameDuration(frameIndex, v)}
          format={(v) => `${v}ms`}
        />
      )}

      <div className="chips" style={{ marginTop: 4 }}>
        {[50, 83, 100, 125, 200, 500].map((ms) => (
          <button key={ms} className="chip" onClick={() => setAllFrameDurations(ms)}>
            {Math.round(1000 / ms)} fps
          </button>
        ))}
      </div>

      <div className="section-title">Onion skin</div>
      <Switch
        label="Ativar"
        checked={onion.enabled}
        onChange={(enabled) => setOnion({ enabled })}
      />
      {onion.enabled && (
        <>
          <Slider label="Antes" value={onion.prev} min={0} max={5} onChange={(prev) => setOnion({ prev })} />
          <Slider label="Depois" value={onion.next} min={0} max={5} onChange={(next) => setOnion({ next })} />
          <Slider
            label="Opacidade"
            value={onion.opacity}
            min={20}
            max={255}
            onChange={(opacity) => setOnion({ opacity })}
            format={(v) => `${Math.round((v / 255) * 100)}%`}
          />
          <Switch label="Colorir" checked={onion.tint} onChange={(tint) => setOnion({ tint })} />
        </>
      )}

      <div className="section-title">Tags de animação</div>
      {sprite.tags.length > 0 && (
        <div className="tag-bar">
          {sprite.tags.map((t) => (
            <span key={t.id} className="tag-pill" style={{ borderColor: cssColor(t.color) }}>
              <span>{t.name}</span>
              <span className="muted">{t.from + 1}–{t.to + 1}</span>
              <button
                onClick={() => deleteTag(t.id)}
                style={{ display: 'flex', color: 'var(--fg-faint)' }}
                aria-label="Excluir tag"
              >
                <Icon name="close" size={13} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="row">
        <input
          className="grow"
          type="text"
          placeholder="Nome da tag"
          value={tagName}
          onChange={(e) => setTagName(e.target.value)}
        />
        <button
          className="btn"
          disabled={!tagName.trim()}
          onClick={() => {
            addTagAction(tagName.trim(), frameIndex, frameIndex)
            setTagName('')
          }}
        >
          Criar
        </button>
      </div>
      <p className="muted" style={{ marginTop: 6 }}>
        A tag é criada no frame atual. Edite o intervalo em Frames → Editar tags.
      </p>
      {sprite.tags.length > 0 && (
        <button className="btn wide" style={{ marginTop: 8 }} onClick={() => openDialog('tag')}>
          <Icon name="tag" size={16} /> Editar tags
        </button>
      )}
    </>
  )
}
