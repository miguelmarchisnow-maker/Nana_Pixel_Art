import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { useEditor } from './store/editor'
import { isNative } from './core/io/save'
import './styles.css'

/* Bloqueia o zoom nativo do navegador — o app tem o seu próprio */
document.addEventListener('gesturestart', (e) => e.preventDefault())
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false })

/* Acesso ao estado pelo console e pelos testes automatizados */
;(window as unknown as { __editor: typeof useEditor }).__editor = useEditor

/* No APK o conteúdo já vem embutido — service worker só faz sentido na web */
if (!isNative() && 'serviceWorker' in navigator) {
  import('virtual:pwa-register')
    .then(({ registerSW }) => registerSW({ immediate: true }))
    .catch(() => {})
}

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
