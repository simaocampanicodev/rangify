import type { EstadoPartida } from '../data/tipos'

/** O ecrã que desenha cada estado (a página liga cada nome ao seu componente). */
export type Ecra = 'confirmar' | 'draft' | 'mapas' | 'codigo' | 'resultado'

interface DescricaoEstado {
  /** Português e inglês. */
  nome: [string, string]
  /** A partida ainda decorre (conta como "partida em curso"). */
  ativo: boolean
  /** O passo na linha das fases da página Jogar. */
  etapa: number
  ecra: Ecra
}

/** Tudo o que se sabe de cada estado da partida num só sítio. */
export const ESTADOS: Record<EstadoPartida, DescricaoEstado> = {
  READY_CHECK: { nome: ['Confirmação', 'Ready check'], ativo: true, etapa: 0, ecra: 'confirmar' },
  DRAFT_PHASE: { nome: ['Draft', 'Draft'], ativo: true, etapa: 1, ecra: 'draft' },
  MAP_BAN: { nome: ['Ban de mapas', 'Map ban'], ativo: true, etapa: 2, ecra: 'mapas' },
  LOBBY_CREATION: { nome: ['Código do grupo', 'Party code'], ativo: true, etapa: 3, ecra: 'codigo' },
  IN_PROGRESS: { nome: ['Em jogo', 'In game'], ativo: true, etapa: 4, ecra: 'codigo' },
  RESULT_SUBMISSION: { nome: ['Resultado', 'Result'], ativo: true, etapa: 5, ecra: 'resultado' },
  DISPUTE: { nome: ['Disputa', 'Dispute'], ativo: true, etapa: 5, ecra: 'resultado' },
  PROCESSING_API: { nome: ['Processamento', 'Processing'], ativo: true, etapa: 5, ecra: 'resultado' },
  COMPLETED: { nome: ['Terminada', 'Finished'], ativo: false, etapa: 5, ecra: 'resultado' },
  CANCELLED: { nome: ['Cancelada', 'Cancelled'], ativo: false, etapa: -1, ecra: 'resultado' },
}

/** Um estado que o servidor passe a ter antes de o site o conhecer não deve partir o ecrã: tratado como partida acabada. */
const DESCONHECIDO: DescricaoEstado = { nome: ['Desconhecido', 'Unknown'], ativo: false, etapa: -1, ecra: 'resultado' }
export const descricaoEstado = (e: EstadoPartida): DescricaoEstado => ESTADOS[e] ?? DESCONHECIDO

export const estadoAtivo = (e: EstadoPartida) => descricaoEstado(e).ativo
