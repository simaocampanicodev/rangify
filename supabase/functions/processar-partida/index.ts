// Estado 8 do PRD (PROCESSING_API): procura a partida personalizada no
// histórico do Capitão A na Henrik Dev API, confirma o mapa e o resultado,
// tira KDA, ACS e first bloods de cada jogador e fecha a partida com
// aplicar_resultado. Se ainda não aparecer, devolve { pendente: true } e o
// site volta a pedir; ao fim de 15 minutos a base de dados fecha sem estatísticas.
import { ErroHenrik, admin, cors, enc, erro, henrik, partirRiotId, resposta, utilizador } from '../_shared/comum.ts'

interface JogadorHenrik { puuid: string; name: string; tag: string; team: string; stats: { score: number; kills: number; deaths: number; assists: number } }
interface MorteHenrik { round: number; kill_time_in_round: number; killer_puuid: string }
interface PartidaHenrik {
  metadata: { map: string; game_start: number; rounds_played: number; mode?: string }
  players: { all_players: JogadorHenrik[] }
  teams: Record<string, { rounds_won: number; rounds_lost: number }>
  kills?: MorteHenrik[]
  rounds?: { player_stats: { player_puuid: string; kill_events: MorteHenrik[] }[] }[]
}

/** First bloods: em cada ronda, quem fez a primeira morte. */
function firstBloods(p: PartidaHenrik): Map<string, number> {
  const contagem = new Map<string, number>()
  const porRonda = new Map<number, MorteHenrik>()
  const mortes = p.kills ?? (p.rounds ?? []).flatMap((r, i) => r.player_stats.flatMap((s) => s.kill_events.map((k) => ({ ...k, round: i }))))
  for (const k of mortes) {
    const atual = porRonda.get(k.round)
    if (!atual || k.kill_time_in_round < atual.kill_time_in_round) porRonda.set(k.round, k)
  }
  for (const k of porRonda.values()) contagem.set(k.killer_puuid, (contagem.get(k.killer_puuid) ?? 0) + 1)
  return contagem
}

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

    const capA = jogadores.find((j) => j.profile_id === m.captain_a)?.profiles as { riot_id: string; riot_puuid: string | null; region: string } | undefined
    if (!capA?.riot_id) return resposta({ pendente: true })
    const { nome, tag } = partirRiotId(capA.riot_id)
    const lista = await henrik<PartidaHenrik[]>(`/valorant/v3/matches/${enc(capA.region)}/${enc(nome)}/${enc(tag)}?mode=custom&size=10`)

    const inicio = new Date(m.started_at ?? m.created_at).getTime() - 10 * 60_000
    const mesmo = (j: JogadorHenrik, riotId: string | null, puuid: string | null) =>
      (puuid && j.puuid === puuid) || (riotId && `${j.name}#${j.tag}`.toLowerCase() === riotId.toLowerCase())

    for (const p of lista ?? []) {
      if (p.metadata.map?.toLowerCase() !== String(m.map).toLowerCase()) continue
      if (p.metadata.game_start * 1000 < inicio) continue
      const eu = p.players.all_players.find((j) => mesmo(j, capA.riot_id, capA.riot_puuid))
      if (!eu) continue
      const corA = eu.team.toLowerCase()
      const corB = corA === 'red' ? 'blue' : 'red'
      const a = p.teams[corA]?.rounds_won
      const b = p.teams[corB]?.rounds_won
      if (a !== m.score_a || b !== m.score_b) continue

      // É esta: estatísticas de cada um dos nossos jogadores.
      const fb = firstBloods(p)
      const rondas = Math.max(1, p.metadata.rounds_played || a + b)
      const stats = jogadores.flatMap((j) => {
        const perfil = j.profiles as { riot_id: string | null; riot_puuid: string | null }
        const h = p.players.all_players.find((x) => mesmo(x, perfil.riot_id, perfil.riot_puuid))
        if (!h) return []
        return [{
          perfilId: j.profile_id, kills: h.stats.kills, deaths: h.stats.deaths, assists: h.stats.assists,
          acs: Math.round(h.stats.score / rondas), firstBloods: fb.get(h.puuid) ?? 0,
        }]
      })
      const { error } = await db.rpc('aplicar_resultado', { p_match: matchId, p_a: null, p_b: null, p_stats: stats })
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
