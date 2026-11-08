/** Leituras sobre uma partida que várias fases do ecrã precisam. */
import { equipaDoBan, totalBans } from './mapas'
import { l } from '../idioma'
import { equipaDaEscolha } from './regras'
import type { Equipa, JogadorPartida, Partida } from '../data'

export function escolhidos(p: Partida) {
  return p.jogadores.filter((j) => j.equipa && !j.capitao).length
}

/** De que equipa é a vez no draft ou nos bans. */
export function vezDe(p: Partida): Equipa | null {
  if (p.estado === 'DRAFT_PHASE') return equipaDaEscolha(escolhidos(p))
  if (p.estado === 'MAP_BAN' && p.bans.length < totalBans(p.pool)) return equipaDoBan(p.bans.length)
  // Depois do último ban, a equipa que não o fez escolhe o lado.
  if (p.estado === 'MAP_BAN' && p.lado && !p.lado.escolha) return p.lado.equipa
  return null
}

export function capitao(p: Partida, eq: Equipa): JogadorPartida | undefined {
  return p.jogadores.find((j) => j.perfilId === (eq === 'A' ? p.capitaoA : p.capitaoB))
}

export function equipa(p: Partida, eq: Equipa): JogadorPartida[] {
  return p.jogadores
    .filter((j) => j.equipa === eq)
    .sort((x, y) => Number(y.capitao) - Number(x.capitao) || (x.ordemEscolha ?? 0) - (y.ordemEscolha ?? 0))
}

export function minhaEquipa(p: Partida, perfilId: string | undefined): Equipa | null {
  return p.jogadores.find((j) => j.perfilId === perfilId)?.equipa ?? null
}

export function souCapitao(p: Partida, perfilId: string | undefined): Equipa | null {
  if (!perfilId) return null
  if (p.capitaoA === perfilId) return 'A'
  if (p.capitaoB === perfilId) return 'B'
  return null
}

export function nomeJogador(j: { riotId: string | null; utilizador: string }) {
  return j.riotId?.split('#')[0] ?? j.utilizador
}

export function tagJogador(j: { riotId: string | null }) {
  const t = j.riotId?.split('#')[1]
  return t ? `#${t}` : ''
}

/** /perfil/Nyx-4521: o último hífen separa o nome da tag. */
export function caminhoPerfil(riotId: string | null | undefined) {
  if (!riotId) return '/perfil'
  const [nome, tag] = riotId.split('#')
  return `/perfil/${encodeURIComponent(nome)}-${encodeURIComponent(tag)}`
}

export function riotIdDoCaminho(parte: string) {
  const d = decodeURIComponent(parte)
  const i = d.lastIndexOf('-')
  return i > 0 ? `${d.slice(0, i)}#${d.slice(i + 1)}` : d
}

/** O lado em que uma equipa começou (quem não escolheu fica com o outro). */
export function ladoInicial(p: Partida, eq: Equipa): 'ataque' | 'defesa' | null {
  const e = p.lado?.escolha
  if (!p.lado || !e) return null
  if (eq === p.lado.equipa) return e
  return e === 'ataque' ? 'defesa' : 'ataque'
}

/** Quanto durou (ou dura) a partida, em minutos inteiros e pelo menos 1; null se ainda não começou. */
export function minutos(p: Partida) {
  if (!p.comecouEm) return null
  const fim = p.terminouEm ? new Date(p.terminouEm).getTime() : Date.now()
  return Math.max(1, Math.round((fim - new Date(p.comecouEm).getTime()) / 60_000))
}

export const nomeLado = (lado: 'ataque' | 'defesa') => (lado === 'ataque' ? l('Ataque', 'Attack') : l('Defesa', 'Defence'))

/** A cor de cada equipa: laranja a A, marfim a B (as do tema). Uma para classes de texto, outra para estilos e SVG. */
export const TEXTO_EQUIPA: Record<Equipa, string> = { A: 'text-laranja', B: 'text-marfim' }
export const COR_EQUIPA: Record<Equipa, string> = { A: 'var(--color-laranja)', B: 'var(--color-marfim)' }
