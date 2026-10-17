// O rank oficial de cada jogador, atualizado quando uma partida fecha.
//
// Antes, o rank só mudava se o jogador fosse ao perfil e carregasse em "Sincronizar", e quem
// tinha descido (por exemplo, com a reposição de um ato) nunca o fazia. Agora, cada partida que
// a Henrik Dev API fecha refresca o rank dos dez jogadores, tenha subido ou descido.
import { ErroHenrik, admin, partirRiotId, rankOficial } from './comum.ts'

/** A chave básica da Henrik dá 30 pedidos por minuto: um a cada 2 s não a esgota nem com a consulta da partida. */
const PAUSA_MS = 2100

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface JogadorRank {
  profile_id: string
  profiles: { riot_id: string | null; region: string; official_tier: number; is_bot: boolean } | null
}

export interface ResultadoRanks {
  atualizados: number
  falhas: number
}

/**
 * Lê na Henrik o rank atual de cada jogador humano da partida e grava-o no perfil (ignora a cache de
 * 6 horas do botão do perfil). Uma falha num jogador é registada e os outros seguem: o rank nunca
 * pode impedir nem atrasar o fecho de uma partida, por isso quem chama não deve esperar por isto.
 */
export async function atualizarRanksDaPartida(db: ReturnType<typeof admin>, matchId: string): Promise<ResultadoRanks> {
  const { data } = await db.from('match_players')
    .select('profile_id, profiles(riot_id, region, official_tier, is_bot)')
    .eq('match_id', matchId)
  const jogadores = ((data ?? []) as unknown as JogadorRank[]).filter((j) => j.profiles && !j.profiles.is_bot && j.profiles.riot_id)
  const r: ResultadoRanks = { atualizados: 0, falhas: 0 }

  for (const [i, j] of jogadores.entries()) {
    if (i > 0) await dormir(PAUSA_MS)
    const p = j.profiles!
    try {
      const { nome, tag } = partirRiotId(p.riot_id!)
      const rank = await rankOficial(p.region, nome, tag).catch(async (e) => {
        // Limite de pedidos: espera um pouco mais e tenta uma vez.
        if (e instanceof ErroHenrik && e.estado === 429) { await dormir(8000); return rankOficial(p.region, nome, tag) }
        throw e
      })
      // A API sem rank (0) para quem já tinha um é, quase de certeza, um soluço dela (quem desce de ato
      // continua com rank): nesse caso mantém o que lá estava em vez de apagar um rank real.
      const campos: Record<string, unknown> = { rank_synced_at: new Date().toISOString() }
      if (rank.tier > 0 || p.official_tier === 0) { campos.official_tier = rank.tier; campos.official_rr = rank.rr }
      const { error } = await db.from('profiles').update(campos).eq('id', j.profile_id)
      if (error) throw new Error(error.message)
      r.atualizados++
    } catch (e) {
      r.falhas++
      console.error(`rank de ${p.riot_id}:`, e instanceof Error ? e.message : e)
    }
  }
  return r
}
