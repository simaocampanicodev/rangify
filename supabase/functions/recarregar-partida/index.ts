// Só Owner e Dev: volta a ler na Henrik Dev API o jogo de uma partida já
// terminada e refaz as estatísticas (agentes incluídos), o Rangify Score, o MVP
// e os pontos com a fórmula de agora (função _recalcular, migração 0013).
// Procura no histórico dos capitães e, se preciso, de mais um jogador.
import { ErroHenrik, admin, cors, erro, henrik, partirRiotId, resposta, utilizador } from '../_shared/comum.ts'
import { caminhoHistorico, encontrarPartida, type JogadorNosso, type PartidaHenrik } from '../_shared/henrik-partida.ts'

/** Jogos personalizados pedidos por jogador: chega para partidas de há uns dias. */
const JOGOS_POR_JOGADOR = 10
/** No máximo três históricos por pedido, para não gastar a chave da API. */
const HISTORICOS = 3
const MINIMO_EM_COMUM = 8

interface PerfilJogador { riot_id: string | null; riot_puuid: string | null; region: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const u = await utilizador(req)
    if (!u) return erro('Tens de entrar na tua conta.', 401)
    const db = admin()
    const { data: eu } = await db.from('profiles').select('role').eq('auth_id', u.id).single()
    if (eu?.role !== 'owner' && eu?.role !== 'dev') return erro('Só Owner e Dev podem fazer isto.', 403)

    const { matchId } = await req.json() as { matchId?: string }
    if (!matchId) return erro('Falta a partida.')
    const { data: m } = await db.from('matches').select('*').eq('id', matchId).single()
    if (!m) return erro('Esta partida já não existe.', 404)
    if (m.state !== 'COMPLETED') return erro('Só se recarregam partidas terminadas.')
    if (m.simulated) {
      const { data, error } = await db.rpc('_recalcular', { p_match: matchId, p_stats: null })
      if (error) return erro(error.message)
      return resposta({ ...data, fonte: 'teste' })
    }

    const { data: jogadores } = await db.from('match_players').select('profile_id, team, is_captain, profiles(riot_id, riot_puuid, region)').eq('match_id', matchId)
    const nossos: JogadorNosso[] = (jogadores ?? [])
      .filter((j) => j.team)
      .map((j) => ({ perfilId: j.profile_id as string, equipa: j.team as 'A' | 'B', ...(j.profiles as unknown as PerfilJogador) }))

    // Os capitães primeiro: são quem tem a certeza de ter jogado a partida.
    const ordem = [m.captain_a, m.captain_b, ...nossos.map((n) => n.perfilId)]
    const vistos = new Set<string>()
    const historicos: PerfilJogador[] = []
    for (const id of ordem) {
      if (!id || vistos.has(id)) continue
      vistos.add(id)
      const p = (jogadores ?? []).find((j) => j.profile_id === id)?.profiles as unknown as PerfilJogador | undefined
      if (p?.riot_id) historicos.push(p)
      if (historicos.length >= HISTORICOS) break
    }

    const desde = new Date(m.started_at ?? m.created_at).getTime() - 10 * 60_000
    const ate = m.finished_at ? new Date(m.finished_at).getTime() : null
    for (const p of historicos) {
      const { nome, tag } = partirRiotId(p.riot_id!)
      const lista = await henrik<PartidaHenrik[]>(caminhoHistorico(p.region, nome, tag, JOGOS_POR_JOGADOR)).catch((e) => {
        if (e instanceof ErroHenrik && e.estado === 404) return [] as PartidaHenrik[]
        throw e
      })
      const achada = encontrarPartida(lista ?? [], { mapa: String(m.map), desde, ate, nossos, minimo: MINIMO_EM_COMUM })
      if (!achada) continue
      const { data, error } = await db.rpc('_recalcular', { p_match: matchId, p_stats: achada.stats })
      if (error) return erro(error.message)
      const avisos: string[] = []
      const meus = m.score_a === achada.a && m.score_b === achada.b
      if (!meus) avisos.push(`A API diz ${achada.a}-${achada.b} e a partida tem ${m.score_a}-${m.score_b}. O resultado não foi mudado.`)
      if (achada.stats.length < nossos.length) avisos.push(`Só ${achada.stats.length} dos ${nossos.length} jogadores foram encontrados no jogo.`)
      return resposta({ ...data, fonte: 'api', avisos })
    }
    return erro(`Não encontrámos este jogo nos últimos ${JOGOS_POR_JOGADOR} jogos personalizados dos capitães.`, 404)
  } catch (e) {
    if (e instanceof ErroHenrik) return erro(e.message, 502)
    console.error(e)
    return erro('Algo correu mal. Tenta outra vez.', 500)
  }
})
