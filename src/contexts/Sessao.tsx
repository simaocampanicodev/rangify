import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { definirDonoCache } from '@/hooks/useCarregar'
import { aoMudarDados, dados, type Perfil, type Sessao } from '@/lib/dados'

interface ValorSessao {
  carregando: boolean
  sessao: Sessao | null
  perfil: Perfil | null
  recarregar: () => Promise<void>
  /** Owner e Dev veem as ferramentas de teste. */
  podeTestar: boolean
  /** Owner, Dev e Mod entram na área de staff. */
  eStaff: boolean
}

const Contexto = createContext<ValorSessao | null>(null)

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const [carregando, setCarregando] = useState(true)
  const [sessao, setSessao] = useState<Sessao | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  // Os dados guardados em memória são de uma conta: ao mudar de conta, esvaziam.
  definirDonoCache(perfil?.id ?? null)

  const recarregar = useCallback(async () => {
    try {
      const s = await dados.sessao()
      setSessao(s)
      setPerfil(s ? await dados.meuPerfil() : null)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    recarregar()
    const a = dados.aoMudarSessao(() => { recarregar() })
    const b = aoMudarDados((o) => { if (o === 'perfil' || o === 'partida') dados.meuPerfil().then(setPerfil).catch(() => {}) })
    return () => { a(); b() }
  }, [recarregar])

  const funcao = perfil?.funcao
  return (
    <Contexto.Provider value={{
      carregando, sessao, perfil, recarregar,
      podeTestar: funcao === 'owner' || funcao === 'dev',
      eStaff: funcao === 'owner' || funcao === 'dev' || funcao === 'mod',
    }}>
      {children}
    </Contexto.Provider>
  )
}

export function useSessao() {
  const c = useContext(Contexto)
  if (!c) throw new Error('useSessao fora do ProvedorSessao')
  return c
}
