import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { aoMudarDados, avisarMudanca, dados, type EstadoFila, type Partida } from '@/lib/dados'
import { ESTADOS_ATIVOS } from '@/lib/regras'
import { acertarRelogio } from '@/lib/tempo'
import { useVisivel } from '@/hooks/useVisivel'
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
 * No site real, o Realtime avisa quando a fila muda, quando entras numa partida e
 * quando ela avança; perguntar ao servidor fica como reserva (e, numa partida, para
 * fazer andar os prazos e os bots, que só avançam quando alguém pergunta).
 * Com o separador escondido pergunta menos ou nada.
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

  const visivel = useVisivel()
  const naPartida = ativo(partida)
  const naFila = !!fila?.naFila
  const demo = dados.modo === 'demo'
  // De quanto em quanto tempo pergunta (null: só quando o Realtime avisa).
  const intervalo = naPartida ? (visivel ? 1000 : 3000)
    : naFila ? (demo ? 1000 : visivel ? 5000 : 10_000)
    : visivel ? (demo ? 8000 : 30_000) : null
  useEffect(() => {
    if (!sessao) { setFila(null); setPartida(null); ultima.current = null; return }
    ciclo()
    const t = intervalo == null ? null : window.setInterval(ciclo, intervalo)
    const off = aoMudarDados((o) => { if (o === 'partida' || o === 'fila') ciclo() })
    return () => { if (t != null) window.clearInterval(t); off() }
  }, [sessao, intervalo, ciclo])

  // Os avisos do Realtime chegam em rajadas (dez jogadores a entrar): junta-os num só pedido.
  const perfilId = sessao && !sessao.incompleta ? sessao.perfilId : null
  const partidaId = naPartida ? partida!.id : null
  useEffect(() => {
    if (!perfilId) return
    let t: number | undefined
    const off = dados.aoMudarJogo(perfilId, partidaId, () => {
      window.clearTimeout(t)
      t = window.setTimeout(ciclo, 200)
    })
    return () => { window.clearTimeout(t); off() }
  }, [perfilId, partidaId, ciclo])

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
