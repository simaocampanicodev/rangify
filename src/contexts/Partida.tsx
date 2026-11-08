import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { aoMudarDados, avisarMudanca, dados, type EstadoFila, type FilaTipo, type Partida, type SalaPartida } from '@/lib/data'
import { BATIMENTO_DO_LIDER_MS, SILENCIO_DO_LIDER_MS, assinatura, eleger, fundir, precisaDePerguntar, publica } from '@/lib/jogo/lider'
import { estadoAtivo } from '@/lib/jogo/estados'
import { PERGUNTA_MS, consultarExtensao, extensaoAvisarFila, extensaoMantemAFila, extensaoPresente } from '@/lib/integracoes/extensao'
import { armazemSessao } from '@/lib/armazem'
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
/** Marca no separador que a fila foi deixada ao descarregar a página ("hora|fila"): um recarregar volta a pô-la, na mesma fila. */
const CHAVE_RECARGA = 'rangify:fila-ao-fechar'
const JANELA_RECARGA = 30_000
/** O servidor tira da fila quem fica 3 minutos sem sinal de vida: este fica muito abaixo disso. */
const BATIMENTO = 30_000
/** Se o líder da sala não envia nada durante SILENCIO_DO_LIDER_MS, a verificação seguinte vê-o: tem de ser mais curta. */
const VERIFICAR_LIDER_MS = 2000
const ativo = (p: Partida | null) => !!p && estadoAtivo(p.estado)

/**
 * Segue a fila e a partida do utilizador em todo o site: a janela de
 * confirmação aparece em qualquer página e o resto das fases vive em /partida/<ID>.
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
  // Numa partida, só um jogador (o líder) pergunta à base de dados e reenvia o estado aos outros (ver lib/lider.ts).
  const sala = useRef<SalaPartida | null>(null)
  const [lider, setLider] = useState<string | null>(null)
  const [salaLigada, setSalaLigada] = useState(false)
  const [seguidor, setSeguidor] = useState(false)
  const ultimoRecebido = useRef(0)
  const ultimoEnvio = useRef({ assinatura: '', em: 0 })
  const partidaRef = useRef<Partida | null>(null)
  const souLiderRef = useRef(false)
  const meuId = sessao && !sessao.incompleta ? sessao.perfilId : null

  /** Larga a partida que se estava a mostrar (o resumo fechado, ou a cancelada). */
  const esquecerPartida = useCallback(() => {
    fechada.current = ultima.current
    ultima.current = null
    setPartida(null)
  }, [])

  const buscar = useCallback(async () => {
    if (!sessao || sessao.incompleta) return
    const mostrar = ultima.current && fechada.current !== ultima.current ? ultima.current : null
    let situacao
    try {
      situacao = await dados.situacao(mostrar)
    } catch {
      return // rede em baixo: tenta outra vez no próximo ciclo
    }
    const { fila: f, partida: p } = situacao
    acertarRelogio(f.agora)
    setFila(f)
    // O líder reenvia o estado aos outros nove: quando muda, e de 4 em 4 segundos para saberem que ele está vivo.
    if (p && souLiderRef.current && sala.current) {
      const sig = assinatura(p)
      if (sig !== ultimoEnvio.current.assinatura || Date.now() - ultimoEnvio.current.em > BATIMENTO_DO_LIDER_MS) {
        ultimoEnvio.current = { assinatura: sig, em: Date.now() }
        sala.current.transmitir(publica(p))
      }
    }
    if (p && ativo(p)) {
      ultima.current = p.id
      setPartida(p)
    } else if (mostrar && p?.id === mostrar) {
      if (p.estado === 'CANCELLED') {
        esquecerPartida()
        avisar(f.naFila
          ? l('A partida foi cancelada porque alguém não aceitou. Voltaste à fila com o mesmo lugar.', 'The match was cancelled because someone did not accept. You are back in the queue with the same spot.')
          : l('A partida foi cancelada.', 'The match was cancelled.'), f.naFila ? 'ok' : 'erro')
      } else {
        // Acabou agora: mostra o resumo até o utilizador o fechar.
        setPartida(p)
        // No Supabase nada avisa as outras páginas: o Dashboard, as missões e o perfil
        // só voltam a carregar se avisarmos uma vez que esta partida terminou.
        if (p.estado === 'COMPLETED' && terminada.current !== p.id) {
          terminada.current = p.id
          avisarMudanca('partida')
        }
      }
    } else {
      setPartida(null)
    }
  }, [sessao, avisar, esquecerPartida])

  /** Começa um ciclo (uma só ida ao servidor traz a fila e a partida já avançada); nunca há dois ao mesmo tempo. */
  const iniciar = useCallback(() => {
    emCurso.current = buscar().finally(() => { emCurso.current = null })
    return emCurso.current
  }, [buscar])

  const ciclo = useCallback(() => {
    if (!emCurso.current) iniciar()
  }, [iniciar])

  /**
   * Depois de um clique: espera pelo ciclo que já ia a meio (trazia dados de
   * antes do clique) e busca logo dados novos, em vez de esperar pelo próximo.
   */
  const atualizar = useCallback(async () => {
    if (emCurso.current) await emCurso.current
    await (emCurso.current ?? iniciar())
  }, [iniciar])

  const visivel = useVisivel()
  const idDaPartida = partida && ativo(partida) ? partida.id : null
  const naFila = !!fila?.naFila
  partidaRef.current = partida
  const souLider = salaLigada && !!meuId && lider === meuId
  souLiderRef.current = souLider
  // De quanto em quanto tempo pergunta (null: só quando o Realtime avisa).
  // Com Realtime o servidor avisa de cada mudança, por isso aqui só se pergunta para cumprir os prazos (draft, bans...): 2,5 s
  // chegam. Sem ele (demo) os bots andam ao ritmo desta pergunta.
  // Quem não é o líder só confirma o estado de tempos a tempos (mais depressa nos bans, onde há sugestões só da sua equipa).
  const { realtime } = dados
  const intervalo = idDaPartida ? (!realtime ? (visivel ? 1000 : 3000) : seguidor ? (partida?.estado === 'MAP_BAN' ? 5000 : 15_000) : visivel ? 2500 : 5000)
    : naFila ? (!realtime ? 1000 : visivel ? 5000 : 10_000)
    : visivel ? (!realtime ? 8000 : 30_000) : null
  useEffect(() => {
    if (!sessao) { setFila(null); setPartida(null); ultima.current = null; return }
    ciclo()
    const t = intervalo == null ? null : window.setInterval(ciclo, intervalo)
    const off = aoMudarDados((o) => { if (o === 'partida' || o === 'fila') ciclo() })
    return () => { if (t != null) window.clearInterval(t); off() }
  }, [sessao, intervalo, ciclo])

  // Fechar o separador ou o browser tira-te da fila. Recarregar a página também a deixa, mas
  // ao abrir de novo voltas a entrar (é o mesmo separador), por isso quase não se nota.
  const tipoNaFila: FilaTipo = fila?.fila === 'ranked' ? 'ranked' : 'aberta'
  useEffect(() => {
    if (!naFila) return
    const sair = () => {
      // Com a extensão do browser viva nesta conta, fechar o site não tira ninguém da fila: é ela que dá o sinal de vida.
      if (meuId && extensaoMantemAFila(meuId)) return
      armazemSessao.escrever(CHAVE_RECARGA, `${Date.now()}|${tipoNaFila}`)
      dados.sairFilaAoFechar()
    }
    window.addEventListener('pagehide', sair)
    return () => window.removeEventListener('pagehide', sair)
  }, [naFila, meuId, tipoNaFila])

  // Entrar ou sair da fila (por qualquer caminho) avisa a extensão, que passa a acompanhá-la por Realtime.
  const jaViu = useRef<boolean | null>(null)
  useEffect(() => {
    if (!meuId || !fila) return
    if (jaViu.current !== null && jaViu.current !== naFila) extensaoAvisarFila()
    jaViu.current = naFila
  }, [naFila, meuId, fila])

  // Enquanto estás na fila, vai perguntando à extensão se continua viva (o aviso de fecho acima usa a última resposta).
  useEffect(() => {
    if (!naFila || !meuId) return
    const perguntar = () => { if (extensaoPresente()) consultarExtensao(meuId) }
    perguntar()
    const t = window.setInterval(perguntar, PERGUNTA_MS)
    return () => window.clearInterval(t)
  }, [naFila, meuId])

  // Sinal de vida: se o aviso de fecho não chegar (browser rebentou, portátil adormeceu), o servidor tira-te ao fim de 3 minutos.
  useEffect(() => {
    if (!naFila) return
    const t = window.setInterval(() => { dados.batimentoFila() }, BATIMENTO)
    return () => window.clearInterval(t)
  }, [naFila])

  // Se esta página nasceu de um recarregar com a fila aberta, volta a entrar.
  useEffect(() => {
    if (!meuId) return
    const [quando, qual] = (armazemSessao.ler(CHAVE_RECARGA) ?? '').split('|')
    const antes = Number(quando)
    const tipo: FilaTipo = qual === 'ranked' ? 'ranked' : 'aberta'
    armazemSessao.apagar(CHAVE_RECARGA)
    if (!antes || Date.now() - antes > JANELA_RECARGA) return
    // Um instante para o pedido de saída da página anterior chegar primeiro.
    const t = window.setTimeout(() => { dados.entrarFila(tipo).catch(() => {}) }, 1500)
    return () => window.clearTimeout(t)
  }, [meuId])

  // A sala da partida: o líder (quem tem o separador à frente e está lá há mais tempo) pergunta à base de dados e reenvia o
  // estado; os outros recebem-no. Se o canal não abrir, ou o líder se calar, cada um volta a perguntar por conta própria.
  useEffect(() => {
    if (!idDaPartida || !meuId) { sala.current = null; setLider(null); setSalaLigada(false); return }
    ultimoRecebido.current = 0
    ultimoEnvio.current = { assinatura: '', em: 0 }
    const s = dados.sala(idDaPartida, meuId, {
      aoPresencas: (ps) => setLider(eleger(ps)),
      aoLigado: setSalaLigada,
      aoReceber: (p) => {
        // O líder confia na base de dados, não em quem lhe escreve.
        if (p.id !== idDaPartida || souLiderRef.current) return
        ultimoRecebido.current = Date.now()
        const minha = partidaRef.current
        // Fase nova (o código e as sugestões só chegam a quem os pede) ou partida acabada (o resumo é de cada um): pergunta.
        if (precisaDePerguntar(p, minha)) ciclo()
        if (!estadoAtivo(p.estado)) return
        const nova = fundir(p, minha)
        setPartida((atual) => (atual && assinatura(atual) === assinatura(nova) ? atual : nova))
      },
    })
    sala.current = s
    return () => { s?.sair(); sala.current = null; setLider(null); setSalaLigada(false) }
  }, [idDaPartida, meuId, ciclo])

  // Sou seguidor enquanto houver líder e ele continuar a enviar; sem notícias dele durante uns segundos, volto a perguntar.
  useEffect(() => {
    if (!idDaPartida) { setSeguidor(false); return }
    const ver = () => setSeguidor(salaLigada && !!lider && lider !== meuId && Date.now() - ultimoRecebido.current < SILENCIO_DO_LIDER_MS)
    ver()
    const t = window.setInterval(ver, VERIFICAR_LIDER_MS)
    return () => window.clearInterval(t)
  }, [idDaPartida, salaLigada, lider, meuId])

  // Os avisos do Realtime chegam em rajadas (dez jogadores a entrar): junta-os num só pedido.
  useEffect(() => {
    if (!meuId) return
    // Quem recebe o estado do líder não precisa de ouvir a base de dados: o líder ouve por todos.
    if (idDaPartida && seguidor) return
    let t: number | undefined
    const off = dados.aoMudarJogo(meuId, idDaPartida, () => {
      window.clearTimeout(t)
      // Um pequeno atraso ao calhas: dez jogadores a reagir ao mesmo aviso no mesmo instante eram dez perguntas de uma vez.
      t = window.setTimeout(ciclo, 150 + Math.random() * 450)
    })
    return () => { window.clearTimeout(t); off() }
  }, [meuId, idDaPartida, ciclo, seguidor])

  return (
    <Contexto.Provider value={{ fila, partida, ativa: ativo(partida), atualizar, fecharResumo: esquecerPartida }}>
      {children}
    </Contexto.Provider>
  )
}

export function usePartida() {
  const c = useContext(Contexto)
  if (!c) throw new Error('usePartida fora do ProvedorPartida')
  return c
}
