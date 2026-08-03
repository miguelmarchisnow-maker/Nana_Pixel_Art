import { toImageData } from '../raster'

/* ── Canvas auxiliar ─────────────────────────────────────────────────────── */

export function bufferToCanvas(data: Uint32Array, w: number, h: number, scale = 1): HTMLCanvasElement {
  const base = document.createElement('canvas')
  base.width = w
  base.height = h
  const bctx = base.getContext('2d')!
  bctx.putImageData(toImageData(data, w, h), 0, 0)
  if (scale === 1) return base

  const out = document.createElement('canvas')
  out.width = w * scale
  out.height = h * scale
  const octx = out.getContext('2d')!
  octx.imageSmoothingEnabled = false
  octx.drawImage(base, 0, 0, out.width, out.height)
  return out
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png'): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao gerar a imagem'))), type)
  })
}

export const bufferToPngBlob = (data: Uint32Array, w: number, h: number, scale = 1) =>
  canvasToBlob(bufferToCanvas(data, w, h, scale))

export const bufferToDataUrl = (data: Uint32Array, w: number, h: number, scale = 1) =>
  bufferToCanvas(data, w, h, scale).toDataURL('image/png')

/* ── Importação de imagens ───────────────────────────────────────────────── */

export interface LoadedImage { data: Uint32Array; width: number; height: number }

export async function loadImageFile(file: File | Blob): Promise<LoadedImage> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image()
      im.onload = () => resolve(im)
      im.onerror = () => reject(new Error('Não foi possível ler a imagem'))
      im.src = url
    })
    const w = img.naturalWidth, h = img.naturalHeight
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d', { willReadFrequently: true })!
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(img, 0, 0)
    const id = ctx.getImageData(0, 0, w, h)
    return { data: new Uint32Array(id.data.buffer.slice(0)), width: w, height: h }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Abre o seletor de arquivos e devolve os arquivos escolhidos. */
export function pickFiles(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.multiple = multiple
    input.style.position = 'fixed'
    input.style.left = '-9999px'
    document.body.appendChild(input)

    let done = false
    const finish = (files: File[]) => {
      if (done) return
      done = true
      input.remove()
      resolve(files)
    }

    input.onchange = () => finish(input.files ? Array.from(input.files) : [])
    input.oncancel = () => finish([])

    /*
     * Rede de segurança: no WebView do Android e em alguns navegadores móveis o
     * evento `cancel` não dispara. Ao voltar o foco para a página, espera um
     * pouco e usa o que estiver no input — que pode já ter sido preenchido.
     */
    const onFocus = () => {
      setTimeout(() => finish(input.files ? Array.from(input.files) : []), 2500)
    }
    window.addEventListener('focus', onFocus, { once: true })

    input.click()
  })
}

export const readFileText = (file: File): Promise<string> => file.text()
