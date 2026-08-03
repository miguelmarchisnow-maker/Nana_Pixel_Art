/*
 * Testa o APK rodando de verdade num emulador Android.
 * Fala CDP direto pelo WebSocket do Node — o Puppeteer não conecta no
 * endpoint de WebView do Android.
 */
import { execFileSync } from 'node:child_process'
import { appendFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SDK = process.env.ANDROID_HOME ?? join(homedir(), 'AppData', 'Local', 'Android', 'Sdk')
const ADB = join(SDK, 'platform-tools', 'adb.exe')
const PKG = 'com.pixelpainter.app'
const LOG = join(dirname(fileURLToPath(import.meta.url)), '.apk-progress.log')

writeFileSync(LOG, '')
const say = (line) => { console.log(line); appendFileSync(LOG, `${line}\n`) }

const adb = (...args) => execFileSync(ADB, args, { encoding: 'utf8' }).trim()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; say(`  ✓ ${name}`) }
  else { fail++; say(`  ✗ ${name}${extra ? `  — ${extra}` : ''}`) }
}

/* ── Cliente CDP ─────────────────────────────────────────────────────────── */

class Page {
  #ws
  #id = 0
  #pending = new Map()
  errors = []

  static async attach(port) {
    // Espera a aba do WebView aparecer
    let target
    for (let i = 0; i < 30; i++) {
      try {
        const list = await (await fetch(`http://localhost:${port}/json`)).json()
        target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
        if (target) break
      } catch { /* WebView ainda subindo */ }
      await sleep(1000)
    }
    if (!target) throw new Error('WebView não apareceu no DevTools')

    const p = new Page()
    p.#ws = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((res, rej) => {
      p.#ws.onopen = res
      p.#ws.onerror = () => rej(new Error('WebSocket recusado'))
    })
    p.#ws.onmessage = (e) => p.#onMessage(JSON.parse(e.data))
    await p.send('Runtime.enable')
    return p
  }

  #onMessage(m) {
    if (m.id !== undefined) {
      const w = this.#pending.get(m.id)
      if (!w) return
      this.#pending.delete(m.id)
      m.error ? w.rej(new Error(m.error.message)) : w.res(m.result)
      return
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails
      this.errors.push(d.exception?.description ?? d.text)
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      this.errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '))
    }
  }

  send(method, params = {}) {
    const id = ++this.#id
    this.#ws.send(JSON.stringify({ id, method, params }))
    return new Promise((res, rej) => {
      this.#pending.set(id, { res, rej })
      setTimeout(() => {
        if (this.#pending.delete(id)) rej(new Error(`timeout em ${method}`))
      }, 30000)
    })
  }

  /** Avalia uma expressão na página e devolve o valor. */
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression: `(async () => { return (${expression}) })()`,
      awaitPromise: true,
      returnByValue: true,
    })
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
    }
    return r.result.value
  }

  async waitFor(expression, timeout = 20000) {
    const until = Date.now() + timeout
    while (Date.now() < until) {
      try { if (await this.eval(expression)) return true } catch { /* recarregando */ }
      await sleep(500)
    }
    return false
  }

  close() { try { this.#ws.close() } catch { /* já fechado */ } }
}

async function launchAndAttach(port) {
  adb('shell', 'am', 'start', '-n', `${PKG}/.MainActivity`)
  await sleep(6000)
  const pid = adb('shell', 'pidof', PKG)
  adb('forward', '--remove-all')
  adb('forward', `tcp:${port}`, `localabstract:webview_devtools_remote_${pid}`)
  await sleep(1000)
  return { pid, page: await Page.attach(port) }
}

/* ── Instalação ──────────────────────────────────────────────────────────── */

say('\nInstalação')
const apk = process.argv[2] ?? join(homedir(), 'Desktop', 'Pixel Painter.apk')
const install = adb('install', '-r', apk)
ok('APK instalado', /Success/.test(install), install.split('\n').pop())

/* Zera os dados do app: sem isto o autosave da execução anterior é recuperado */
adb('shell', 'am', 'force-stop', PKG)
adb('shell', 'pm', 'clear', PKG)
adb('logcat', '-c')
const { pid, page } = await launchAndAttach(9222)
ok('processo em execução', /^\d+$/.test(pid), pid)

const focus = adb('shell', 'dumpsys', 'activity', 'activities')
  .split('\n').find((l) => l.includes('topResumedActivity')) ?? ''
ok('activity em primeiro plano', focus.includes(PKG))

/* ── Carregamento ────────────────────────────────────────────────────────── */

say('\nCarregamento no aparelho')
ok('interface montada', await page.waitFor(`!!document.querySelector('.app canvas')`))
ok('ponte Capacitor ativa', await page.eval(`window.Capacitor?.isNativePlatform?.() === true`))

const plugins = await page.eval(`Object.keys(window.Capacitor?.Plugins ?? {})`)
ok('plugins nativos registrados',
  ['Filesystem', 'Share', 'App'].every((p) => plugins.includes(p)), plugins.join(', '))

ok('service worker desligado no APK',
  (await page.eval(`(await navigator.serviceWorker?.getRegistrations?.() ?? []).length`)) === 0)

/* ── Enquadramento (o bug encontrado no emulador) ────────────────────────── */

say('\nEnquadramento com o painel aberto')

const framing = `(() => {
  const s = window.__editor.getState()
  const stage = document.querySelector('.stage').getBoundingClientRect()
  const sheet = document.querySelector('.sheet')?.getBoundingClientRect()
  const top = stage.top + s.panY
  const bottom = top + s.sprite.height * s.zoom
  const limit = sheet ? Math.min(stage.bottom, sheet.top) : stage.bottom
  const usable = limit - stage.top
  const height = bottom - top
  return {
    height,
    usable,
    visible: Math.max(0, Math.min(bottom, limit) - Math.max(top, stage.top)),
    // o quanto o centro do sprite se afasta do centro da area visivel
    offCenter: Math.abs((top + bottom) / 2 - (stage.top + limit) / 2),
    sheetOpen: !!sheet,
  }
})()`

/*
 * Com o painel aberto a area util pode ser menor que o sprite: nesse caso o
 * maximo visivel e a propria area util. O que importa e o sprite ficar
 * centralizado no espaco livre, e nao escondido atras do painel.
 */
const wellFramed = (f) =>
  f.visible >= Math.min(f.height, f.usable) - 3 && f.offCenter <= 6

await page.eval(`window.__editor.getState().openPanel(null)`)
await sleep(400)
let f = await page.eval(framing)
ok('sem painel: sprite inteiro visível', !f.sheetOpen && wellFramed(f),
  `${f.visible.toFixed(0)} de ${f.height.toFixed(0)}px, área útil ${f.usable.toFixed(0)}px`)

await page.eval(`window.__editor.getState().openPanel('tools')`)
await sleep(600)
f = await page.eval(framing)
ok('painel aberto: sprite centralizado no espaço livre', f.sheetOpen && wellFramed(f),
  `${f.visible.toFixed(0)} de ${f.height.toFixed(0)}px, área útil ${f.usable.toFixed(0)}px, ` +
  `desvio ${f.offCenter.toFixed(0)}px`)

await page.eval(`window.__editor.getState().openPanel(null)`)
await sleep(400)
f = await page.eval(framing)
ok('painel fechado: volta ao normal', wellFramed(f),
  `${f.visible.toFixed(0)} de ${f.height.toFixed(0)}px, área útil ${f.usable.toFixed(0)}px`)

/* ── Desenho com toque real na tela ──────────────────────────────────────── */

say('\nDesenho por toque no aparelho')

const COUNT = `(() => {
  const s = window.__editor.getState()
  const cel = s.sprite.cels.get(
    s.sprite.layers[s.layerIndex].id + '#' + s.sprite.frames[s.frameIndex].id)
  let n = 0
  for (const p of cel.data) if (p >>> 24) n++
  return n
})()`

ok('tela começa vazia', (await page.eval(COUNT)) === 0)

const target = await page.eval(`(() => {
  const s = window.__editor.getState()
  const st = document.querySelector('.stage').getBoundingClientRect()
  return {
    x: st.left + s.panX + (s.sprite.width / 2) * s.zoom,
    y: st.top + s.panY + (s.sprite.height / 2) * s.zoom,
    dpr: window.devicePixelRatio,
  }
})()`)

const px = Math.round(target.x * target.dpr)
const py = Math.round(target.y * target.dpr)
adb('shell', 'input', 'swipe', String(px - 70), String(py), String(px + 70), String(py), '400')
await sleep(900)

const drawn = await page.eval(COUNT)
ok('toque na tela desenha', drawn > 0, `${drawn} px`)

await page.eval(`window.__editor.getState().undo()`)
await sleep(300)
ok('desfazer funciona no aparelho', (await page.eval(COUNT)) === 0)
await page.eval(`window.__editor.getState().redo()`)
await sleep(300)
ok('refazer funciona no aparelho', (await page.eval(COUNT)) === drawn)

/* ── Salvamento nativo ───────────────────────────────────────────────────── */

say('\nSalvamento no armazenamento do aparelho')

const saved = await page.eval(`(async () => {
  const { Filesystem } = window.Capacitor.Plugins
  try {
    const res = await Filesystem.writeFile({
      path: 'PixelPainter/_teste.txt', data: btoa('ok'),
      directory: 'DOCUMENTS', recursive: true,
    })
    return { ok: true, uri: res.uri }
  } catch (e) { return { ok: false, error: String(e && e.message || e) } }
})()`)
ok('grava em Documentos/PixelPainter', saved.ok, saved.error)

if (saved.ok) {
  const path = saved.uri.replace('file://', '')
  ok('arquivo existe no sistema de arquivos',
    adb('shell', 'ls', path).includes('_teste.txt'), path)
  adb('shell', 'rm', '-f', path)
}

/* Exporta um PNG de verdade pela mesma camada que o app usa */
const png = await page.eval(`(async () => {
  const { Filesystem } = window.Capacitor.Plugins
  const s = window.__editor.getState()
  const buf = s.compositeCurrent(false)
  const c = document.createElement('canvas')
  c.width = s.sprite.width; c.height = s.sprite.height
  c.getContext('2d').putImageData(
    new ImageData(new Uint8ClampedArray(buf.buffer, 0, buf.length * 4), c.width, c.height), 0, 0)
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'))
  const b64 = await new Promise((r) => {
    const fr = new FileReader()
    fr.onload = () => r(String(fr.result).split(',')[1])
    fr.readAsDataURL(blob)
  })
  const res = await Filesystem.writeFile({
    path: 'PixelPainter/teste_apk.png', data: b64, directory: 'DOCUMENTS', recursive: true,
  })
  return res.uri
})()`)

const pngPath = png.replace('file://', '')
const size = Number(adb('shell', 'stat', '-c', '%s', pngPath).trim())
ok('PNG exportado grava bytes reais', size > 60, `${size} bytes`)
adb('shell', 'rm', '-f', pngPath)

/* ── Persistência entre aberturas ────────────────────────────────────────── */

say('\nPersistência')
await sleep(2200) // deixa o autosave rodar
const before = await page.eval(COUNT)
page.close()

adb('shell', 'am', 'force-stop', PKG)
await sleep(2000)
const { page: page2 } = await launchAndAttach(9223)
await page2.waitFor(`!!document.querySelector('.app canvas')`)
await sleep(1500)

const after = await page2.eval(COUNT)
ok('desenho sobrevive ao app ser fechado', after === before && after > 0, `${before} → ${after}`)

/* ── Botão Voltar do Android ─────────────────────────────────────────────── */

say('\nBotão Voltar')
await page2.eval(`window.__editor.getState().openPanel('tools')`)
await sleep(500)
adb('shell', 'input', 'keyevent', 'KEYCODE_BACK')
await sleep(700)
ok('Voltar fecha o painel', (await page2.eval(`window.__editor.getState().panel`)) === null)
ok('Voltar não fecha o app', /^\d+$/.test(adb('shell', 'pidof', PKG)))

/* ── Saúde geral ─────────────────────────────────────────────────────────── */

say('\nSaúde geral')
const crashes = adb('logcat', '-d')
  .split('\n')
  .filter((l) => /FATAL EXCEPTION|E AndroidRuntime/.test(l))
ok('nenhuma exceção nativa', crashes.length === 0, crashes.slice(0, 2).join(' | '))

const webErrors = [...page.errors, ...page2.errors]
ok('nenhum erro no WebView', webErrors.length === 0, webErrors.slice(0, 3).join(' | '))

page2.close()
say(`\n${'─'.repeat(46)}`)
say(`${pass} passaram, ${fail} falharam`)
process.exit(fail > 0 ? 1 : 0)
