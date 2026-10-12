/** Regras das partidas e do resultado. */

/** Segundos para aceitar a partida (READY_CHECK). */
export const SEGUNDOS_CONFIRMAR = 20
/** Segundos por escolha no draft. */
export const SEGUNDOS_ESCOLHA = 30
/** Segundos por ban de mapa. */
export const SEGUNDOS_BAN = 20
/** Bloqueio depois de partilhar o código (PRD, estado 6). */
export const MINUTOS_BLOQUEIO = 15
/** Cooldown para quem recusa ou não aceita a tempo. */
export const MINUTOS_COOLDOWN = 5
/** Intervalo mínimo entre sincronizações do rank oficial (PRD, secção 4). */
export const HORAS_CACHE_RANK = 6

/** Ordem do draft: alternada, como no PRD (Capitão A, Capitão B, ...). */
export function equipaDaEscolha(n: number): 'A' | 'B' {
  return n % 2 === 0 ? 'A' : 'B'
}

/** Os códigos de grupo do Valorant têm 6 letras ou números. */
export const PADRAO_CODIGO = /^[A-Z0-9]{6}$/

export function limparCodigo(v: string): string {
  return v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
}

/** Riot ID no formato Nome#TAG (3 a 16 caracteres no nome, 3 a 5 na tag). */
export const PADRAO_RIOT_ID = /^[^#]{3,16}#[A-Za-z0-9]{3,5}$/

export interface Validacao { ok: boolean; titulo: string; detalhe: string }

/**
 * Um resultado de Valorant é válido quando uma equipa chega a 13 com 11 ou
 * menos do outro lado, ou, no prolongamento (a partir de 12-12), quando a
 * diferença final é de 2 rondas.
 */
export function validarResultado(a: number, b: number): Validacao {
  const hi = Math.max(a, b)
  const lo = Math.min(a, b)
  const vence = `Vitória da Equipa ${a > b ? 'A' : 'B'}, ${a}-${b}`
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) {
    return { ok: false, titulo: 'Valores inválidos', detalhe: 'As rondas são números inteiros.' }
  }
  if (a === b) return { ok: false, titulo: 'Empates não existem', detalhe: 'Uma das equipas tem de ganhar a partida.' }
  if (hi < 13) return { ok: false, titulo: 'Falta chegar às 13 rondas', detalhe: 'A equipa vencedora tem de ganhar 13 rondas.' }
  if (hi === 13 && lo <= 11) return { ok: true, titulo: vence, detalhe: 'Resultado válido.' }
  if (hi === 13 && lo === 12) return { ok: false, titulo: 'Com 12-12 há prolongamento', detalhe: 'Ganha quem fizer 2 rondas de vantagem, por exemplo 14-12.' }
  if (lo >= 12 && hi - lo === 2) return { ok: true, titulo: vence, detalhe: 'Resultado com prolongamento.' }
  if (lo < 12) return { ok: false, titulo: 'Resultado impossível', detalhe: 'Acima de 13 rondas só acontece no prolongamento, depois de 12-12.' }
  return { ok: false, titulo: 'Diferença errada no prolongamento', detalhe: 'No prolongamento o resultado final tem 2 rondas de diferença.' }
}

export const ESTADOS_ATIVOS = ['READY_CHECK', 'DRAFT_PHASE', 'MAP_BAN', 'LOBBY_CREATION', 'IN_PROGRESS', 'RESULT_SUBMISSION', 'DISPUTE', 'PROCESSING_API'] as const

export const NOMES_ESTADO: Record<string, string> = {
  READY_CHECK: 'Confirmação',
  DRAFT_PHASE: 'Draft',
  MAP_BAN: 'Ban de mapas',
  LOBBY_CREATION: 'Código do grupo',
  IN_PROGRESS: 'Em jogo',
  RESULT_SUBMISSION: 'Resultado',
  DISPUTE: 'Disputa',
  PROCESSING_API: 'Processamento',
  COMPLETED: 'Terminada',
  CANCELLED: 'Cancelada',
}
