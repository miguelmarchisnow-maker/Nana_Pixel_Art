import { useEffect, useRef } from 'react'
import { toImageData } from '../core/raster'

/** Miniatura de um buffer de pixels, desenhada direto no canvas (sem dataURL). */
export function Thumb({
  data, w, h, className, style,
}: {
  data: Uint32Array
  w: number
  h: number
  className?: string
  style?: React.CSSProperties
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = ref.current
    if (!cv || w <= 0 || h <= 0) return
    if (cv.width !== w || cv.height !== h) {
      cv.width = w
      cv.height = h
    }
    const g = cv.getContext('2d')
    if (!g) return
    g.clearRect(0, 0, w, h)
    g.putImageData(toImageData(data, w, h), 0, 0)
  }, [data, w, h])

  return (
    <canvas
      ref={ref}
      className={`checker ${className ?? ''}`}
      style={{ imageRendering: 'pixelated', objectFit: 'contain', ...style }}
    />
  )
}
