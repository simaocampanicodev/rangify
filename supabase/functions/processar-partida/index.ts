// Estado 8 do PRD (PROCESSING_API): procura a partida personalizada no
// histórico do Capitão A na Henrik Dev API, confirma o mapa e o resultado,
// tira KDA, ACS, first bloods, trades, HS% e KAST de cada jogador e fecha a partida com
// aplicar_resultado. Se ainda não aparecer, devolve { pendente: true } e o
// site volta a pedir; ao fim de 15 minutos a base de dados fecha sem estatísticas.
import { ErroHenrik, admin, cors, enc, erro, henrik, partirRiotId, resposta, utilizador } from '../_shared/comum.ts'

interface JogadorHenrik {
  puuid: string; name: string; tag: string; team: string
  stats: { score: number; kills: number; deaths: number; assists: number; headshots?: number; bodyshots?: number; legshots?: number }
}
interface MorteHenrik {
  round: number; kill_time_in_round: number; killer_puuid: string; victim_puuid: string
  assistants?: { assistant_puuid: string }[]
}
interface PartidaHenrik {
  metadata: { map: string; game_start: number; rounds_played: number; mode?: string }
  players: { all_players: JogadorHenrik[] }
  teams: Record<string, { rounds_won: number; rounds_lost: number }>
  kills?: MorteHenrik[]
  rounds?: { player_stats: { player_puuid: string; kill_events: MorteHenrik[] }[] }[]
}

/** Uma troca vale se o assassino do colega morrer até 5 segundos depois. */
const JANELA_TROCA_MS = 5000

function mortes(p: PartidaHenrik): MorteHenrik[] {
  return p.kills ?? (p.rounds ?? []).flatMap((r, i) => r.player_stats.flatMap((s) => s.kill_events.map((k) => ({ ...k, round: i }))))
}

/**
 * First bloods, trades e KAST de cada jogador, a partir das mortes ronda a ronda.
 * - First blood: a primeira morte da ronda.
 * - Trade: matas quem matou um colega teu há menos de 5 s.
 * - KAST: rondas em que tiveste kill, assistência, sobreviveste ou foste trocado.
 */
function estatisticasDasRondas(p: PartidaHenrik, equipaDe: Map<string, string>) {
  const fb = new Map<string, number>()
  const trades = new Map<string, number>()
  const kast = new Map<string, number>()
  const soma = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1)
  const porRonda = new Map<number, MorteHenrik[]>()
  for (const k of mortes(p)) porRonda.set(k.round, [...(porRonda.get(k.round) ?? []), k])
  const rondas = Math.max(p.metadata.rounds_played || 0, porRonda.size)
  // As rondas vêm numeradas a partir de 0; se a API as numerar a partir de 1, desloca.
  const base = porRonda.size && !porRonda.has(0) && Math.min(...porRonda.keys()) === 1 ? 1 : 0

  for (let r = base; r < rondas + base; r++) {
    const lista = [...(porRonda.get(r) ?? [])].sort((a, b) => a.kill_time_in_round - b.kill_time_in_round)
    if (lista[0]) soma(fb, lista[0].killer_puuid)
    const contribuiu = new Set<string>()
    const morreu = new Set<string>()
    for (const [i, k] of lista.entries()) {
      contribuiu.add(k.killer_puuid)
      for (const a of k.assistants ?? []) contribuiu.add(a.assistant_puuid)
      morreu.add(k.victim_puuid)
      // A vítima desta morte tinha matado um colega do assassino há pouco? Então é uma troca.
      const trocou = lista.slice(0, i).some((ant) =>
        ant.killer_puuid === k.victim_puuid
        && equipaDe.get(ant.victim_puuid) === equipaDe.get(k.killer_puuid)
        && k.kill_time_in_round - ant.kill_time_in_round <= JANELA_TROCA_MS)
      if (trocou) {
        soma(trades, k.killer_puuid)
        // E o colega que morreu antes foi trocado, o que também conta para o KAST dele.
        for (const ant of lista.slice(0, i)) {
          if (ant.killer_puuid === k.victim_puuid && k.kill_time_in_round - ant.kill_time_in_round <= JANELA_TROCA_MS) contribuiu.add(ant.victim_puuid)
        }
      }
    }
    for (const puuid of equipaDe.keys()) if (contribuiu.has(puuid) || !morreu.has(puuid)) soma(kast, puuid)
  }
  return { fb, trades, kast, rondas: Math.max(1, rondas) }
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
      const equipaDe = new Map(p.players.all_players.map((x) => [x.puuid, x.team.toLowerCase()]))
      const ronda = estatisticasDasRondas(p, equipaDe)
      const rondas = Math.max(1, p.metadata.rounds_played || a + b, ronda.rondas)
      const stats = jogadores.flatMap((j) => {
        const perfil = j.profiles as { riot_id: string | null; riot_puuid: string | null }
        const h = p.players.all_players.find((x) => mesmo(x, perfil.riot_id, perfil.riot_puuid))
        if (!h) return []
        const tiros = (h.stats.headshots ?? 0) + (h.stats.bodyshots ?? 0) + (h.stats.legshots ?? 0)
        return [{
          perfilId: j.profile_id, kills: h.stats.kills, deaths: h.stats.deaths, assists: h.stats.assists,
          acs: Math.round(h.stats.score / rondas), firstBloods: ronda.fb.get(h.puuid) ?? 0,
          trades: ronda.trades.get(h.puuid) ?? 0,
          hsPct: tiros ? Math.round(((h.stats.headshots ?? 0) / tiros) * 100) : null,
          kastPct: Math.round(((ronda.kast.get(h.puuid) ?? 0) / rondas) * 100),
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
