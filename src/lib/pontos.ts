/**
 * O sistema de pontos do Rangify:
 * - toda a gente começa a temporada com 1000;
 * - vitória vale +20, derrota tira 20;
 * - o desempenho: o Rangify Score (RS) da partida dá de -6 a +6 (ver rangifyScores).
 * O rank oficial da Riot não entra nas contas: só se avalia o que se joga.
 */
export const PONTOS_INICIAIS = 1000
export const PONTOS_BASE = 20

/** Os pontos do resultado (sem o desempenho, que só se sabe com as estatísticas). */
export function calcularPontos(venceu: boolean) {
  const base = venceu ? PONTOS_BASE : -PONTOS_BASE
  return { base, total: base }
}

/** O que está em jogo antes de a partida começar, sem o desempenho. */
export function emJogo() {
  return { vitoria: PONTOS_BASE, derrota: -PONTOS_BASE }
}

export function comSinal(v: number): string {
  return v > 0 ? `+${v}` : String(v)
}

/**
 * Rangify Score (RS): a nota de desempenho numa partida. Cada métrica é comparada
 * com a média dos jogadores dessa partida (entre 0,25x e 2x) e depois pesada:
 * ACS 35%, KDA 25%, KAST 25% e trades por ronda 15%. 100 é a média da partida.
 * É a mesma conta que a base de dados faz em _rangify_scores.
 */
export const PESOS_RS = { acs: 0.35, kda: 0.25, kast: 0.25, trades: 0.15 } as const
export const DESEMPENHO_MAX = 6
export const RS_POR_PONTO = 6

export interface LinhaRs {
  acs: number | null
  kills: number | null
  deaths: number | null
  assists: number | null
  kastPct?: number | null
  trades?: number | null
}

const mediaDe = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null)
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null
}

/** O RS de cada jogador, pela mesma ordem; null para quem não tem estatísticas. */
export function rangifyScores(jogadores: LinhaRs[], rondas: number): (number | null)[] {
  const base = jogadores.map((j) => j.acs == null ? null : {
    acs: j.acs,
    kda: ((j.kills ?? 0) + (j.assists ?? 0)) / Math.max(1, j.deaths ?? 0),
    kast: j.kastPct ?? null,
    trades: j.trades != null ? j.trades / Math.max(1, rondas) : null,
  })
  const com = base.filter((b) => b != null)
  const med = {
    acs: mediaDe(com.map((b) => b.acs)), kda: mediaDe(com.map((b) => b.kda)),
    kast: mediaDe(com.map((b) => b.kast)), trades: mediaDe(com.map((b) => b.trades)),
  }
  const razao = (x: number | null, m: number | null) => (x == null || m == null || m <= 0 ? null : Math.min(2, Math.max(0.25, x / m)))
  return base.map((b) => {
    if (!b) return null
    let soma = 0
    let peso = 0
    for (const k of ['acs', 'kda', 'kast', 'trades'] as const) {
      const r = razao(b[k], med[k])
      if (r != null) { soma += r * PESOS_RS[k]; peso += PESOS_RS[k] }
    }
    return peso ? Math.round((100 * soma) / peso) : null
  })
}

/** Pontos de desempenho: um por cada 6 de RS acima ou abaixo de 100, entre -6 e +6. */
export function bonusDesempenho(rs: number | null | undefined): number {
  if (rs == null) return 0
  const x = (rs - 100) / RS_POR_PONTO
  // Arredonda como o Postgres (metades para longe do zero).
  const r = Math.sign(x) * Math.round(Math.abs(x))
  return Math.max(-DESEMPENHO_MAX, Math.min(DESEMPENHO_MAX, r)) || 0
}
