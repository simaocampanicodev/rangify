// Leitura de uma partida da Henrik Dev API (v3), partilhada por processar-partida
// e testar-api, para o teste mostrar exatamente o que a partida real ia gravar.

export interface JogadorHenrik {
  puuid: string; name: string; tag: string; team: string
  /** O agente (na v3 vem como texto, por exemplo "Jett"). */
  character?: string | { name?: string } | null
  stats: { score: number; kills: number; deaths: number; assists: number; headshots?: number; bodyshots?: number; legshots?: number }
}
export interface MorteHenrik {
  round: number; kill_time_in_round: number; killer_puuid: string; victim_puuid: string
  assistants?: { assistant_puuid: string }[]
}
export interface PartidaHenrik {
  metadata: { matchid?: string; map: string; game_start: number; rounds_played: number; mode?: string }
  players: { all_players: JogadorHenrik[] }
  teams: Record<string, { rounds_won: number | null; rounds_lost: number | null }> | null
  kills?: MorteHenrik[]
  rounds?: { player_stats: { player_puuid: string; kill_events: MorteHenrik[] }[] }[]
}

/** Só as últimas partidas personalizadas: cada partida pedida conta para o limite da chave. */
export const PARTIDAS_A_PEDIR = 3

export const caminhoHistorico = (regiao: string, nome: string, tag: string) =>
  `/valorant/v3/matches/${encodeURIComponent(regiao)}/${encodeURIComponent(nome)}/${encodeURIComponent(tag)}?mode=custom&size=${PARTIDAS_A_PEDIR}`

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
  return { fb, trades, kast, rondas: Math.max(1, rondas), mortes: porRonda.size ? [...porRonda.values()].reduce((t, l) => t + l.length, 0) : 0 }
}

export interface EstatisticasJogador {
  puuid: string; riotId: string; equipa: string; agente: string | null
  kills: number; deaths: number; assists: number; acs: number
  firstBloods: number; trades: number; hsPct: number | null; kastPct: number
}

/** Tudo o que o Rangify tira de uma partida: resultado por cor de equipa e estatísticas por jogador. */
export function lerPartida(p: PartidaHenrik) {
  const equipaDe = new Map(p.players.all_players.map((x) => [x.puuid, x.team.toLowerCase()]))
  const ronda = estatisticasDasRondas(p, equipaDe)
  const red = p.teams?.red?.rounds_won ?? null
  const blue = p.teams?.blue?.rounds_won ?? null
  const rondas = Math.max(1, p.metadata.rounds_played || (red ?? 0) + (blue ?? 0), ronda.rondas)
  const jogadores: EstatisticasJogador[] = p.players.all_players.map((h) => {
    const tiros = (h.stats.headshots ?? 0) + (h.stats.bodyshots ?? 0) + (h.stats.legshots ?? 0)
    return {
      puuid: h.puuid, riotId: `${h.name}#${h.tag}`, equipa: h.team.toLowerCase(),
      agente: (typeof h.character === 'string' ? h.character : h.character?.name) || null,
      kills: h.stats.kills, deaths: h.stats.deaths, assists: h.stats.assists,
      acs: Math.round(h.stats.score / rondas), firstBloods: ronda.fb.get(h.puuid) ?? 0,
      trades: ronda.trades.get(h.puuid) ?? 0,
      hsPct: tiros ? Math.round(((h.stats.headshots ?? 0) / tiros) * 100) : null,
      kastPct: Math.round(((ronda.kast.get(h.puuid) ?? 0) / rondas) * 100),
    }
  })
  return { rondas, rondasPorCor: { red, blue }, jogadores, mortes: ronda.mortes }
}

export const mesmoJogador = (j: { puuid: string; riotId: string }, riotId: string | null, puuid: string | null) =>
  (!!puuid && j.puuid === puuid) || (!!riotId && j.riotId.toLowerCase() === riotId.toLowerCase())
