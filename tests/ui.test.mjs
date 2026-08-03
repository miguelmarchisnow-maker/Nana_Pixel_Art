/* Teste de interface num navegador real, simulando um celular. */
import puppeteer from 'puppeteer-core'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const URL = process.env.APP_URL ?? 'http://localhost:4173/'

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.error(`  ✗ ${name} ${extra}`) }
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

const page = await browser.newPage()
await page.emulate({
  viewport: { width: 412, height: 915, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
})

const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`) })
page.on('requestfailed', (r) => errors.push(`request: ${r.url()} ${r.failure()?.errorText}`))

console.log(`\nAbrindo ${URL}`)
await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 })
await page.waitForSelector('.app canvas', { timeout: 10000 })

/* ── Carregamento ────────────────────────────────────────────────────────── */
console.log('\nCarregamento')
ok('sem erros de JavaScript', errors.length === 0, errors.join(' | '))
ok('canvas presente', await page.$('.app canvas') !== null)
ok('barra de ferramentas', await page.$('.tabbar') !== null)
ok('canvas visível ao abrir (sem painel cobrindo)', await page.$('.sheet') === null)

const canvasBox = await page.$eval('.app > .stage canvas', (el) => {
  const r = el.getBoundingClientRect()
  return { x: r.x, y: r.y, w: r.width, h: r.height }
})
ok('canvas ocupa a área', canvasBox.w > 300 && canvasBox.h > 200,
  `${canvasBox.w}×${canvasBox.h}`)

/* Abre e fecha um painel para conferir o ciclo */
await (await page.$$('.tabbar button'))[0].click()
await new Promise((r) => setTimeout(r, 300))
ok('painel abre pela aba', await page.$('.sheet') !== null)
await page.click('.sheet-head .ibtn')
await new Promise((r) => setTimeout(r, 300))
ok('painel fecha', await page.$('.sheet') === null)

/* ── Estado interno exposto para o teste ─────────────────────────────────── */
const store = async (fn, ...args) =>
  page.evaluate(new Function('args', `return (${fn}).apply(null, args)`), args)

/* ── Desenho por toque ───────────────────────────────────────────────────── */
console.log('\nDesenho')

const box = await page.$eval('.app > .stage canvas', (el) => {
  const r = el.getBoundingClientRect()
  return { x: r.x, y: r.y, w: r.width, h: r.height }
})
const cx = box.x + box.w / 2
const cy = box.y + box.h / 2

const countPixels = () =>
  page.evaluate(() => {
    const w = window
    const s = w.__editor.getState()
    const cel = s.sprite.cels.get(
      `${s.sprite.layers[s.layerIndex].id}#${s.sprite.frames[s.frameIndex].id}`,
    )
    let n = 0
    for (const p of cel.data) if (p >>> 24) n++
    return n
  })

ok('tela começa vazia', (await countPixels()) === 0)

/* Traço de um dedo */
await page.touchscreen.touchStart(cx - 40, cy)
await page.touchscreen.touchMove(cx - 20, cy)
await page.touchscreen.touchMove(cx, cy)
await page.touchscreen.touchMove(cx + 20, cy)
await page.touchscreen.touchEnd()
await new Promise((r) => setTimeout(r, 200))

const afterStroke = await countPixels()
ok('um dedo desenha', afterStroke > 0, `${afterStroke} px`)

/* Desfazer */
await page.evaluate(() => window.__editor.getState().undo())
await new Promise((r) => setTimeout(r, 150))
ok('desfazer limpa o traço', (await countPixels()) === 0)

await page.evaluate(() => window.__editor.getState().redo())
await new Promise((r) => setTimeout(r, 150))
ok('refazer restaura', (await countPixels()) === afterStroke)

/* ── Zoom com dois dedos ─────────────────────────────────────────────────── */
console.log('\nGestos')
const zoomBefore = await page.evaluate(() => window.__editor.getState().zoom)
const pixelsBeforePinch = await countPixels()

const client = await page.createCDPSession()
const touch = (type, points) =>
  client.send('Input.dispatchTouchEvent', { type, touchPoints: points })

await touch('touchStart', [
  { x: cx - 50, y: cy, id: 1 },
  { x: cx + 50, y: cy, id: 2 },
])
await touch('touchMove', [
  { x: cx - 120, y: cy, id: 1 },
  { x: cx + 120, y: cy, id: 2 },
])
await touch('touchEnd', [])
await new Promise((r) => setTimeout(r, 200))

const zoomAfter = await page.evaluate(() => window.__editor.getState().zoom)
ok('dois dedos ampliam', zoomAfter > zoomBefore * 1.5, `${zoomBefore} → ${zoomAfter}`)
ok('pinça não desenha', (await countPixels()) === pixelsBeforePinch)

await page.evaluate(() => window.__editor.getState().fitView())
await new Promise((r) => setTimeout(r, 150))

/* ── Ferramentas ─────────────────────────────────────────────────────────── */
console.log('\nFerramentas')

await page.evaluate(() => {
  const s = window.__editor.getState()
  s.setTool('bucket')
  s.setPrimary(0xff0000ff) // ABGR: vermelho opaco
})
await page.touchscreen.tap(cx + 60, cy + 60)
await new Promise((r) => setTimeout(r, 250))
const afterBucket = await countPixels()
ok('balde preenche a área', afterBucket > afterStroke * 10, `${afterBucket} px`)

await page.evaluate(() => window.__editor.getState().setTool('eraser'))
await page.touchscreen.touchStart(cx, cy)
await page.touchscreen.touchMove(cx + 10, cy + 10)
await page.touchscreen.touchEnd()
await new Promise((r) => setTimeout(r, 200))
ok('borracha remove pixels', (await countPixels()) < afterBucket)

/* Seleção retangular */
await page.evaluate(() => window.__editor.getState().setTool('select-rect'))
await page.touchscreen.touchStart(cx - 30, cy - 30)
await page.touchscreen.touchMove(cx, cy)
await page.touchscreen.touchMove(cx + 30, cy + 30)
await page.touchscreen.touchEnd()
await new Promise((r) => setTimeout(r, 250))
const hasSel = await page.evaluate(() => !!window.__editor.getState().selection)
ok('seleção criada', hasSel)

/* ── Camadas e frames ────────────────────────────────────────────────────── */
console.log('\nCamadas e frames')

await page.evaluate(() => window.__editor.getState().addLayerAction())
await new Promise((r) => setTimeout(r, 150))
ok('nova camada', await page.evaluate(() => window.__editor.getState().sprite.layers.length) === 2)

await page.evaluate(() => window.__editor.getState().addFrameAction(true))
await new Promise((r) => setTimeout(r, 200))
const fc = await page.evaluate(() => window.__editor.getState().sprite.frames.length)
ok('novo frame duplicado', fc === 2, `${fc}`)

await page.evaluate(() => window.__editor.getState().undo())
await new Promise((r) => setTimeout(r, 150))
ok('desfazer estrutural', await page.evaluate(() => window.__editor.getState().sprite.frames.length) === 1)

/* ── Painéis da interface ────────────────────────────────────────────────── */
console.log('\nInterface')

const tabs = await page.$$('.tabbar button')
ok('quatro abas', tabs.length === 4, `${tabs.length}`)

for (const [i, name] of ['Ferramentas', 'Cores', 'Camadas', 'Frames'].entries()) {
  const t = (await page.$$('.tabbar button'))[i]
  await t.click()
  await new Promise((r) => setTimeout(r, 250))
  const title = await page.$eval('.sheet-head h2', (el) => el.textContent).catch(() => null)
  ok(`aba ${name} abre um painel`, title !== null, `título="${title}"`)
  const overflow = await page.evaluate(() => {
    const el = document.querySelector('.sheet')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { right: r.right, bottom: r.bottom, vw: innerWidth, vh: innerHeight }
  })
  ok(`painel ${name} cabe na tela`,
    overflow && overflow.right <= overflow.vw + 1 && overflow.bottom <= overflow.vh + 1,
    JSON.stringify(overflow))
  await page.click('.sheet-head .ibtn')
  await new Promise((r) => setTimeout(r, 200))
}

/* O painel não pode esconder o desenho */
await (await page.$$('.tabbar button'))[0].click()
await new Promise((r) => setTimeout(r, 400))
const framing = await page.evaluate(() => {
  const st = window.__editor.getState()
  const stage = document.querySelector('.stage').getBoundingClientRect()
  const sheet = document.querySelector('.sheet').getBoundingClientRect()
  const limit = Math.min(stage.bottom, sheet.top)
  const top = stage.top + st.panY
  const bottom = top + st.sprite.height * st.zoom
  return {
    height: bottom - top,
    usable: limit - stage.top,
    visible: Math.max(0, Math.min(bottom, limit) - Math.max(top, stage.top)),
    offCenter: Math.abs((top + bottom) / 2 - (stage.top + limit) / 2),
  }
})
// Se o sprite for maior que o espaço livre, o certo é ficar centralizado nele
ok('sprite centralizado no espaço livre com o painel aberto',
  framing.visible >= Math.min(framing.height, framing.usable) - 3 && framing.offCenter <= 6,
  `${framing.visible.toFixed(0)}/${framing.height.toFixed(0)}px, útil ${framing.usable.toFixed(0)}px`)
await page.click('.sheet-head .ibtn')
await new Promise((r) => setTimeout(r, 300))

/* Menu */
await page.click('.topbar .ibtn')
await new Promise((r) => setTimeout(r, 300))
const menuItems = await page.$$('.menu-item')
ok('menu abre com itens', menuItems.length > 25, `${menuItems.length} itens`)

/* Diálogo de novo sprite */
const newItem = await page.evaluateHandle(() =>
  [...document.querySelectorAll('.menu-item')].find((b) => b.textContent.includes('Novo sprite')))
await newItem.asElement().click()
await new Promise((r) => setTimeout(r, 300))
ok('diálogo abre', await page.$('.dialog') !== null)
const dlgFits = await page.evaluate(() => {
  const r = document.querySelector('.dialog').getBoundingClientRect()
  return r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 && r.width > 200
})
ok('diálogo cabe na tela', dlgFits)

const chip = await page.evaluateHandle(() =>
  [...document.querySelectorAll('.chip')].find((b) => b.textContent.startsWith('64×64')))
await chip.asElement().click()
const createBtn = await page.evaluateHandle(() =>
  [...document.querySelectorAll('.dialog footer .btn')].find((b) => b.textContent === 'Criar'))
await createBtn.asElement().click()
await new Promise((r) => setTimeout(r, 400))
const size = await page.evaluate(() => {
  const s = window.__editor.getState().sprite
  return [s.width, s.height]
})
ok('novo sprite 64×64', size[0] === 64 && size[1] === 64, `${size}`)
ok('vista reenquadrada', await page.evaluate(() => window.__editor.getState().zoom) > 1)

/* ── Exportação ──────────────────────────────────────────────────────────── */
console.log('\nExportação')

const png = await page.evaluate(async () => {
  const s = window.__editor.getState()
  const buf = s.compositeCurrent(false)
  const c = document.createElement('canvas')
  c.width = s.sprite.width
  c.height = s.sprite.height
  c.getContext('2d').putImageData(
    new ImageData(new Uint8ClampedArray(buf.buffer, 0, buf.length * 4), c.width, c.height), 0, 0)
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'))
  return blob ? blob.size : 0
})
ok('PNG do frame gerado', png > 60, `${png} bytes`)

/* ── Autosave ────────────────────────────────────────────────────────────── */
console.log('\nPersistência')
await page.evaluate(() => {
  const s = window.__editor.getState()
  s.setTool('pencil')
})
await page.touchscreen.touchStart(cx - 20, cy - 20)
await page.touchscreen.touchMove(cx + 20, cy + 20)
await page.touchscreen.touchEnd()
await new Promise((r) => setTimeout(r, 2200))

const saved = await page.evaluate(() => {
  const raw = localStorage.getItem('pixel-painter:autosave')
  return raw ? raw.length : 0
})
ok('autosave gravado', saved > 100, `${saved} bytes`)

const pxBefore = await countPixels()
/* O guardião de saída dispara um beforeunload — aceita e segue */
page.on('dialog', (d) => d.accept().catch(() => {}))
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('.app canvas')
await new Promise((r) => setTimeout(r, 900))
const pxAfter = await countPixels()
ok('trabalho recuperado após recarregar', pxAfter === pxBefore, `${pxBefore} → ${pxAfter}`)

/* ── Erros acumulados ────────────────────────────────────────────────────── */
console.log('\nSaúde geral')
ok('nenhum erro de runtime', errors.length === 0, errors.slice(0, 5).join(' | '))

await browser.close()
console.log(`\n${'─'.repeat(46)}`)
console.log(`${pass} passaram, ${fail} falharam`)
process.exit(fail > 0 ? 1 : 0)
