import type { CSSProperties } from 'react'

/* Ícones de traço em grade 24×24. */
const P: Record<string, string> = {
  pencil: 'M4 20l4.5-1L19 8.5 15.5 5 5 15.5 4 20z M14 6.5L17.5 10',
  eraser: 'M9 20h11 M15.5 5.5l3.5 3.5-8 8H8l-3-3 10.5-8.5z',
  bucket: 'M6 10l6-6 7 7-6 6a2 2 0 0 1-2.8 0L6 12.8a2 2 0 0 1 0-2.8z M9 7L7 5 M20 16c0 1.5-1 2.5-2 2.5S16 17.5 16 16s2-3.5 2-3.5S20 14.5 20 16z',
  eyedropper: 'M18.5 3.5a2.1 2.1 0 0 1 0 3L16 9l-1-1-6.5 6.5L7 18l-2 1 1-2 1.5-1.5L14 9l-1-1 2.5-2.5a2.1 2.1 0 0 1 3 0z',
  line: 'M5 19L19 5',
  rectangle: 'M4 6h16v12H4z',
  ellipse: 'M12 6c4.4 0 8 2.7 8 6s-3.6 6-8 6-8-2.7-8-6 3.6-6 8-6z',
  contour: 'M4 15c2-7 6-9 9-8s5 5 3 8-6 4-9 3-3-3-3-3z',
  polygon: 'M12 3.5l8.5 6.2-3.2 10H6.7l-3.2-10L12 3.5z',
  spray: 'M9 21h7v-9H9v9z M9 12l1-6h5l1 6 M19 5h.01 M21 8h.01 M19 11h.01 M17 3h.01',
  gradient: 'M4 5h16v14H4z M4 12h16 M7 16h2 M13 16h4 M15 8h2',
  blur: 'M12 3.5s6 6.5 6 10a6 6 0 0 1-12 0c0-3.5 6-10 6-10z',
  shading: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 3v18',
  move: 'M12 3v18 M3 12h18 M12 3l-3 3 M12 3l3 3 M12 21l-3-3 M12 21l3-3 M3 12l3-3 M3 12l3 3 M21 12l-3-3 M21 12l-3 3',
  'select-rect': 'M4 6h4 M12 6h4 M20 6v3 M20 13v3 M16 18h-4 M8 18H4 M4 15v-3 M4 9V6',
  'select-ellipse': 'M12 5c1.5 0 3 .3 4.2.8 M19 9.5c.6 .8 1 1.6 1 2.5 0 1-.4 1.8-1 2.6 M16.2 18.2c-1.3.5-2.7.8-4.2.8 M7.8 18.2C6.5 17.7 5.4 17 4.7 16.2 M4 12c0-.9.3-1.7.9-2.5 M7.8 5.8C9 5.3 10.5 5 12 5',
  lasso: 'M12 4c4.4 0 8 2.5 8 5.5S16.4 15 12 15c-1.3 0-2.5-.2-3.6-.6 M8.4 14.4C5.8 13.4 4 11.6 4 9.5 4 6.5 7.6 4 12 4 M8 15c0 2 1 3 1 4a1.6 1.6 0 1 1-3 0',
  wand: 'M5 19L15 9 M13 4l.8 2.2L16 7l-2.2.8L13 10l-.8-2.2L10 7l2.2-.8L13 4z M19 12l.5 1.5L21 14l-1.5.5L19 16l-.5-1.5L17 14l1.5-.5L19 12z',
  hand: 'M8 12V6.5a1.5 1.5 0 0 1 3 0V11 M11 11V5.5a1.5 1.5 0 0 1 3 0V11 M14 11V6.5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 6.5-6 6.5S5 18 5 14v-2.5a1.5 1.5 0 0 1 3 0V13',
  zoom: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M16 16l4.5 4.5 M8 11h6 M11 8v6',

  undo: 'M9 8H5V4 M5 8a8 8 0 1 1 1.5 9',
  redo: 'M15 8h4V4 M19 8a8 8 0 1 0-1.5 9',
  play: 'M7 4.5l12 7.5-12 7.5z',
  pause: 'M8 5h3v14H8z M13 5h3v14h-3z',
  stop: 'M6 6h12v12H6z',
  menu: 'M4 7h16 M4 12h16 M4 17h16',
  close: 'M6 6l12 12 M18 6L6 18',
  plus: 'M12 5v14 M5 12h14',
  minus: 'M5 12h14',
  check: 'M5 13l4 4L19 7',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6 M14 11v6',
  copy: 'M9 9h11v11H9z M15 9V4H4v11h5',
  duplicate: 'M8 8h12v12H8z M16 8V4H4v12h4',
  layers: 'M12 3l9 5-9 5-9-5 9-5z M3 13l9 5 9-5 M3 17l9 5 9-5',
  frames: 'M4 6h16v12H4z M9 6v12 M15 6v12 M4 12h16',
  palette: 'M12 3a9 9 0 0 0 0 18c1.5 0 2-1 1.5-2s0-2 1.5-2h2A4 4 0 0 0 21 13c0-5.5-4-10-9-10z M7.5 11h.01 M10 7.5h.01 M14.5 7.5h.01 M17 11h.01',
  grid: 'M4 4h16v16H4z M4 9.3h16 M4 14.6h16 M9.3 4v16 M14.6 4v16',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z M12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6z',
  'eye-off': 'M4 4l16 16 M9.5 9.6a2.8 2.8 0 0 0 3.9 3.9 M6.6 6.8C3.9 8.5 2.5 12 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1 M17.7 15.1c2.3-1.7 3.8-3.1 3.8-3.1S18 5.5 12 5.5c-.7 0-1.4.1-2 .2',
  lock: 'M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  unlock: 'M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 6.8-1.2',
  save: 'M5 4h11l3 3v13H5z M8 4v6h7V4 M8 14h8v6H8z',
  folder: 'M3 6h6l2 2.5h10V19H3z',
  image: 'M4 5h16v14H4z M4 15l4.5-4.5 4 4 3-3L20 15 M8.5 9.5h.01',
  share: 'M12 3v13 M8 7l4-4 4 4 M5 14v6h14v-6',
  settings: 'M12 8.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4z M19.4 13.5l1.8 1.4-2 3.4-2.2-.8a7.7 7.7 0 0 1-1.9 1.1l-.3 2.4h-4l-.3-2.4a7.7 7.7 0 0 1-1.9-1.1l-2.2.8-2-3.4 1.8-1.4a7.6 7.6 0 0 1 0-3l-1.8-1.4 2-3.4 2.2.8a7.7 7.7 0 0 1 1.9-1.1L10.8 3h4l.3 2.4c.7.3 1.3.6 1.9 1.1l2.2-.8 2 3.4-1.8 1.4a7.6 7.6 0 0 1 0 3z',
  'flip-h': 'M12 3v18 M9 7L4 12l5 5V7z M15 7l5 5-5 5V7z',
  'flip-v': 'M3 12h18 M7 9l5-5 5 5H7z M7 15l5 5 5-5H7z',
  rotate: 'M20 12a8 8 0 1 1-2.6-5.9 M20 4v5h-5',
  'rotate-ccw': 'M4 12a8 8 0 1 0 2.6-5.9 M4 4v5h5',
  crop: 'M6 2v16h16 M2 6h16v16',
  resize: 'M4 4h7v7 M20 20h-7v-7 M4 4l7 7 M20 20l-7-7',
  merge: 'M12 3v10 M8 9l4 4 4-4 M4 17h16 M4 21h16',
  fit: 'M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5',
  symmetry: 'M12 3v18 M8 7L4 12l4 5V7z M16 7l4 5-4 5V7z',
  onion: 'M8 4h9v9 M5.5 7.5h9v9h-9z M11 11h9v9h-9z',
  more: 'M12 5.5h.01 M12 12h.01 M12 18.5h.01',
  'chevron-up': 'M6 15l6-6 6 6',
  'chevron-down': 'M6 9l6 6 6-6',
  'chevron-left': 'M15 6l-6 6 6 6',
  'chevron-right': 'M9 6l6 6-6 6',
  'skip-back': 'M18 5v14L8 12z M6 5v14',
  'skip-fwd': 'M6 5v14l10-7z M18 5v14',
  swap: 'M7 5v10 M4 12l3 3 3-3 M17 19V9 M14 12l3-3 3 3',
  brush: 'M6 20c2 0 3-1 3-3 0-1.4-1-2.4-2.4-2.4C5.2 14.6 4 15.8 4 17.5 4 19 5 20 6 20z M9.5 15.5L19 6a2 2 0 0 0-2.8-2.8L6.7 12.7',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 11v6 M12 7.5h.01',
  tag: 'M3 11V4h7l10 10-7 7L3 11z M7.5 7.5h.01',
  film: 'M3 5h18v14H3z M3 9h3 M3 13h3 M3 17h3 M18 7h3 M18 11h3 M18 15h3 M8 5v14',
  text: 'M5 6h14 M12 6v13 M9 19h6',
  new: 'M13 3H6v18h12V8l-5-5z M13 3v5h5 M12 11v6 M9 14h6',
  export: 'M12 15V3 M8 7l4-4 4 4 M4 15v5h16v-5',
  'zoom-in': 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M16 16l4.5 4.5 M8 11h6 M11 8v6',
  'zoom-out': 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M16 16l4.5 4.5 M8 11h6',
  reference: 'M4 5h16v14H4z M4 14l4-4 3.5 3.5L15 10l5 5 M14.5 8h.01',
}

export type IconName = keyof typeof P | string

export function Icon({
  name, size = 22, style, strokeWidth = 1.7,
}: {
  name: IconName
  size?: number
  style?: CSSProperties
  strokeWidth?: number
}) {
  const d = P[name]
  if (!d) return null
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  )
}
