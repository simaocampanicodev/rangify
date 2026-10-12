import type { Regiao } from './dados'

export const REGIOES: { valor: Regiao; nome: string }[] = [
  { valor: 'eu', nome: 'Europa' }, { valor: 'na', nome: 'América do Norte' }, { valor: 'br', nome: 'Brasil' },
  { valor: 'latam', nome: 'América Latina' }, { valor: 'ap', nome: 'Ásia-Pacífico' }, { valor: 'kr', nome: 'Coreia' },
]

export function nomeRegiao(r: Regiao) {
  return REGIOES.find((x) => x.valor === r)?.nome ?? r.toUpperCase()
}
