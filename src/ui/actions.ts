import { useEditor } from '../store/editor'
import { celKey } from '../core/types'
import { compositeFrame } from '../core/composite'
import { bufferToPngBlob, loadImageFile, pickFiles } from '../core/io/image'
import { saveBlob } from '../core/io/save'
import { encodeGif } from '../core/io/gif'
import { packSheet, sheetJson, sliceSheet, type SheetOptions } from '../core/io/sheet'
import { PROJECT_EXT, deserializeProject, serializeProject } from '../core/io/project'
import { parsePaletteFile, paletteToGpl } from '../core/palettes'
import { createSprite, ensureCel, addFrame, addLayer } from '../core/doc'
import { spriteColors } from '../core/composite'

const slug = (s: string) => s.trim().replace(/[^\w\-]+/g, '_').replace(/^_+|_+$/g, '') || 'sprite'

/* ── Exportação de imagem ────────────────────────────────────────────────── */

export async function exportPng(scale = 1, share = true): Promise<void> {
  const s = useEditor.getState()
  try {
    const buf = s.compositeCurrent(false)
    const blob = await bufferToPngBlob(buf, s.sprite.width, s.sprite.height, scale)
    const name = `${slug(s.sprite.name)}${scale > 1 ? `_${scale}x` : ''}.png`
    const { location } = await saveBlob(blob, name, { share })
    s.toast(location ? `Salvo em ${location}` : 'PNG exportado', 'success')
  } catch (e) {
    s.toast(`Falha ao exportar: ${(e as Error).message}`, 'error')
  }
}

export async function exportSpriteSheet(
  opts: SheetOptions & { scale?: number; withJson?: boolean },
): Promise<void> {
  const s = useEditor.getState()
  try {
    const frames = s.sprite.frames.map((f) =>
      compositeFrame(s.sprite, f.id, { includeReference: false }),
    )
    const sheet = packSheet(frames, s.sprite.width, s.sprite.height, opts)
    const name = `${slug(s.sprite.name)}_sheet.png`
    const blob = await bufferToPngBlob(sheet.data, sheet.width, sheet.height, opts.scale ?? 1)
    await saveBlob(blob, name, { share: false })
    if (opts.withJson) {
      const json = sheetJson(s.sprite, sheet, name)
      await saveBlob(new Blob([json], { type: 'application/json' }),
        `${slug(s.sprite.name)}_sheet.json`, { share: false })
    }
    s.toast(`Spritesheet ${sheet.width}×${sheet.height} exportado`, 'success')
  } catch (e) {
    s.toast(`Falha ao exportar: ${(e as Error).message}`, 'error')
  }
}

export async function exportGifFile(scale = 1): Promise<void> {
  const s = useEditor.getState()
  try {
    const frames = s.sprite.frames.map((f) => ({
      data: compositeFrame(s.sprite, f.id, { includeReference: false }),
      delay: f.duration,
    }))
    const colors = spriteColors(s.sprite)
    const blob = encodeGif(frames, {
      width: s.sprite.width,
      height: s.sprite.height,
      scale,
      loop: 0,
      palette: colors.length > 0 && colors.length <= 255 ? colors : undefined,
    })
    const { location } = await saveBlob(blob, `${slug(s.sprite.name)}.gif`)
    s.toast(location ? `Salvo em ${location}` : 'GIF exportado', 'success')
  } catch (e) {
    s.toast(`Falha no GIF: ${(e as Error).message}`, 'error')
  }
}

/* ── Projeto ─────────────────────────────────────────────────────────────── */

export async function saveProject(): Promise<void> {
  const s = useEditor.getState()
  try {
    const json = serializeProject(s.sprite)
    const { location } = await saveBlob(
      new Blob([json], { type: 'application/json' }),
      `${slug(s.sprite.name)}.${PROJECT_EXT}`,
      { share: false },
    )
    useEditor.setState({ dirty: false })
    s.toast(location ? `Projeto salvo em ${location}` : 'Projeto salvo', 'success')
  } catch (e) {
    s.toast(`Falha ao salvar: ${(e as Error).message}`, 'error')
  }
}

export async function openProject(): Promise<void> {
  const s = useEditor.getState()
  const [file] = await pickFiles(`.${PROJECT_EXT},application/json`, false)
  if (!file) return
  try {
    const sprite = deserializeProject(await file.text())
    s.loadSprite(sprite)
    s.toast(`"${sprite.name}" aberto`, 'success')
  } catch (e) {
    s.toast(`Arquivo inválido: ${(e as Error).message}`, 'error')
  }
}

/* ── Importação de imagens ───────────────────────────────────────────────── */

export async function importImageAsSprite(): Promise<void> {
  const s = useEditor.getState()
  const [file] = await pickFiles('image/*', false)
  if (!file) return
  try {
    const img = await loadImageFile(file)
    if (img.width > 4096 || img.height > 4096) {
      s.toast('Imagem grande demais (máx. 4096px)', 'error')
      return
    }
    const sprite = createSprite(img.width, img.height, file.name.replace(/\.[^.]+$/, ''))
    ensureCel(sprite, sprite.layers[0].id, sprite.frames[0].id).data.set(img.data)
    s.loadSprite(sprite)
    s.toast(`Importado ${img.width}×${img.height}`, 'success')
  } catch (e) {
    s.toast(`Falha ao importar: ${(e as Error).message}`, 'error')
  }
}

export async function importImageAsLayer(): Promise<void> {
  const s = useEditor.getState()
  const [file] = await pickFiles('image/*', false)
  if (!file) return
  try {
    const img = await loadImageFile(file)
    const { width: w, height: h } = s.sprite
    s.structuralEdit('Importar camada', () => {
      const layer = addLayer(s.sprite, s.sprite.layers.length - 1, file.name.replace(/\.[^.]+$/, ''))
      const cel = ensureCel(s.sprite, layer.id, s.currentFrameId())
      const cw = Math.min(w, img.width)
      const chh = Math.min(h, img.height)
      for (let y = 0; y < chh; y++) {
        for (let x = 0; x < cw; x++) cel.data[y * w + x] = img.data[y * img.width + x]
      }
      useEditor.setState({ layerIndex: s.sprite.layers.length - 1 })
    })
    s.toast('Imagem adicionada como camada', 'success')
  } catch (e) {
    s.toast(`Falha ao importar: ${(e as Error).message}`, 'error')
  }
}

export async function importSpriteSheet(fw: number, fh: number): Promise<void> {
  const s = useEditor.getState()
  const [file] = await pickFiles('image/*', false)
  if (!file) return
  try {
    const img = await loadImageFile(file)
    const parts = sliceSheet(img.data, img.width, img.height, fw, fh)
    if (parts.length === 0) { s.toast('Nenhum frame encontrado com esse tamanho', 'error'); return }

    const sprite = createSprite(fw, fh, file.name.replace(/\.[^.]+$/, ''))
    const layerId = sprite.layers[0].id
    ensureCel(sprite, layerId, sprite.frames[0].id).data.set(parts[0])
    for (let i = 1; i < parts.length; i++) {
      const f = addFrame(sprite, sprite.frames.length - 1)
      sprite.cels.set(celKey(layerId, f.id), { data: parts[i], opacity: 255 })
    }
    s.loadSprite(sprite)
    s.toast(`${parts.length} frames importados`, 'success')
  } catch (e) {
    s.toast(`Falha ao importar: ${(e as Error).message}`, 'error')
  }
}

/* ── Paletas ─────────────────────────────────────────────────────────────── */

export async function loadPalette(): Promise<void> {
  const s = useEditor.getState()
  const [file] = await pickFiles('.gpl,.pal,.hex,.txt,text/plain', false)
  if (!file) return
  try {
    const colors = parsePaletteFile(await file.text())
    if (!colors?.length) { s.toast('Nenhuma cor reconhecida no arquivo', 'error'); return }
    s.setPalette(colors)
    s.toast(`${colors.length} cores carregadas`, 'success')
  } catch (e) {
    s.toast(`Falha ao ler a paleta: ${(e as Error).message}`, 'error')
  }
}

export async function savePalette(): Promise<void> {
  const s = useEditor.getState()
  const text = paletteToGpl(s.sprite.palette, s.sprite.name)
  const { location } = await saveBlob(
    new Blob([text], { type: 'text/plain' }), `${slug(s.sprite.name)}.gpl`, { share: false },
  )
  s.toast(location ? `Paleta salva em ${location}` : 'Paleta exportada', 'success')
}
