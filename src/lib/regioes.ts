import type { Regiao } from './data'
import { l } from './idioma'

const regiao = (valor: Regiao, pt: string, en: string) => ({ valor, get nome() { return l(pt, en) } })

export const REGIOES: { valor: Regiao; nome: string }[] = [
  regiao('eu', 'Europa', 'Europe'), regiao('na', 'América do Norte', 'North America'), regiao('br', 'Brasil', 'Brazil'),
  regiao('latam', 'América Latina', 'Latin America'), regiao('ap', 'Ásia-Pacífico', 'Asia-Pacific'), regiao('kr', 'Coreia', 'Korea'),
]

export function nomeRegiao(r: Regiao) {
  return REGIOES.find((x) => x.valor === r)?.nome ?? r.toUpperCase()
}
