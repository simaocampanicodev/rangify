/**
 * Ranks oficiais da Riot. A Henrik Dev API devolve o "currenttier":
 * 0 = sem rank, 3 = Ferro 1, ..., 26 = Imortal 3, 27 = Radiante.
 * A "divisão" é o mesmo número a começar em 1, que é o que entra nas contas.
 */

const NOMES = ['Ferro', 'Bronze', 'Prata', 'Ouro', 'Platina', 'Diamante', 'Ascendente', 'Imortal']
const CORES = ['#9a9a9a', '#c08a5a', '#c9d2d8', '#f2c14e', '#4fc6d6', '#c58cff', '#3ed38a', '#ff4d6a']

/** Quem ainda não tem rank conta como Prata 3 nas contas do desnível. */
export const DIVISAO_SEM_RANK = 9

export function divisao(tier: number): number {
  return tier >= 3 ? Math.min(25, tier - 2) : DIVISAO_SEM_RANK
}

export function tierDeDivisao(div: number): number {
  return Math.max(3, Math.min(27, Math.round(div) + 2))
}

export function nomeRank(tier: number): string {
  if (tier >= 27) return 'Radiante'
  if (tier < 3) return 'Sem rank'
  const i = Math.floor((tier - 3) / 3)
  return `${NOMES[i]} ${((tier - 3) % 3) + 1}`
}

export function corRank(tier: number): string {
  if (tier >= 27) return '#ffe08a'
  if (tier < 3) return '#6f6a64'
  return CORES[Math.floor((tier - 3) / 3)]
}

export function siglaRank(tier: number): string {
  if (tier >= 27) return 'RAD'
  if (tier < 3) return '-'
  const i = Math.floor((tier - 3) / 3)
  return `${['FER', 'BRO', 'PRA', 'OUR', 'PLA', 'DIA', 'ASC', 'IMO'][i]}${((tier - 3) % 3) + 1}`
}

export function nomeDivisao(div: number): string {
  return nomeRank(tierDeDivisao(div))
}

export function mediaDivisoes(tiers: number[]): number {
  if (!tiers.length) return DIVISAO_SEM_RANK
  return tiers.reduce((s, t) => s + divisao(t), 0) / tiers.length
}

/** O tier que corresponde à média das divisões, para mostrar "média Diamante 3". */
export function tierMedio(tiers: number[]): number {
  return tierDeDivisao(mediaDivisoes(tiers))
}

/** Mapeia o nome em inglês da Henrik ("Diamond 2") para o tier. */
export function tierDeNomeIngles(nome: string | null | undefined): number {
  if (!nome) return 0
  const n = nome.toLowerCase()
  if (n.startsWith('radiant')) return 27
  const ingles = ['iron', 'bronze', 'silver', 'gold', 'platinum', 'diamond', 'ascendant', 'immortal']
  const i = ingles.findIndex((x) => n.startsWith(x))
  if (i < 0) return 0
  const nivel = Number(n.split(' ')[1] ?? 1) || 1
  return 3 + i * 3 + (nivel - 1)
}
