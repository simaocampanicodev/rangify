/** Regras das partidas e do resultado. */
import { l } from './idioma'

/** Segundos para aceitar a partida (READY_CHECK). */
export const SEGUNDOS_CONFIRMAR = 20
/** Segundos por escolha no draft. */
export const SEGUNDOS_ESCOLHA = 30
/** Segundos por ban de mapa (a equipa tem tempo para sugerir ao capitão). */
export const SEGUNDOS_BAN = 60
/** Segundos para escolher o lado, depois do último ban. */
export const SEGUNDOS_LADO = 60
/** Bloqueio depois de partilhar o código (PRD, estado 6). */
export const MINUTOS_BLOQUEIO = 15
/** Cooldown para quem recusa ou não aceita a tempo. */
export const MINUTOS_COOLDOWN = 5
/** Intervalo mínimo entre sincronizações do rank oficial (PRD, secção 4). */
export const HORAS_CACHE_RANK = 6

/**
 * Ordem das 8 escolhas de jogadores depois dos dois capitães já colocados:
 * A, B, B, A, A, B, B, A. O índice é 0-based e não conta os capitães.
 * (Os bans de mapa continuam alternados à vez: A, B, A, B...)
 */
export const ORDEM_DRAFT = 'ABBABAAB'

export function equipaDaEscolha(n: number): 'A' | 'B' {
  return ORDEM_DRAFT[((n % ORDEM_DRAFT.length) + ORDEM_DRAFT.length) % ORDEM_DRAFT.length] as 'A' | 'B'
}

/** Os códigos de grupo do Valorant têm 6 letras ou números. */
export const PADRAO_CODIGO = /^[A-Z0-9]{6}$/

export function limparCodigo(v: string): string {
  return v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
}

/**
 * Riot ID no formato Nome#TAG (3 a 16 caracteres no nome, 3 a 5 na tag). A tag pode ter
 * letras de qualquer alfabeto (a Riot aceita, por exemplo, s3v7n#star惠), por isso não é só A-Z e 0-9.
 */
export const PADRAO_RIOT_ID = /^[^#]{3,16}#[\p{L}\p{N}]{3,5}$/u

export interface Validacao { ok: boolean; titulo: string; detalhe: string }

/**
 * Um resultado de Valorant é válido quando uma equipa chega a 13 com 11 ou
 * menos do outro lado, ou, no prolongamento (a partir de 12-12), quando a
 * diferença final é de 2 rondas.
 */
export function validarResultado(a: number, b: number): Validacao {
  const hi = Math.max(a, b)
  const lo = Math.min(a, b)
  const vence = l(`Vitória da Equipa ${a > b ? 'A' : 'B'}, ${a}-${b}`, `Team ${a > b ? 'A' : 'B'} wins, ${a}-${b}`)
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) {
    return { ok: false, titulo: l('Valores inválidos', 'Invalid values'), detalhe: l('As rondas são números inteiros.', 'Rounds are whole numbers.') }
  }
  if (a === b) return { ok: false, titulo: l('Empates não existem', 'There are no draws'), detalhe: l('Uma das equipas tem de ganhar a partida.', 'One team has to win the match.') }
  if (hi < 13) return { ok: false, titulo: l('Falta chegar às 13 rondas', 'Not at 13 rounds yet'), detalhe: l('A equipa vencedora tem de ganhar 13 rondas.', 'The winning team has to win 13 rounds.') }
  if (hi === 13 && lo <= 11) return { ok: true, titulo: vence, detalhe: l('Resultado válido.', 'Valid result.') }
  if (hi === 13 && lo === 12) return { ok: false, titulo: l('Com 12-12 há prolongamento', 'At 12-12 there is overtime'), detalhe: l('Ganha quem fizer 2 rondas de vantagem, por exemplo 14-12.', 'The first team 2 rounds ahead wins, for example 14-12.') }
  if (lo >= 12 && hi - lo === 2) return { ok: true, titulo: vence, detalhe: l('Resultado com prolongamento.', 'Result with overtime.') }
  if (lo < 12) return { ok: false, titulo: l('Resultado impossível', 'Impossible result'), detalhe: l('Acima de 13 rondas só acontece no prolongamento, depois de 12-12.', 'More than 13 rounds only happens in overtime, after 12-12.') }
  return { ok: false, titulo: l('Diferença errada no prolongamento', 'Wrong overtime difference'), detalhe: l('No prolongamento o resultado final tem 2 rondas de diferença.', 'In overtime the final score has a 2-round difference.') }
}

export const ESTADOS_ATIVOS = ['READY_CHECK', 'DRAFT_PHASE', 'MAP_BAN', 'LOBBY_CREATION', 'IN_PROGRESS', 'RESULT_SUBMISSION', 'DISPUTE', 'PROCESSING_API'] as const

const ESTADOS: Record<string, [string, string]> = {
  READY_CHECK: ['Confirmação', 'Ready check'],
  DRAFT_PHASE: ['Draft', 'Draft'],
  MAP_BAN: ['Ban de mapas', 'Map ban'],
  LOBBY_CREATION: ['Código do grupo', 'Party code'],
  IN_PROGRESS: ['Em jogo', 'In game'],
  RESULT_SUBMISSION: ['Resultado', 'Result'],
  DISPUTE: ['Disputa', 'Dispute'],
  PROCESSING_API: ['Processamento', 'Processing'],
  COMPLETED: ['Terminada', 'Finished'],
  CANCELLED: ['Cancelada', 'Cancelled'],
}

/** O nome de cada estado na língua do site (lido na altura, por isso muda com ela). */
export const NOMES_ESTADO: Record<string, string> = new Proxy({} as Record<string, string>, {
  get: (_, k) => { const e = ESTADOS[k as string]; return e ? l(e[0], e[1]) : undefined },
})
