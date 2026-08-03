import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

/** true quando rodando dentro do APK (e não no navegador). */
export const isNative = () => Capacitor.isNativePlatform()

/** Pasta usada no aparelho, dentro de Documentos. */
const FOLDER = 'PixelPainter'

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => {
      const s = String(fr.result)
      resolve(s.slice(s.indexOf(',') + 1))
    }
    fr.onerror = () => reject(new Error('Não foi possível ler o arquivo'))
    fr.readAsDataURL(blob)
  })
}

/* ── Navegador ───────────────────────────────────────────────────────────── */

function browserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/* ── Aparelho ────────────────────────────────────────────────────────────── */

async function nativeSave(blob: Blob, filename: string, offerShare: boolean): Promise<string> {
  const data = await blobToBase64(blob)
  const path = `${FOLDER}/${filename}`

  /*
   * Documentos é a pasta pública, visível em qualquer gerenciador de arquivos.
   * Em algumas versões do Android ela é bloqueada — nesse caso cai para a pasta
   * externa do próprio app, que sempre funciona e também é navegável.
   */
  let uri = ''
  let where = 'Documentos'
  try {
    const res = await Filesystem.writeFile({
      path, data, directory: Directory.Documents, recursive: true,
    })
    uri = res.uri
  } catch {
    const res = await Filesystem.writeFile({
      path, data, directory: Directory.External, recursive: true,
    })
    uri = res.uri
    where = 'Android/data/com.pixelpainter.app/files'
  }

  if (offerShare && uri) {
    try {
      await Share.share({ title: filename, files: [uri] })
    } catch {
      // Compartilhamento cancelado ou indisponível — o arquivo já está salvo
    }
  }
  return `${where}/${path}`
}

/* ── API única ───────────────────────────────────────────────────────────── */

export interface SaveResult {
  /** caminho legível para mostrar ao usuário; vazio no navegador */
  location: string
}

/**
 * Salva um arquivo da melhor forma para a plataforma.
 * No APK grava em Documentos/PixelPainter e abre o menu de compartilhar.
 * No navegador dispara o download normal.
 */
export async function saveBlob(
  blob: Blob, filename: string, opts: { share?: boolean } = {},
): Promise<SaveResult> {
  if (!isNative()) {
    browserDownload(blob, filename)
    return { location: '' }
  }
  const location = await nativeSave(blob, filename, opts.share ?? true)
  return { location }
}

/** Lê um arquivo escolhido pelo usuário — igual nas duas plataformas. */
export const readAsText = (file: File) => file.text()
