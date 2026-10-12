import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { desbloquearSom } from './lib/som'
import './index.css'

// O browser só deixa tocar o som de "partida encontrada" depois de uma interação.
for (const evento of ['pointerdown', 'keydown'] as const) {
  window.addEventListener(evento, desbloquearSom, { passive: true })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
