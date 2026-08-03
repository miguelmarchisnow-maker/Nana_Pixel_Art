import { useEffect, useRef, useState } from 'react'
import { useEditor } from '../store/editor'
import {
  cssColor, fromHex, getA, getB, getG, getR, hsvToRgb, rgbToHsv, rgba, toHex,
} from '../core/color'
import { Icon } from './icons'
import { Slider } from './widgets'

/* ── Área saturação × valor ──────────────────────────────────────────────── */

function SVBox({
  hue, s, v, onChange,
}: {
  hue: number
  s: number
  v: number
  onChange: (s: number, v: number) => void
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const w = 200, h = 120
    cv.width = w
    cv.height = h
    const g = cv.getContext('2d')!
    const [r, gg, b] = hsvToRgb(hue, 1, 1)
    g.fillStyle = `rgb(${r},${gg},${b})`
    g.fillRect(0, 0, w, h)
    const white = g.createLinearGradient(0, 0, w, 0)
    white.addColorStop(0, 'rgba(255,255,255,1)')
    white.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = white
    g.fillRect(0, 0, w, h)
    const black = g.createLinearGradient(0, 0, 0, h)
    black.addColorStop(0, 'rgba(0,0,0,0)')
    black.addColorStop(1, 'rgba(0,0,0,1)')
    g.fillStyle = black
    g.fillRect(0, 0, w, h)
  }, [hue])

  const handle = (e: React.PointerEvent) => {
    const el = boxRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const nx = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
    const ny = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))
    onChange(nx, 1 - ny)
  }

  return (
    <div
      className="sv-box"
      ref={boxRef}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); handle(e) }}
      onPointerMove={(e) => { if (e.buttons || e.pointerType === 'touch') handle(e) }}
    >
      <canvas ref={ref} />
      <div className="sv-cursor" style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%` }} />
    </div>
  )
}

function LinearSlider({
  value, max, onChange, className, style, children,
}: {
  value: number
  max: number
  onChange: (v: number) => void
  className: string
  style?: React.CSSProperties
  children?: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const handle = (e: React.PointerEvent) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    onChange(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * max)
  }
  return (
    <div
      className={className}
      ref={ref}
      style={style}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); handle(e) }}
      onPointerMove={(e) => { if (e.buttons || e.pointerType === 'touch') handle(e) }}
    >
      {children}
      <div className="slider-knob" style={{ left: `${(value / max) * 100}%` }} />
    </div>
  )
}

/* ── Painel ──────────────────────────────────────────────────────────────── */

export function ColorPanel() {
  const primary = useEditor((s) => s.primary)
  const secondary = useEditor((s) => s.secondary)
  const setPrimary = useEditor((s) => s.setPrimary)
  const swap = useEditor((s) => s.swapColors)
  const palette = useEditor((s) => s.sprite.palette)
  const recent = useEditor((s) => s.recentColors)
  const addPaletteColor = useEditor((s) => s.addPaletteColor)
  const removePaletteColor = useEditor((s) => s.removePaletteColor)
  const setPaletteColor = useEditor((s) => s.setPaletteColor)
  const replaceSpriteColor = useEditor((s) => s.replaceSpriteColor)
  const openDialog = useEditor((s) => s.openDialog)
  const rev = useEditor((s) => s.rev)

  const [hsv, setHsv] = useState(() => rgbToHsv(getR(primary), getG(primary), getB(primary)))
  const [hexText, setHexText] = useState(() => toHex(primary))
  const [selIndex, setSelIndex] = useState(-1)
  const lastColor = useRef(primary)

  /* Sincroniza os controles quando a cor muda por fora (conta-gotas, paleta) */
  useEffect(() => {
    if (primary === lastColor.current) return
    lastColor.current = primary
    setHsv(rgbToHsv(getR(primary), getG(primary), getB(primary)))
    setHexText(toHex(primary))
  }, [primary])

  const alpha = getA(primary)

  const apply = (h: number, s: number, v: number, a = alpha) => {
    const [r, g, b] = hsvToRgb(h, s, v)
    const c = rgba(r, g, b, a)
    lastColor.current = c
    setHsv([h, s, v])
    setHexText(toHex(c))
    setPrimary(c)
  }

  const [h, sat, val] = hsv

  /* Toque longo em uma cor da paleta abre as ações */
  const pressTimer = useRef<number>()
  const startPress = (i: number) => {
    clearTimeout(pressTimer.current)
    pressTimer.current = window.setTimeout(() => {
      setSelIndex(i)
      pressTimer.current = undefined
    }, 480)
  }
  const endPress = (i: number, color: number) => {
    if (pressTimer.current === undefined) return
    clearTimeout(pressTimer.current)
    pressTimer.current = undefined
    setPrimary(color)
    setSelIndex(i)
  }

  return (
    <>
      <div className="row" style={{ gap: 12 }}>
        <div className="swatch-pair">
          <div className="sw a checker" style={{ background: cssColor(primary) }} />
          <div className="sw b checker" style={{ background: cssColor(secondary) }} />
        </div>
        <button className="ibtn" onClick={swap} aria-label="Trocar cores">
          <Icon name="swap" />
        </button>
        <input
          className="grow"
          type="text"
          value={hexText}
          spellCheck={false}
          autoCapitalize="none"
          onChange={(e) => {
            setHexText(e.target.value)
            const c = fromHex(e.target.value)
            if (c !== null) {
              const withA = (c & 0x00ffffff) | (alpha << 24)
              lastColor.current = withA >>> 0
              setHsv(rgbToHsv(getR(c), getG(c), getB(c)))
              setPrimary(withA >>> 0)
            }
          }}
          onBlur={() => setHexText(toHex(primary))}
        />
        <button className="ibtn" onClick={() => addPaletteColor(primary)} aria-label="Adicionar à paleta">
          <Icon name="plus" />
        </button>
      </div>

      <div style={{ marginTop: 8 }}>
        <SVBox hue={h} s={sat} v={val} onChange={(s2, v2) => apply(h, s2, v2)} />
      </div>

      <div style={{ marginTop: 8 }}>
        <LinearSlider
          className="hue-slider"
          value={h}
          max={360}
          onChange={(nh) => apply(nh, sat, val)}
        />
      </div>

      <div style={{ marginTop: 8 }}>
        <LinearSlider
          className="alpha-slider checker"
          value={alpha}
          max={255}
          onChange={(a) => apply(h, sat, val, Math.round(a))}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `linear-gradient(to right, ${cssColor(primary & 0x00ffffff)}, ${cssColor(
                ((primary & 0x00ffffff) | 0xff000000) >>> 0,
              )})`,
            }}
          />
        </LinearSlider>
      </div>

      <Slider
        label="R"
        value={getR(primary)}
        min={0}
        max={255}
        onChange={(r) => {
          const c = rgba(r, getG(primary), getB(primary), alpha)
          lastColor.current = c
          setHsv(rgbToHsv(r, getG(primary), getB(primary)))
          setHexText(toHex(c))
          setPrimary(c)
        }}
      />
      <Slider
        label="G"
        value={getG(primary)}
        min={0}
        max={255}
        onChange={(g) => {
          const c = rgba(getR(primary), g, getB(primary), alpha)
          lastColor.current = c
          setHsv(rgbToHsv(getR(primary), g, getB(primary)))
          setHexText(toHex(c))
          setPrimary(c)
        }}
      />
      <Slider
        label="B"
        value={getB(primary)}
        min={0}
        max={255}
        onChange={(b) => {
          const c = rgba(getR(primary), getG(primary), b, alpha)
          lastColor.current = c
          setHsv(rgbToHsv(getR(primary), getG(primary), b))
          setHexText(toHex(c))
          setPrimary(c)
        }}
      />

      {recent.length > 0 && (
        <>
          <div className="section-title">Recentes</div>
          <div className="strip">
            {recent.map((c, i) => (
              <button
                key={`${c}-${i}`}
                className={`cell checker${c === primary ? ' on' : ''}`}
                style={{ background: cssColor(c) }}
                onClick={() => setPrimary(c)}
                aria-label={toHex(c)}
              />
            ))}
          </div>
        </>
      )}

      <div className="section-title">
        Paleta · {palette.length} cores
      </div>

      <div className="palette" key={rev}>
        {palette.map((c, i) => (
          <button
            key={`${c}-${i}`}
            className={`cell checker${selIndex === i ? ' on' : ''}`}
            style={{ background: cssColor(c) }}
            onPointerDown={() => startPress(i)}
            onPointerUp={() => endPress(i, c)}
            onPointerLeave={() => { clearTimeout(pressTimer.current); pressTimer.current = undefined }}
            aria-label={toHex(c)}
          />
        ))}
      </div>

      {selIndex >= 0 && selIndex < palette.length && (
        <>
          <div className="hr" />
          <div className="muted" style={{ marginBottom: 6 }}>
            Cor {selIndex + 1}: {toHex(palette[selIndex])}
          </div>
          <div className="grid2">
            <button className="btn" onClick={() => setPaletteColor(selIndex, primary)}>
              Substituir pela atual
            </button>
            <button
              className="btn"
              onClick={() => replaceSpriteColor(palette[selIndex], primary)}
            >
              Trocar no sprite
            </button>
            <button className="btn danger" onClick={() => { removePaletteColor(selIndex); setSelIndex(-1) }}>
              <Icon name="trash" size={16} /> Remover
            </button>
            <button className="btn" onClick={() => setSelIndex(-1)}>Fechar</button>
          </div>
        </>
      )}

      <div className="hr" />
      <button className="btn wide" onClick={() => openDialog('palette')}>
        <Icon name="palette" size={17} /> Gerenciar paletas
      </button>
    </>
  )
}
