/**
 * Peças da máquina de estados que o modo demo e a semente partilham:
 * a escolha dos capitães, o resultado, as estatísticas e os pontos.
 * Tudo puro, com o gerador de aleatórios passado por fora.
 */
import { AGENTES_SIMULADOS } from '../agentes'
import { bonusDesempenho, calcularPontos, rangifyScores } from '../pontos'
import { divisao, mediaDivisoes } from '../ranks'
import type { Equipa, Partida, Perfil } from './tipos'

export type Rng = () => number

/** Gerador determinístico para a semente ser sempre igual. */
export function mulberry32(semente: number): Rng {
  let a = semente >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const entre = (rng: Rng, min: number, max: number) => min + rng() * (max - min)
export const inteiro = (rng: Rng, min: number, max: number) => Math.floor(entre(rng, min, max + 1))
export function escolherUm<T>(rng: Rng, lista: T[]): T {
  return lista[Math.floor(rng() * lista.length)]
}
export function baralhar<T>(rng: Rng, lista: T[]): T[] {
  const r = [...lista]
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[r[i], r[j]] = [r[j], r[i]]
  }
  return r
}

/** O que fica guardado por jogador. O nome e o avatar vêm do perfil atual. */
export interface JogadorGuardado {
  perfilId: string
  /** Tier oficial no momento da partida, que é o que conta para os pontos. */
  tier: number
  equipa: Equipa | null
  capitao: boolean
  aceitou: boolean
  ordemEscolha: number | null
  kills: number | null
  deaths: number | null
  assists: number | null
  acs: number | null
  firstBloods: number | null
  mvp: boolean
  deltaPontos: number | null
  pontosDepois: number | null
  trades?: number | null
  hsPct?: number | null
  kastPct?: number | null
  /** Rangify Score: 100 é a média da partida. */
  rangifyScore?: number | null
  /** A parte dos pontos que veio do desempenho (de -6 a +6). */
  deltaDesempenho?: number | null
  agente?: string | null
}

export type PartidaGuardada = Omit<Partida, 'jogadores' | 'cancelamento'> & { jogadores: JogadorGuardado[]; pontosAplicados?: boolean; votosCancelar?: string[] }

export function novoJogador(p: Perfil): JogadorGuardado {
  return {
    perfilId: p.id, tier: p.tier, equipa: null, capitao: false, aceitou: false, ordemEscolha: null,
    kills: null, deaths: null, assists: null, acs: null, firstBloods: null, mvp: false, deltaPontos: null, pontosDepois: null,
    trades: null, hsPct: null, kastPct: null, rangifyScore: null, deltaDesempenho: null, agente: null,
  }
}

/** Ordena pelo rank oficial (e pelos pontos), para os capitães automáticos escolherem os melhores. */
export function ordenarParaCapitao(jogadores: JogadorGuardado[], perfis: Record<string, Perfil>) {
  return [...jogadores].sort((x, y) => y.tier - x.tier || (perfis[y.perfilId]?.pontos ?? 0) - (perfis[x.perfilId]?.pontos ?? 0))
}

/** Os dois capitães são sorteados entre os 10 (as ferramentas de teste podem obrigar o capitão A). */
export function definirCapitaes(p: PartidaGuardada, forcarA?: string, rng: Rng = Math.random) {
  const sorteio = baralhar(rng, p.jogadores)
  const a = forcarA ? p.jogadores.find((j) => j.perfilId === forcarA)! : sorteio[0]
  const b = sorteio.find((j) => j !== a)!
  a.capitao = true; a.equipa = 'A'
  b.capitao = true; b.equipa = 'B'
  p.capitaoA = a.perfilId
  p.capitaoB = b.perfilId
}

/** Um capitão automático escolhe entre os três melhores disponíveis. */
export function melhorDisponivel(rng: Rng, p: PartidaGuardada, perfis: Record<string, Perfil>): JogadorGuardado | null {
  const livres = ordenarParaCapitao(p.jogadores.filter((j) => !j.equipa), perfis)
  if (!livres.length) return null
  const topo = livres.slice(0, Math.min(3, livres.length))
  const pesos = topo.map((_, i) => [0.6, 0.28, 0.12][i])
  let r = rng() * pesos.reduce((s, x) => s + x, 0)
  for (let i = 0; i < topo.length; i++) { r -= pesos[i]; if (r <= 0) return topo[i] }
  return topo[0]
}

export function escolhidos(p: PartidaGuardada | Partida): number {
  return p.jogadores.filter((j) => j.equipa && !j.capitao).length
}

/** Resultado plausível: a equipa com rank oficial médio mais alto ganha mais vezes. */
export function gerarResultado(rng: Rng, tiersA: number[], tiersB: number[]): { a: number; b: number } {
  const dif = mediaDivisoes(tiersA) - mediaDivisoes(tiersB)
  const probA = 1 / (1 + Math.exp(-dif * 0.32))
  const ganhaA = rng() < probA
  let ven = 13
  let per: number
  if (rng() < 0.14) {
    const extra = rng() < 0.75 ? 0 : rng() < 0.7 ? 1 : 2
    ven = 14 + extra
    per = 12 + extra
  } else {
    per = escolherUm(rng, [3, 5, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 11])
  }
  return ganhaA ? { a: ven, b: per } : { a: per, b: ven }
}

/** KDA, ACS, first bloods e agentes para todos, como se viessem da Henrik Dev API. */
export function gerarEstatisticas(rng: Rng, p: PartidaGuardada, perfis: Record<string, Perfil>) {
  const rondas = (p.resultadoA ?? 13) + (p.resultadoB ?? 0)
  const desvio = Math.floor(rng() * 8)
  // Na mesma equipa, quem tem a mesma função fica com agentes diferentes.
  const usados = new Map<string, number>()
  for (const j of p.jogadores) {
    if (!j.equipa) continue
    const ganhou = j.equipa === p.vencedor
    const funcao = perfis[j.perfilId]?.funcaoJogo
    const acs = Math.round(Math.max(90, entre(rng, 150, 270) + (divisao(j.tier) - 14) * 3 + (ganhou ? 22 : -18) + (funcao === 'Duelista' ? 18 : 0)))
    j.acs = acs
    j.kills = Math.max(1, Math.round(rondas * (acs / 265) * entre(rng, 0.68, 0.86)))
    j.deaths = Math.max(2, Math.round(rondas * entre(rng, ganhou ? 0.5 : 0.62, ganhou ? 0.74 : 0.86)))
    j.assists = Math.round(rondas * entre(rng, funcao === 'Iniciador' || funcao === 'Controlador' ? 0.22 : 0.1, 0.42))
    j.firstBloods = Math.round(rondas * entre(rng, 0, funcao === 'Duelista' ? 0.2 : 0.09))
    j.trades = Math.round(rondas * entre(rng, 0.03, 0.15))
    j.hsPct = Math.min(45, Math.round(entre(rng, 13, 27) + Math.max(0, acs - 200) / 25))
    j.kastPct = Math.min(95, Math.round(entre(rng, ganhou ? 70 : 58, ganhou ? 88 : 76)))
    const pool = AGENTES_SIMULADOS[funcao ?? 'outro']
    const k = `${j.equipa}:${funcao ?? 'outro'}`
    const n = (usados.get(k) ?? 0) + 1
    usados.set(k, n)
    j.agente = pool[(desvio + n) % pool.length]
  }
  calcularRangifyScore(p)
}

/** O RS de cada jogador e o MVP (o RS mais alto; desempata o ACS). */
export function calcularRangifyScore(p: PartidaGuardada) {
  const rondas = (p.resultadoA ?? 13) + (p.resultadoB ?? 0)
  const lista = p.jogadores.filter((j) => j.equipa)
  const rs = rangifyScores(lista, rondas)
  let melhor: JogadorGuardado | null = null
  for (const [i, j] of lista.entries()) {
    const v = rs[i]
    j.rangifyScore = v
    j.mvp = false
    if (v != null && (!melhor || v > (melhor.rangifyScore ?? 0) || (v === melhor.rangifyScore && (j.acs ?? 0) > (melhor.acs ?? 0)))) melhor = j
  }
  if (melhor) melhor.mvp = true
  p.estatisticas = rs.some((x) => x != null)
}

/** Fecha a partida: vencedor, pontos de cada jogador e vitórias/derrotas. */
export function aplicarResultado(p: PartidaGuardada, perfis: Record<string, Perfil>, a: number, b: number, agora: string) {
  p.resultadoA = a
  p.resultadoB = b
  p.vencedor = a > b ? 'A' : 'B'
  for (const j of p.jogadores) {
    if (!j.equipa) continue
    const venceu = j.equipa === p.vencedor
    const r = calcularPontos(venceu, a, b)
    const perf = bonusDesempenho(j.rangifyScore)
    j.deltaDesempenho = j.rangifyScore != null ? perf : null
    j.deltaPontos = r.total + perf
    const perfil = perfis[j.perfilId]
    if (!perfil) continue
    // Todas as partidas contam, também as de teste: remover a partida devolve tudo. Vão para a tabela da fila onde se jogou.
    if (p.fila === 'ranked') {
      perfil.pontosRanked += j.deltaPontos
      if (venceu) perfil.vitoriasRanked++
      else perfil.derrotasRanked++
      j.pontosDepois = perfil.pontosRanked
    } else {
      perfil.pontos += j.deltaPontos
      if (venceu) perfil.vitorias++
      else perfil.derrotas++
      j.pontosDepois = perfil.pontos
    }
  }
  p.pontosAplicados = true
  p.estado = 'COMPLETED'
  p.terminouEm = agora
  p.atualizadaEm = agora
  p.prazoFase = null
}

export function codigoPartida(rng: Rng): string {
  return `RG-${inteiro(rng, 1000, 9999)}`
}

export function codigoGrupo(rng: Rng): string {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => letras[Math.floor(rng() * letras.length)]).join('')
}
