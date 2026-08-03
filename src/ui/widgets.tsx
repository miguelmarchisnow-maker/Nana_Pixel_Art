import { useEffect, useRef, type ReactNode } from 'react'
import { useEditor } from '../store/editor'
import { Icon } from './icons'

export function Slider({
  label, value, min, max, step = 1, onChange, format,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  format?: (v: number) => string
}) {
  return (
    <div className="row">
      <label>{label}</label>
      <input
        className="grow"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="val">{format ? format(value) : value}</span>
    </div>
  )
}

export function Switch({
  label, checked, onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      className={`switch${checked ? ' on' : ''}`}
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
    >
      <span>{label}</span>
      <span className="track" />
    </button>
  )
}

export function NumberField({
  label, value, min, max, onChange, suffix,
}: {
  label: string
  value: number
  min?: number
  max?: number
  onChange: (v: number) => void
  suffix?: string
}) {
  return (
    <div className="row">
      <label>{label}</label>
      <input
        className="grow"
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (Number.isFinite(v)) onChange(v)
        }}
      />
      {suffix && <span className="val">{suffix}</span>}
    </div>
  )
}

export function Chips<T extends string>({
  options, value, onChange,
}: {
  options: { id: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="chips">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={`chip${value === o.id ? ' on' : ''}`}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Painel deslizante. Enquanto está aberto, informa ao editor o quanto cobre do
 * palco, para o desenho não ficar escondido atrás dele.
 */
export function Sheet({
  title, onClose, children, actions,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  actions?: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const setSheetHeight = useEditor((s) => s.setSheetHeight)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const measure = () => {
      const stage = document.querySelector<HTMLElement>('.stage')
      if (!stage) return
      /*
       * offsetTop/offsetHeight são posições de layout: ao contrário de
       * getBoundingClientRect, não sofrem com o `transform` da animação de
       * entrada do painel — medir durante a animação daria um valor menor.
       */
      const stageBottom = stage.offsetTop + stage.offsetHeight
      setSheetHeight(Math.max(0, stageBottom - el.offsetTop))
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => {
      ro.disconnect()
      setSheetHeight(0)
    }
  }, [setSheetHeight])

  return (
    <div className="sheet" ref={ref}>
      <div className="sheet-head">
        <h2>{title}</h2>
        {actions}
        <button className="ibtn" onClick={onClose} aria-label="Fechar">
          <Icon name="chevron-down" />
        </button>
      </div>
      <div className="sheet-body">{children}</div>
    </div>
  )
}

export function Dialog({
  title, onClose, children, footer, wide,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  return (
    <div className="backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="dialog" style={wide ? { maxWidth: 560 } : undefined}>
        <header>
          <h2>{title}</h2>
          <button className="ibtn" onClick={onClose} aria-label="Fechar">
            <Icon name="close" />
          </button>
        </header>
        <div className="body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  )
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <div className="section-title">{children}</div>
}
