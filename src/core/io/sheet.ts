import type { Sprite, Tag } from '../types'

export type SheetLayout = 'horizontal' | 'vertical' | 'grid' | 'rows'

export interface SheetOptions {
  layout: SheetLayout
  /** usado em 'grid' */
  columns?: number
  padding?: number
  /** margem externa */
  margin?: number
}

export interface SheetResult {
  data: Uint32Array
  width: number
  height: number
  frames: { x: number; y: number; w: number; h: number }[]
}

export function packSheet(
  frames: Uint32Array[], fw: number, fh: number, opts: SheetOptions,
): SheetResult {
  const pad = Math.max(0, opts.padding ?? 0)
  const margin = Math.max(0, opts.margin ?? 0)
  const n = frames.length

  let cols: number, rows: number
  switch (opts.layout) {
    case 'horizontal': cols = n; rows = 1; break
    case 'vertical': cols = 1; rows = n; break
    case 'grid': {
      cols = Math.max(1, Math.min(n, opts.columns ?? Math.ceil(Math.sqrt(n))))
      rows = Math.ceil(n / cols)
      break
    }
    default: {
      cols = Math.max(1, Math.ceil(Math.sqrt(n)))
      rows = Math.ceil(n / cols)
    }
  }

  const width = margin * 2 + cols * fw + (cols - 1) * pad
  const height = margin * 2 + rows * fh + (rows - 1) * pad
  const data = new Uint32Array(width * height)
  const rects: SheetResult['frames'] = []

  for (let i = 0; i < n; i++) {
    const cx = i % cols, cy = (i / cols) | 0
    const ox = margin + cx * (fw + pad)
    const oy = margin + cy * (fh + pad)
    const src = frames[i]
    for (let y = 0; y < fh; y++) {
      data.set(src.subarray(y * fw, (y + 1) * fw), (oy + y) * width + ox)
    }
    rects.push({ x: ox, y: oy, w: fw, h: fh })
  }

  return { data, width, height, frames: rects }
}

/** Metadados no formato de spritesheet do Aseprite (aceito por muitas engines). */
export function sheetJson(
  sprite: Sprite, sheet: SheetResult, imageName: string,
): string {
  const frames: Record<string, unknown> = {}
  sheet.frames.forEach((r, i) => {
    frames[`${sprite.name} ${i}.png`] = {
      frame: { x: r.x, y: r.y, w: r.w, h: r.h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: r.w, h: r.h },
      sourceSize: { w: sprite.width, h: sprite.height },
      duration: sprite.frames[i]?.duration ?? 100,
    }
  })
  return JSON.stringify(
    {
      frames,
      meta: {
        app: 'Pixel Painter',
        version: '1.0',
        image: imageName,
        format: 'RGBA8888',
        size: { w: sheet.width, h: sheet.height },
        scale: '1',
        frameTags: sprite.tags.map((t: Tag) => ({
          name: t.name, from: t.from, to: t.to, direction: t.direction,
        })),
        layers: sprite.layers.map((l) => ({
          name: l.name, opacity: l.opacity, blendMode: l.blend,
        })),
      },
    },
    null,
    2,
  )
}

/** Fatia uma imagem importada em frames de tamanho fixo. */
export function sliceSheet(
  data: Uint32Array, width: number, height: number, fw: number, fh: number,
): Uint32Array[] {
  const cols = Math.floor(width / fw)
  const rows = Math.floor(height / fh)
  const out: Uint32Array[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const buf = new Uint32Array(fw * fh)
      for (let y = 0; y < fh; y++) {
        const sy = r * fh + y
        const off = sy * width + c * fw
        buf.set(data.subarray(off, off + fw), y * fw)
      }
      out.push(buf)
    }
  }
  return out
}
