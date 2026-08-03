import { useEffect, useRef } from 'react'
import { App as CapApp } from '@capacitor/app'
import { useEditor } from '../store/editor'
import { cancelPolygon, useOverlay } from '../store/drawing'
import { isNative } from '../core/io/save'

/** Reprodução da animação respeitando a duração de cada frame e as tags. */
export function usePlayback() {
  const playing = useEditor((s) => s.playing)
  const dirRef = useRef(1)

  useEffect(() => {
    if (!playing) return
    let timer: number
    let cancelled = false

    const step = () => {
      if (cancelled) return
      const s = useEditor.getState()
      const frames = s.sprite.frames
      if (frames.length < 2) { useEditor.setState({ playing: false }); return }

      const tag = s.loopTag ? s.sprite.tags.find((t) => t.id === s.loopTag) : undefined
      const from = tag ? Math.max(0, tag.from) : 0
      const to = tag ? Math.min(frames.length - 1, tag.to) : frames.length - 1
      const dir = tag?.direction ?? 'forward'

      let next = s.frameIndex
      if (next < from || next > to) next = from

      if (dir === 'reverse') {
        next = next - 1 < from ? to : next - 1
      } else if (dir === 'pingpong') {
        if (next + dirRef.current > to) dirRef.current = -1
        else if (next + dirRef.current < from) dirRef.current = 1
        next += dirRef.current
      } else {
        next = next + 1 > to ? from : next + 1
      }

      useEditor.setState({ frameIndex: next })
      timer = window.setTimeout(step, Math.max(10, frames[next]?.duration ?? 100))
    }

    const cur = useEditor.getState()
    timer = window.setTimeout(
      step,
      Math.max(10, cur.sprite.frames[cur.frameIndex]?.duration ?? 100),
    )
    return () => { cancelled = true; clearTimeout(timer) }
  }, [playing])
}

/** Atalhos de teclado (útil com teclado físico ou tablet acoplado). */
export function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return

      const s = useEditor.getState()
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()

      if (mod) {
        switch (key) {
          case 'z': e.preventDefault(); e.shiftKey ? s.redo() : s.undo(); return
          case 'y': e.preventDefault(); s.redo(); return
          case 'c': e.preventDefault(); s.copy(); return
          case 'x': e.preventDefault(); s.cut(); return
          case 'v': e.preventDefault(); s.paste(); return
          case 'a': e.preventDefault(); s.selectAll(); return
          case 'd': e.preventDefault(); s.deselect(); return
          default: return
        }
      }

      const TOOLS: Record<string, Parameters<typeof s.setTool>[0]> = {
        b: 'pencil', e: 'eraser', g: 'bucket', i: 'eyedropper', l: 'line',
        u: 'rectangle', o: 'ellipse', m: 'select-rect', v: 'move', h: 'hand', z: 'zoom',
      }

      if (TOOLS[key]) { s.setTool(TOOLS[key]); return }

      switch (e.key) {
        case 'Delete':
        case 'Backspace': e.preventDefault(); s.deleteSelection(); break
        case 'x': case 'X': s.swapColors(); break
        case '[': s.setSettings({ size: Math.max(1, s.settings.size - 1) }); break
        case ']': s.setSettings({ size: Math.min(64, s.settings.size + 1) }); break
        case ',': s.setFrameIndex(s.frameIndex - 1); break
        case '.': s.setFrameIndex(s.frameIndex + 1); break
        case ' ': e.preventDefault(); s.togglePlay(); break
        case '+': case '=': s.zoomBy(2); break
        case '-': s.zoomBy(0.5); break
        case '0': s.fitView(); break
        case 'Escape': s.openDialog(null); break
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/** Avisa antes de fechar quando há trabalho não salvo em arquivo. */
export function useUnloadGuard() {
  useEffect(() => {
    if (isNative()) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!useEditor.getState().dirty) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])
}

/**
 * Botão Voltar do Android: fecha diálogo → fecha painel → sai do app.
 * Sem isso o Voltar encerraria o app no meio do desenho.
 */
export function useAndroidBackButton() {
  useEffect(() => {
    if (!isNative()) return
    let remove: (() => void) | undefined
    let cancelled = false

    CapApp.addListener('backButton', () => {
      const s = useEditor.getState()
      if (s.dialog) { s.openDialog(null); return }
      if (s.panel) { s.openPanel(s.panel); return }
      if (useOverlay.getState().polygon.length) { cancelPolygon(); return }
      CapApp.exitApp()
    }).then((handle) => {
      if (cancelled) handle.remove()
      else remove = () => handle.remove()
    })

    return () => { cancelled = true; remove?.() }
  }, [])
}
