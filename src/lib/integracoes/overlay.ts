/**
 * O contrato do endereço do overlay do OBS: a página Divulgar escreve as opções, a página Overlay lê-as.
 * /overlay/<chave>?estilo=barra&cor=azul&mostrar=rank,hoje&escala=120&fila=ranked (o que não se percebe fica no padrão).
 */
import type { FilaTipo } from '../data/tipos'

export const CORES_OVERLAY: { id: string; hex: string; nome: [string, string] }[] = [
  { id: 'laranja', hex: '#ff5b1f', nome: ['Laranja', 'Orange'] },
  { id: 'azul', hex: '#3b9eff', nome: ['Azul', 'Blue'] },
  { id: 'verde', hex: '#3ddc97', nome: ['Verde', 'Green'] },
  { id: 'rosa', hex: '#ff5c9d', nome: ['Rosa', 'Pink'] },
  { id: 'roxo', hex: '#9146ff', nome: ['Roxo', 'Purple'] },
  { id: 'ouro', hex: '#f2c14e', nome: ['Ouro', 'Gold'] },
  { id: 'branco', hex: '#f3f0eb', nome: ['Branco', 'White'] },
]

export const CAMPOS_OVERLAY: { id: string; nome: [string, string] }[] = [
  { id: 'rank', nome: ['Rank e pontos', 'Rank and points'] },
  { id: 'hoje', nome: ['O dia (V, D, pontos)', 'Today (W, L, points)'] },
  { id: 'estado', nome: ['Fila ou partida', 'Queue or match'] },
  { id: 'ultima', nome: ['Última partida', 'Last match'] },
  { id: 'fim', nome: ['Aviso de fim de partida', 'Match-end banner'] },
]

/** Espaço por cima do cartão ou da barra onde aparece o aviso de fim de partida (58 px de faixa e 8 de folga). */
export const ESPACO_AVISO = 66

export const ESCALA_MIN = 50
export const ESCALA_MAX = 200
const ESCALA_PADRAO = 100

/** O que a página Divulgar deixa escolher (a cor pelo nome, a fila "auto" é a que a pessoa estiver a usar). */
export interface PreferenciasOverlay { estilo: 'cartao' | 'barra'; cor: string; campos: string[]; escala: number; fila: 'auto' | FilaTipo }

export const PREFERENCIAS_PADRAO: PreferenciasOverlay = { estilo: 'cartao', cor: 'laranja', campos: CAMPOS_OVERLAY.map((c) => c.id), escala: ESCALA_PADRAO, fila: 'auto' }

/** O que a página Overlay usa, já lido do endereço (a cor como hex). */
interface OpcoesOverlay { estilo: 'cartao' | 'barra'; cor: string; mostrar: Set<string>; escala: number; fila: FilaTipo | null }

export function lerOpcoes(q: URLSearchParams): OpcoesOverlay {
  const bruta = (q.get('cor') ?? PREFERENCIAS_PADRAO.cor).toLowerCase()
  const porOmissao = CORES_OVERLAY.find((c) => c.id === PREFERENCIAS_PADRAO.cor)!.hex
  const cor = CORES_OVERLAY.find((c) => c.id === bruta)?.hex ?? (/^[0-9a-f]{6}$/.test(bruta) ? `#${bruta}` : porOmissao)
  const todos = CAMPOS_OVERLAY.map((c) => c.id)
  const pedidos = (q.get('mostrar') ?? '').split(',').map((x) => x.trim()).filter((x) => todos.includes(x))
  const escala = Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, Number(q.get('escala')) || ESCALA_PADRAO))
  const fila = q.get('fila') === 'ranked' ? 'ranked' : q.get('fila') === 'aberta' ? 'aberta' : null
  return { estilo: q.get('estilo') === 'barra' ? 'barra' : 'cartao', cor, mostrar: new Set(pedidos.length ? pedidos : todos), escala, fila }
}

/** A parte do endereço que leva as preferências ("" se for tudo o padrão, senão "?estilo=..."). */
export function consultaOverlay(p: PreferenciasOverlay): string {
  const q = new URLSearchParams()
  if (p.estilo !== PREFERENCIAS_PADRAO.estilo) q.set('estilo', p.estilo)
  if (p.cor !== PREFERENCIAS_PADRAO.cor) q.set('cor', p.cor)
  if (p.campos.length !== CAMPOS_OVERLAY.length) q.set('mostrar', p.campos.join(','))
  if (p.escala !== ESCALA_PADRAO) q.set('escala', String(p.escala))
  if (p.fila !== 'auto') q.set('fila', p.fila)
  return q.toString() ? `?${q}` : ''
}

/**
 * O tamanho, em px a 100%, que a página Overlay ocupa no OBS (o cartão ou a barra e, com o aviso de fim de partida
 * ligado, a reserva por cima onde ele aparece). A pré-visualização e a instrução do OBS usam estes números.
 */
export function tamanhoOverlay(estilo: 'cartao' | 'barra', comAviso: boolean): [number, number] {
  const reserva = comAviso ? ESPACO_AVISO : 0
  return estilo === 'barra' ? [1050, 104 + reserva] : [360, 304 + reserva]
}
