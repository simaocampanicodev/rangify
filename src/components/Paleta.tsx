import { Suspense, lazy, useEffect, useState } from 'react'
import { useSessao } from '@/contexts/Sessao'

// A janela só descarrega quando se abre a paleta pela primeira vez.
const PaletaJanela = lazy(() => import('./PaletaJanela'))

const EVENTO = 'rangify:paleta'

/** Abre a paleta de comandos (usado pelo botão do menu). */
export function abrirPaleta() {
  window.dispatchEvent(new Event(EVENTO))
}

/** A tecla de atalho que o utilizador vê: ⌘K no Mac e Ctrl K no resto. */
export const atalhoPaleta = () => (typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K')

/** Ouve Ctrl/Cmd + K em qualquer página com sessão e mostra a paleta (ver PaletaJanela.tsx). */
export function Paleta() {
  const { sessao } = useSessao()
  const [aberta, setAberta] = useState(false)
  const pode = !!sessao && !sessao.incompleta
  useEffect(() => {
    if (!pode) return
    const tecla = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setAberta((v) => !v) }
    }
    const abrir = () => setAberta(true)
    window.addEventListener('keydown', tecla)
    window.addEventListener(EVENTO, abrir)
    return () => { window.removeEventListener('keydown', tecla); window.removeEventListener(EVENTO, abrir) }
  }, [pode])
  if (!aberta || !pode) return null
  return <Suspense fallback={null}><PaletaJanela aoFechar={() => setAberta(false)} /></Suspense>
}
