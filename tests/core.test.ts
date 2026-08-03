/* Teste de fumaça do núcleo — roda em Node, sem DOM. */
import { createSprite, addLayer, addFrame, ensureCel, resizeCanvas, mergeDown } from '../src/core/doc'
import { celKey } from '../src/core/types'
import {
  makePaintCtx, drawLine, drawRect, drawEllipse, floodFill, makeBrush, stampBrush,
  rotateBuffer, flipBuffer, opaqueBounds, pixelPerfectFilter, resampleNearest,
} from '../src/core/raster'
import { rgba, getA, getR, getG, getB, toHex, fromHex, rgbToHsv, hsvToRgb } from '../src/core/color'
import { blendPixel } from '../src/core/blend'
import { compositeFrame, composeCel, spriteColors } from '../src/core/composite'
import { History, PixelTx, takeSnapshot } from '../src/core/history'
import { rleEncode, rleDecode, serializeProject, deserializeProject } from '../src/core/io/project'
import { encodeGif } from '../src/core/io/gif'
import { packSheet, sliceSheet } from '../src/core/io/sheet'
import { parsePaletteFile, medianCut, DB32 } from '../src/core/palettes'
import { rectMask, ellipseMaskOf, polygonMask, combine, invertMask, maskBounds, maskOutline } from '../src/core/selection'

let pass = 0
let fail = 0
const ok = (name: string, cond: boolean, extra = '') => {
  if (cond) { pass++ } else { fail++; console.error(`  ✗ ${name} ${extra}`) }
}
const section = (s: string) => console.log(`\n${s}`)

/* ── Cor ─────────────────────────────────────────────────────────────────── */
section('Cor')
{
  const c = rgba(18, 52, 86, 255)
  ok('empacotamento', getR(c) === 18 && getG(c) === 52 && getB(c) === 86 && getA(c) === 255)
  ok('hex ida e volta', fromHex(toHex(c)) === c, `${toHex(c)}`)
  ok('hex curto', fromHex('#f00') === rgba(255, 0, 0, 255))
  ok('hex inválido', fromHex('zzz') === null)
  const [h, s, v] = rgbToHsv(255, 0, 0)
  ok('rgb→hsv vermelho', h === 0 && s === 1 && v === 1)
  const [r2, g2, b2] = hsvToRgb(120, 1, 1)
  ok('hsv→rgb verde', r2 === 0 && g2 === 255 && b2 === 0)
}

/* ── Mesclagem ───────────────────────────────────────────────────────────── */
section('Mesclagem')
{
  const dst = rgba(0, 0, 0, 255)
  const src = rgba(255, 255, 255, 255)
  ok('normal opaco substitui', blendPixel(dst, src, 'normal', 255) === src)
  ok('alfa zero não altera', blendPixel(dst, rgba(255, 0, 0, 0), 'normal', 255) === dst)
  const mult = blendPixel(rgba(200, 200, 200, 255), rgba(128, 128, 128, 255), 'multiply', 255)
  ok('multiply escurece', getR(mult) < 200 && getR(mult) > 90, `r=${getR(mult)}`)
  const scr = blendPixel(rgba(50, 50, 50, 255), rgba(128, 128, 128, 255), 'screen', 255)
  ok('screen clareia', getR(scr) > 50)
  const half = blendPixel(rgba(0, 0, 0, 255), rgba(255, 255, 255, 255), 'normal', 128)
  ok('opacidade 50%', Math.abs(getR(half) - 128) <= 2, `r=${getR(half)}`)
  const onEmpty = blendPixel(0, rgba(255, 0, 0, 255), 'normal', 128)
  ok('sobre vazio preserva cor', getR(onEmpty) === 255 && Math.abs(getA(onEmpty) - 128) <= 1)
}

/* ── Rasterização ────────────────────────────────────────────────────────── */
section('Rasterização')
{
  const W = 32, H = 32
  const buf = new Uint32Array(W * H)
  const ctx = makePaintCtx(buf, W, H)
  const red = rgba(255, 0, 0, 255)
  const brush = makeBrush(1, 'circle')

  drawLine(ctx, brush, 0, 0, 31, 31, red)
  ok('linha diagonal desenhada', buf[0] === red && buf[31 * W + 31] === red)
  let count = 0
  for (const p of buf) if (p === red) count++
  ok('linha tem 32 pixels', count === 32, `${count}`)

  buf.fill(0)
  ctx.dirty = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
  drawRect(ctx, brush, 4, 4, 10, 10, red, false, true)
  ok('contorno do retângulo', buf[4 * W + 4] === red && buf[10 * W + 10] === red && buf[7 * W + 7] === 0)

  buf.fill(0)
  drawRect(ctx, brush, 4, 4, 10, 10, red, true, false)
  ok('retângulo preenchido', buf[7 * W + 7] === red)

  buf.fill(0)
  drawEllipse(ctx, brush, 2, 2, 20, 20, red, true, false)
  ok('elipse preenchida no centro', buf[11 * W + 11] === red)
  ok('elipse vazia no canto', buf[2 * W + 2] === 0)

  buf.fill(0)
  drawRect(ctx, brush, 5, 5, 15, 15, red, false, true)
  const blue = rgba(0, 0, 255, 255)
  floodFill(ctx, 10, 10, blue, { tolerance: 0, contiguous: true })
  ok('balde preenche o interior', buf[10 * W + 10] === blue)
  ok('balde respeita a borda', buf[0] === 0, 'vazou para fora')

  buf.fill(0)
  const bigBrush = makeBrush(5, 'circle')
  stampBrush(ctx, bigBrush, 16, 16, red)
  let n = 0
  for (const p of buf) if (p === red) n++
  ok('pincel 5 circular tem área', n >= 13 && n <= 25, `${n} px`)

  const pts = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]
  ok('pixel-perfect remove canto', pixelPerfectFilter(pts).length === 2)

  const rot = rotateBuffer(Uint32Array.from([1, 2, 3, 4]), 2, 2, 1)
  ok('rotação 90°', rot.w === 2 && rot.h === 2 && rot.data[0] === 3 && rot.data[1] === 1,
    `[${[...rot.data]}]`)
  const flip = flipBuffer(Uint32Array.from([1, 2, 3, 4]), 2, 2, true)
  ok('espelhar horizontal', flip[0] === 2 && flip[1] === 1)

  const up = resampleNearest(Uint32Array.from([1, 2, 3, 4]), 2, 2, 4, 4)
  ok('ampliação 2×', up.length === 16 && up[0] === 1 && up[3] === 2 && up[15] === 4)

  const b2 = new Uint32Array(W * H)
  b2[5 * W + 7] = red
  b2[9 * W + 11] = red
  const bb = opaqueBounds(b2, W, H)
  ok('caixa dos opacos', bb?.x === 7 && bb?.y === 5 && bb?.w === 5 && bb?.h === 5, JSON.stringify(bb))
  ok('caixa vazia', opaqueBounds(new Uint32Array(16), 4, 4) === null)
}

/* ── Máscara com seleção ─────────────────────────────────────────────────── */
section('Seleção')
{
  const W = 16, H = 16
  const m = rectMask(W, H, { x: 4, y: 4, w: 4, h: 4 })
  ok('máscara retangular', m[4 * W + 4] === 1 && m[3 * W + 3] === 0)
  const bb = maskBounds(m, W, H)
  ok('limites da máscara', bb?.x === 4 && bb?.w === 4)

  const e = ellipseMaskOf(W, H, { x: 0, y: 0, w: 16, h: 16 })
  ok('máscara elíptica centro', e[8 * W + 8] === 1)
  ok('máscara elíptica canto', e[0] === 0)

  const poly = polygonMask(W, H, [{ x: 1, y: 1 }, { x: 10, y: 1 }, { x: 10, y: 10 }])
  ok('máscara poligonal', poly[3 * W + 8] === 1 && poly[8 * W + 2] === 0)

  const sum = combine(m, rectMask(W, H, { x: 8, y: 4, w: 4, h: 4 }), 'add', W, H)
  ok('união', sum[4 * W + 4] === 1 && sum[4 * W + 9] === 1)
  const sub = combine(m, rectMask(W, H, { x: 4, y: 4, w: 2, h: 4 }), 'subtract', W, H)
  ok('subtração', sub[4 * W + 4] === 0 && sub[4 * W + 6] === 1)
  const inter = combine(m, rectMask(W, H, { x: 6, y: 4, w: 4, h: 4 }), 'intersect', W, H)
  ok('interseção', inter[4 * W + 6] === 1 && inter[4 * W + 4] === 0)
  const inv = invertMask(m, W, H)
  ok('inversão', inv[0] === 1 && inv[4 * W + 4] === 0)

  ok('contorno gera segmentos', maskOutline(m, W, H).length === 4 * 4 * 4)

  // Pintura restrita à seleção
  const buf = new Uint32Array(W * H)
  const ctx = makePaintCtx(buf, W, H, { mask: m })
  const brush = makeBrush(1, 'square')
  drawLine(ctx, brush, 0, 5, 15, 5, rgba(255, 0, 0, 255))
  ok('pintura fora da seleção é bloqueada', buf[5 * W + 0] === 0)
  ok('pintura dentro da seleção passa', buf[5 * W + 5] !== 0)
}

/* ── Documento e composição ──────────────────────────────────────────────── */
section('Documento')
{
  const sp = createSprite(8, 8, 'teste')
  ok('sprite inicial', sp.layers.length === 1 && sp.frames.length === 1 && sp.cels.size === 1)

  const l2 = addLayer(sp, 0, 'Camada 2')
  ok('adicionar camada cria cels', sp.layers.length === 2 && sp.cels.size === 2)

  addFrame(sp, 0)
  ok('adicionar frame cria cels de todas as camadas', sp.frames.length === 2 && sp.cels.size === 4)

  const base = ensureCel(sp, sp.layers[0].id, sp.frames[0].id)
  const top = ensureCel(sp, l2.id, sp.frames[0].id)
  base.data.fill(rgba(255, 0, 0, 255))
  top.data.fill(rgba(0, 0, 255, 128))

  const flat = compositeFrame(sp, sp.frames[0].id)
  ok('composição mistura camadas', getB(flat[0]) > 100 && getR(flat[0]) > 100, toHex(flat[0]))

  sp.layers[1].visible = false
  const hidden = compositeFrame(sp, sp.frames[0].id)
  ok('camada invisível é ignorada', hidden[0] === rgba(255, 0, 0, 255))
  sp.layers[1].visible = true

  sp.layers[1].reference = true
  ok('camada de referência fora da exportação',
    compositeFrame(sp, sp.frames[0].id, { includeReference: false })[0] === rgba(255, 0, 0, 255))
  ok('camada de referência no editor',
    compositeFrame(sp, sp.frames[0].id, { includeReference: true })[0] !== rgba(255, 0, 0, 255))
  sp.layers[1].reference = false

  ok('cores do sprite', spriteColors(sp).length >= 1)

  mergeDown(sp, l2.id, (below, above, layer) => composeCel(below.data, above, layer))
  ok('mesclar reduz camadas', sp.layers.length === 1)

  resizeCanvas(sp, { x: 2, y: 2, w: 4, h: 4 })
  ok('redimensionar tela', sp.width === 4 && sp.height === 4)
  ok('cels acompanham o novo tamanho',
    [...sp.cels.values()].every((c) => c.data.length === 16))
}

/* ── Histórico ───────────────────────────────────────────────────────────── */
section('Histórico')
{
  const sp = createSprite(16, 16)
  const key = celKey(sp.layers[0].id, sp.frames[0].id)
  const cel = sp.cels.get(key)!
  const hist = new History()
  const red = rgba(255, 0, 0, 255)

  const tx = new PixelTx(sp, 'Lápis')
  tx.touch(key)
  cel.data[5 * 16 + 5] = red
  const patches = tx.commit()
  ok('patch mínimo', patches.length === 1 && patches[0].rect.w === 1 && patches[0].rect.h === 1)
  hist.push({ label: 'Lápis', patches })

  ok('pode desfazer', hist.canUndo && !hist.canRedo)
  hist.undo(sp)
  ok('desfazer restaura', sp.cels.get(key)!.data[5 * 16 + 5] === 0)
  hist.redo(sp)
  ok('refazer reaplica', sp.cels.get(key)!.data[5 * 16 + 5] === red)

  // Snapshot estrutural
  const before = takeSnapshot(sp)
  addLayer(sp, 0)
  const after = takeSnapshot(sp)
  hist.push({ label: 'Nova camada', before, after })
  ok('estrutura antes de desfazer', sp.layers.length === 2)
  hist.undo(sp)
  ok('desfazer estrutural', sp.layers.length === 1)
  hist.redo(sp)
  ok('refazer estrutural', sp.layers.length === 2)

  // Novo push limpa o refazer
  hist.undo(sp)
  hist.push({ label: 'X', patches: [] })
  ok('novo comando limpa refazer', !hist.canRedo)
}

/* ── Serialização ────────────────────────────────────────────────────────── */
section('Arquivos')
{
  const data = new Uint32Array(100)
  data.fill(rgba(1, 2, 3, 4), 10, 60)
  const rt = rleDecode(rleEncode(data), 100)
  ok('RLE ida e volta', rt.every((v, i) => v === data[i]))
  ok('RLE comprime', rleEncode(data).length < data.byteLength)

  const sp = createSprite(12, 10, 'proj')
  addLayer(sp, 0, 'B')
  addFrame(sp, 0)
  const k = celKey(sp.layers[0].id, sp.frames[0].id)
  sp.cels.get(k)!.data[7] = rgba(9, 8, 7, 255)
  sp.layers[1].opacity = 128
  sp.layers[1].blend = 'multiply'

  const round = deserializeProject(serializeProject(sp))
  ok('projeto: dimensões', round.width === 12 && round.height === 10)
  ok('projeto: nome', round.name === 'proj')
  ok('projeto: camadas', round.layers.length === 2 && round.layers[1].blend === 'multiply')
  ok('projeto: frames', round.frames.length === 2)
  ok('projeto: pixels', round.cels.get(k)!.data[7] === rgba(9, 8, 7, 255))
  ok('projeto: cels completos', round.cels.size === 4)
  ok('projeto: paleta', round.palette.length === DB32.length)

  let threw = false
  try { deserializeProject('{"format":"outro"}') } catch { threw = true }
  ok('projeto inválido é rejeitado', threw)
}

/* ── Paletas ─────────────────────────────────────────────────────────────── */
section('Paletas')
{
  const gpl = parsePaletteFile('GIMP Palette\nName: X\n#\n255   0   0\tff0000\n  0 255   0\t00ff00\n')
  ok('lê .gpl', gpl?.length === 2 && gpl[0] === rgba(255, 0, 0, 255))

  const jasc = parsePaletteFile('JASC-PAL\n0100\n2\n255 255 0\n0 0 255\n')
  ok('lê JASC .pal', jasc?.length === 2 && jasc[1] === rgba(0, 0, 255, 255))

  const hex = parsePaletteFile('ff0000\n00ff00\n0000ff\n')
  ok('lê .hex', hex?.length === 3)

  const hist = new Map<number, number>()
  for (let i = 0; i < 400; i++) hist.set(rgba(i % 256, (i * 3) % 256, (i * 7) % 256, 255), 1)
  const reduced = medianCut(hist, 16)
  ok('median cut limita as cores', reduced.length <= 16 && reduced.length > 1, `${reduced.length}`)
  ok('median cut não mexe se já cabe', medianCut(new Map([[1, 1], [2, 1]]), 16).length === 2)
}

/* ── GIF e spritesheet ───────────────────────────────────────────────────── */
section('Exportação')
{
  const W = 8, H = 8
  const f1 = new Uint32Array(W * H).fill(rgba(255, 0, 0, 255))
  const f2 = new Uint32Array(W * H).fill(rgba(0, 0, 255, 255))
  const blob = encodeGif([{ data: f1, delay: 100 }, { data: f2, delay: 100 }], {
    width: W, height: H, loop: 0,
  })
  ok('GIF gerado', blob.size > 40, `${blob.size} bytes`)

  const bytes = new Uint8Array(await blob.arrayBuffer())
  const sig = String.fromCharCode(...bytes.slice(0, 6))
  ok('assinatura GIF89a', sig === 'GIF89a', sig)
  ok('terminador GIF', bytes[bytes.length - 1] === 0x3b)
  const netscape = String.fromCharCode(...bytes.slice(0, 200)).includes('NETSCAPE2.0')
  ok('loop infinito declarado', netscape)

  const scaled = encodeGif([{ data: f1, delay: 100 }], { width: W, height: H, scale: 4 })
  const sb = new Uint8Array(await scaled.arrayBuffer())
  ok('GIF ampliado tem 32px', sb[6] === 32 && sb[8] === 32, `${sb[6]}×${sb[8]}`)

  const sheet = packSheet([f1, f2], W, H, { layout: 'horizontal', padding: 2 })
  ok('spritesheet horizontal', sheet.width === 18 && sheet.height === 8, `${sheet.width}×${sheet.height}`)
  ok('frames posicionados', sheet.frames[1].x === 10)
  ok('conteúdo copiado', sheet.data[0] === f1[0] && sheet.data[10] === f2[0])

  const grid = packSheet([f1, f2, f1, f2], W, H, { layout: 'grid', columns: 2 })
  ok('spritesheet em grade', grid.width === 16 && grid.height === 16)

  const parts = sliceSheet(sheet.data, sheet.width, sheet.height, W, H)
  ok('fatiar spritesheet', parts.length === 2 && parts[0][0] === f1[0])
}

/* ── Resultado ───────────────────────────────────────────────────────────── */
console.log(`\n${'─'.repeat(46)}`)
console.log(`${pass} passaram, ${fail} falharam`)
if (fail > 0) process.exit(1)
