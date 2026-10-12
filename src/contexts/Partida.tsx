import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { aoMudarDados, avisarMudanca, dados, type EstadoFila, type Partida } from '@/lib/dados'
import { ESTADOS_ATIVOS } from '@/lib/regras'
import { acertarRelogio } from '@/lib/tempo'
import { useAvisos } from './Avisos'
import { useSessao } from './Sessao'

interface ValorPartida {
  fila: EstadoFila | null
  /** A partida ativa, ou a última que terminou enquanto ainda não fechaste o resumo. */
  partida: Partida | null
  ativa: boolean
  atualizar: () => Promise<void>
  fecharResumo: () => void
}

const Contexto = createContext<ValorPartida | null>(null)
const ativo = (p: Partida | null) => !!p && (ESTADOS_ATIVOS as readonly string[]).includes(p.estado)

/**
 * Segue a fila e a partida do utilizador em todo o site: a janela de
 * confirmação aparece em qualquer página e o resto das fases vive em /jogar.
 * Pergunta ao servidor a cada segundo enquanto há fila ou partida.
 */
export function ProvedorPartida({ children }: { children: ReactNode }) {
  const { sessao } = useSessao()
  const avisar = useAvisos()
  const [fila, setFila] = useState<EstadoFila | null>(null)
  const [partida, setPartida] = useState<Partida | null>(null)
  const ultima = useRef<string | null>(null)
  const fechada = useRef<string | null>(null)
  const aCorrer = useRef(false)
  const terminada = useRef<string | null>(null)

  const atualizar = useCallback(async () => {
    if (!sessao || sessao.incompleta || aCorrer.current) return
    aCorrer.current = true
    try {
      const [f, ativa] = await Promise.all([dados.estadoFila(), dados.partidaAtiva()])
      acertarRelogio(f.agora)
      setFila(f)
      if (ativa) {
        const p = await dados.avancarPartida(ativa.id)
        ultima.current = ativa.id
        setPartida(p ?? ativa)
      } else if (ultima.current && fechada.current !== ultima.current) {
        // Acabou agora: mostra o resumo até o utilizador o fechar.
        const p = await dados.partida(ultima.current)
        if (p?.estado === 'CANCELLED') {
          fechada.current = ultima.current
          ultima.current = null
          setPartida(null)
          avisar(f.naFila
            ? 'A partida foi cancelada porque alguém não aceitou. Voltaste à fila com o mesmo lugar.'
            : 'A partida foi cancelada.', f.naFila ? 'ok' : 'erro')
        } else {
          setPartida(p)
          // No Supabase nada avisa as outras páginas: o Dashboard, as missões e o perfil
          // só voltam a carregar se avisarmos uma vez que esta partida terminou.
          if (p?.estado === 'COMPLETED' && terminada.current !== p.id) {
            terminada.current = p.id
            avisarMudanca('partida')
          }
        }
      } else {
        setPartida(null)
      }
    } catch {
      /* rede em baixo: tenta outra vez no próximo ciclo */
    } finally {
      aCorrer.current = false
    }
  }, [sessao, avisar])

  const emJogo = ativo(partida) || !!fila?.naFila
  useEffect(() => {
    if (!sessao) { setFila(null); setPartida(null); ultima.current = null; return }
    atualizar()
    const t = window.setInterval(atualizar, emJogo ? 1000 : 8000)
    const off = aoMudarDados((o) => { if (o === 'partida' || o === 'fila') atualizar() })
    return () => { window.clearInterval(t); off() }
  }, [sessao, emJogo, atualizar])

  const fecharResumo = useCallback(() => {
    fechada.current = ultima.current
    ultima.current = null
    setPartida(null)
  }, [])

  return (
    <Contexto.Provider value={{ fila, partida, ativa: ativo(partida), atualizar, fecharResumo }}>
      {children}
    </Contexto.Provider>
  )
}

export function usePartida() {
  const c = useContext(Contexto)
  if (!c) throw new Error('usePartida fora do ProvedorPartida')
  return c
}
