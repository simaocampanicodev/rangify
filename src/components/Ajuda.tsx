import { Suspense, createContext, lazy, useCallback, useContext, useState, type ReactNode } from 'react'

export type TopicoAjuda =
  | 'fila' | 'draft' | 'mapas' | 'codigo' | 'resultado' | 'ranking' | 'rank' | 'missoes' | 'funcoes'

// Os textos só descarregam na primeira vez que alguém abre a ajuda.
const JanelaAjuda = lazy(() => import('./AjudaConteudo').then((m) => ({ default: m.JanelaAjuda })))

const Contexto = createContext<(t: TopicoAjuda) => void>(() => {})

export function ProvedorAjuda({ children }: { children: ReactNode }) {
  const [aberto, setAberto] = useState<TopicoAjuda | null>(null)
  const fechar = useCallback(() => setAberto(null), [])
  return (
    <Contexto.Provider value={setAberto}>
      {children}
      {aberto && <Suspense fallback={null}><JanelaAjuda topico={aberto} onFechar={fechar} /></Suspense>}
    </Contexto.Provider>
  )
}

export function useAjuda() {
  return useContext(Contexto)
}
