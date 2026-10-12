import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { useIdioma } from './lib/idioma'
import { desbloquearSom } from './lib/som'
import './index.css'

// O browser só deixa tocar o som de "partida encontrada" depois de uma interação.
for (const evento of ['pointerdown', 'keydown'] as const) {
  window.addEventListener(evento, desbloquearSom, { passive: true })
}

/** Ao mudar de língua, a aplicação volta a montar-se e todos os textos mudam de uma vez. */
function Raiz() {
  const idioma = useIdioma()
  return <App key={idioma} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Raiz />
  </StrictMode>,
)
