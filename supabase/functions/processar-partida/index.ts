// Estado 8 do PRD (PROCESSING_API): procura a partida personalizada no
// histórico do Capitão A na Henrik Dev API, reconhece-a pelo mapa, pela hora e
// pelos jogadores, tira o resultado e as estatísticas de cada jogador (KDA, ACS,
// first bloods, trades, HS% e KAST) e fecha a partida com aplicar_resultado.
// Se ainda não aparecer, devolve { pendente: true } e o site volta a pedir; ao
// fim de 30 minutos a base de dados fecha sem estatísticas.
import { ErroHenrik, admin, cors, erro, henrik, partirRiotId, resposta, utilizador } from '../_shared/comum.ts'
import { caminhoHistorico, lerPartida, mesmoJogador, type PartidaHenrik } from '../_shared/henrik-partida.ts'

/** Cada consulta à API gasta pedidos da chave: no máximo uma por minuto por partida, venha de quem vier. */
const SEGUNDOS_ENTRE_CONSULTAS = 60
/** Basta que 8 dos 10 jogadores estejam no jogo (pode ter havido uma troca de última hora). */
const MINIMO_EM_COMUM = 8

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const u = await utilizador(req)
    if (!u) return erro('Tens de entrar na tua conta.', 401)
    const { matchId } = await req.json() as { matchId?: string }
    if (!matchId) return erro('Falta a partida.')
    const db = admin()

    const { data: m } = await db.from('matches').select('*').eq('id', matchId).single()
    if (!m) return erro('Partida não encontrada.', 404)
    if (m.state !== 'PROCESSING_API' || m.simulated) return resposta({ estado: m.state })

    const { data: jogadores } = await db.from('match_players').select('profile_id, team, profiles(riot_id, riot_puuid, region, auth_id)').eq('match_id', matchId)
    if (!jogadores?.some((j) => (j.profiles as { auth_id?: string } | null)?.auth_id === u.id)) return erro('Não fazes parte desta partida.', 403)

    // Reserva a consulta: se outra chegou há menos de um minuto, não gasta pedidos à API.
    const limite = new Date(Date.now() - SEGUNDOS_ENTRE_CONSULTAS * 1000).toISOString()
    const { data: reservada } = await db.from('matches').update({ api_checked_at: new Date().toISOString() })
      .eq('id', matchId).or(`api_checked_at.is.null,api_checked_at.lt.${limite}`).select('id')
    if (!reservada?.length) return resposta({ pendente: true })

    const capA = jogadores.find((j) => j.profile_id === m.captain_a)?.profiles as { riot_id: string; riot_puuid: string | null; region: string } | undefined
    if (!capA?.riot_id) return resposta({ pendente: true })
    const { nome, tag } = partirRiotId(capA.riot_id)
    const lista = await henrik<PartidaHenrik[]>(caminhoHistorico(capA.region, nome, tag))

    const inicio = new Date(m.started_at ?? m.created_at).getTime() - 10 * 60_000
    const nossos = jogadores
      .filter((j) => j.team)
      .map((j) => ({ perfilId: j.profile_id as string, ...(j.profiles as { riot_id: string | null; riot_puuid: string | null }) }))

    for (const p of lista ?? []) {
      if (p.metadata.map?.toLowerCase() !== String(m.map).toLowerCase()) continue
      if (p.metadata.game_start * 1000 < inicio) continue
      const lido = lerPartida(p)
      const eu = lido.jogadores.find((j) => mesmoJogador(j, capA.riot_id, capA.riot_puuid))
      if (!eu) continue
      const emComum = nossos.filter((n) => lido.jogadores.some((j) => mesmoJogador(j, n.riot_id, n.riot_puuid)))
      if (emComum.length < Math.min(MINIMO_EM_COMUM, nossos.length)) continue
      const corB = eu.equipa === 'red' ? 'blue' : 'red'
      const a = lido.rondasPorCor[eu.equipa as 'red' | 'blue']
      const b = lido.rondasPorCor[corB]
      if (a == null || b == null || a === b) continue

      // É esta. O resultado vem da API, que corrige o que os capitães escreveram.
      const stats = emComum.map((n) => {
        const h = lido.jogadores.find((j) => mesmoJogador(j, n.riot_id, n.riot_puuid))!
        return {
          perfilId: n.perfilId, kills: h.kills, deaths: h.deaths, assists: h.assists, acs: h.acs,
          firstBloods: h.firstBloods, trades: h.trades, hsPct: h.hsPct, kastPct: h.kastPct, agente: h.agente,
        }
      })
      const { error } = await db.rpc('aplicar_resultado', { p_match: matchId, p_a: a, p_b: b, p_stats: stats })
      if (error) return erro(error.message)
      return resposta({ estado: 'COMPLETED' })
    }
    return resposta({ pendente: true })
  } catch (e) {
    if (e instanceof ErroHenrik) return resposta({ pendente: true, aviso: e.message })
    console.error(e)
    return erro('Algo correu mal. Tenta outra vez.', 500)
  }
})
