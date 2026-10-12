import { divisao, mediaDivisoes } from './ranks'

/**
 * O sistema de pontos do Rangify:
 * - toda a gente começa a temporada com 1000;
 * - vitória vale +20, derrota tira 20;
 * - o desnível: o rank oficial do jogador é comparado com a média oficial da
 *   equipa adversária. Cada divisão acima dá +3 (até +10), cada divisão
 *   abaixo tira 3 (até -8). Vale para vitórias e derrotas.
 */
export const PONTOS_INICIAIS = 1000
export const PONTOS_BASE = 20
export const POR_DIVISAO = 3
export const BONUS_MAX = 10
export const BONUS_MIN = -8

export function desnivel(tierJogador: number, tiersAdversarios: number[]): number {
  return Math.round(mediaDivisoes(tiersAdversarios)) - divisao(tierJogador)
}

export function bonusDesnivel(dif: number): number {
  return Math.max(BONUS_MIN, Math.min(BONUS_MAX, POR_DIVISAO * dif))
}

export function calcularPontos(tierJogador: number, tiersAdversarios: number[], venceu: boolean) {
  const dif = desnivel(tierJogador, tiersAdversarios)
  const base = venceu ? PONTOS_BASE : -PONTOS_BASE
  const bonus = bonusDesnivel(dif)
  return { base, bonus, total: base + bonus, dif }
}

/** O que está em jogo para o jogador antes de a partida começar. */
export function emJogo(tierJogador: number, tiersAdversarios: number[]) {
  return {
    vitoria: calcularPontos(tierJogador, tiersAdversarios, true).total,
    derrota: calcularPontos(tierJogador, tiersAdversarios, false).total,
    dif: desnivel(tierJogador, tiersAdversarios),
  }
}

export function comSinal(v: number): string {
  return v > 0 ? `+${v}` : String(v)
}
