/* ── Núcleo: tipos do documento ──────────────────────────────────────────── */

/** Pixel empacotado como uint32 na ordem de bytes do ImageData (little-endian: 0xAABBGGRR) */
export type RGBA = number

export type BlendMode =
  | 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten'
  | 'color-dodge' | 'color-burn' | 'hard-light' | 'soft-light'
  | 'difference' | 'exclusion' | 'addition' | 'subtract' | 'divide'
  | 'hue' | 'saturation' | 'color' | 'luminosity'

export const BLEND_MODES: { id: BlendMode; label: string }[] = [
  { id: 'normal', label: 'Normal' },
  { id: 'multiply', label: 'Multiplicar' },
  { id: 'screen', label: 'Tela' },
  { id: 'overlay', label: 'Sobrepor' },
  { id: 'darken', label: 'Escurecer' },
  { id: 'lighten', label: 'Clarear' },
  { id: 'color-dodge', label: 'Subexposição' },
  { id: 'color-burn', label: 'Superexposição' },
  { id: 'hard-light', label: 'Luz direta' },
  { id: 'soft-light', label: 'Luz suave' },
  { id: 'difference', label: 'Diferença' },
  { id: 'exclusion', label: 'Exclusão' },
  { id: 'addition', label: 'Adição' },
  { id: 'subtract', label: 'Subtração' },
  { id: 'divide', label: 'Divisão' },
  { id: 'hue', label: 'Matiz' },
  { id: 'saturation', label: 'Saturação' },
  { id: 'color', label: 'Cor' },
  { id: 'luminosity', label: 'Luminosidade' },
]

export interface Layer {
  id: string
  name: string
  visible: boolean
  locked: boolean
  /** 0..255 */
  opacity: number
  blend: BlendMode
  /** camada de referência: exibida no editor, ignorada na exportação */
  reference: boolean
}

export interface Frame {
  id: string
  /** duração em milissegundos */
  duration: number
}

export type LoopDirection = 'forward' | 'reverse' | 'pingpong'

export interface Tag {
  id: string
  name: string
  from: number
  to: number
  direction: LoopDirection
  color: RGBA
}

/** Um cel é o conteúdo de uma camada em um frame. Sempre do tamanho do sprite. */
export interface Cel {
  data: Uint32Array
  /** 0..255, multiplica a opacidade da camada */
  opacity: number
}

export interface Sprite {
  width: number
  height: number
  layers: Layer[] // índice 0 = fundo (renderizado primeiro)
  frames: Frame[]
  /** chave `${layerId}#${frameId}` */
  cels: Map<string, Cel>
  palette: RGBA[]
  tags: Tag[]
  name: string
}

export const celKey = (layerId: string, frameId: string) => `${layerId}#${frameId}`

let _idSeq = 0
export const uid = (prefix = 'i') =>
  `${prefix}${(_idSeq++).toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`

/* ── Ferramentas ─────────────────────────────────────────────────────────── */

export type ToolId =
  | 'pencil' | 'eraser' | 'bucket' | 'eyedropper'
  | 'line' | 'rectangle' | 'ellipse' | 'contour' | 'polygon'
  | 'spray' | 'gradient' | 'blur' | 'shading'
  | 'move' | 'select-rect' | 'select-ellipse' | 'lasso' | 'wand'
  | 'hand' | 'zoom'

export type SelectMode = 'replace' | 'add' | 'subtract' | 'intersect'
export type SymmetryMode = 'none' | 'horizontal' | 'vertical' | 'both'
export type BrushShape = 'square' | 'circle' | 'diamond'
export type DitherPattern = 'none' | 'checker' | 'dots25' | 'dots75' | 'bayer4' | 'lines-h' | 'lines-v'

export interface ToolSettings {
  size: number
  shape: BrushShape
  /** 0..255 */
  alpha: number
  /** 0..255 para o balde/varinha */
  tolerance: number
  contiguous: boolean
  /** formas: preencher o interior */
  fill: boolean
  /** formas: desenhar o contorno */
  stroke: boolean
  pixelPerfect: boolean
  symmetry: SymmetryMode
  dither: DitherPattern
  sprayDensity: number
  /** ferramenta de sombreamento: força -1..1 */
  shadeAmount: number
  selectMode: SelectMode
  /** balde: aplicar em todas as camadas visíveis como referência */
  sampleAllLayers: boolean
}

export const DEFAULT_TOOL_SETTINGS: ToolSettings = {
  size: 1,
  shape: 'circle',
  alpha: 255,
  tolerance: 0,
  contiguous: true,
  fill: false,
  stroke: true,
  pixelPerfect: true,
  symmetry: 'none',
  dither: 'none',
  sprayDensity: 24,
  shadeAmount: 0.25,
  selectMode: 'replace',
  sampleAllLayers: false,
}

/* ── Grade / visualização ────────────────────────────────────────────────── */

export interface GridSettings {
  visible: boolean
  width: number
  height: number
  offsetX: number
  offsetY: number
  pixelGrid: boolean
}

export interface OnionSettings {
  enabled: boolean
  prev: number
  next: number
  opacity: number
  tint: boolean
}
