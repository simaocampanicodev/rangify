import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { iniciarExtensao } from './lib/extensao'
import { useIdioma } from './lib/idioma'
import { iniciarFundo } from './lib/fundo'
import { iniciarLuz } from './lib/luz'
import { desbloquearSom } from './lib/som'
// As fontes vêm do próprio site (sem pedidos ao Google Fonts). Cada uma só descarrega
// a parte do alfabeto que a página usa (unicode-range).
import '@fontsource-variable/geist'
import '@fontsource-variable/jetbrains-mono'
import '@fontsource/instrument-serif/400-italic.css'
import './index.css'
import './cosmeticos.css'
import './efeitos.css'

// A extensão do browser, se estiver instalada, avisa que está lá (toca o som da partida no lugar do site).
iniciarExtensao()

// Fundo animado ou parado e painéis mais ou menos opacos, conforme o computador aguenta (ver lib/fundo.ts).
iniciarFundo()

// A luz do rato nos cartões (ver lib/luz.ts).
iniciarLuz()

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
