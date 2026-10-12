import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { aoMudarDados, avisarMudanca, dados, type EstadoFila, type Partida } from '@/lib/dados'
import { ESTADOS_ATIVOS } from '@/lib/regras'
import { acertarRelogio } from '@/lib/tempo'
import { useAvisos } from './Avisos'
import { useSessao } from './Sessao'
import { l } from '@/lib/idioma'

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
  const emCurso = useRef<Promise<void> | null>(null)
  const terminada = useRef<string | null>(null)

  /** Um ciclo: uma só ida ao servidor traz a fila e a partida já avançada. */
  const buscar = useCallback(async () => {
    if (!sessao || sessao.incompleta) return
    try {
      const mostrar = ultima.current && fechada.current !== ultima.current ? ultima.current : null
      const { fila: f, partida: p } = await dados.situacao(mostrar)
      acertarRelogio(f.agora)
      setFila(f)
      if (p && ativo(p)) {
        ultima.current = p.id
        setPartida(p)
      } else if (mostrar && p?.id === mostrar) {
        // Acabou agora: mostra o resumo até o utilizador o fechar.
        if (p.estado === 'CANCELLED') {
          fechada.current = ultima.current
          ultima.current = null
          setPartida(null)
          avisar(f.naFila
            ? l('A partida foi cancelada porque alguém não aceitou. Voltaste à fila com o mesmo lugar.', 'The match was cancelled because someone did not accept. You are back in the queue with the same spot.')
            : l('A partida foi cancelada.', 'The match was cancelled.'), f.naFila ? 'ok' : 'erro')
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
    }
  }, [sessao, avisar])

  /** O ciclo automático: se já há um a correr, não começa outro. */
  const ciclo = useCallback(() => {
    if (emCurso.current) return
    emCurso.current = buscar().finally(() => { emCurso.current = null })
  }, [buscar])

  /**
   * Depois de um clique: espera pelo ciclo que já ia a meio (trazia dados de
   * antes do clique) e busca logo dados novos, em vez de esperar pelo próximo.
   */
  const atualizar = useCallback(async () => {
    if (emCurso.current) await emCurso.current
    if (!emCurso.current) emCurso.current = buscar().finally(() => { emCurso.current = null })
    await emCurso.current
  }, [buscar])

  const emJogo = ativo(partida) || !!fila?.naFila
  useEffect(() => {
    if (!sessao) { setFila(null); setPartida(null); ultima.current = null; return }
    ciclo()
    const t = window.setInterval(ciclo, emJogo ? 1000 : 8000)
    const off = aoMudarDados((o) => { if (o === 'partida' || o === 'fila') ciclo() })
    return () => { window.clearInterval(t); off() }
  }, [sessao, emJogo, ciclo])

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
