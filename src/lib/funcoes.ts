import { l } from './idioma'
import type { Funcao } from './data/tipos'

/** As funções da conta, da mais alta para a mais baixa. O servidor usa a mesma ordem para saber quem pode punir quem. */
export const FUNCOES_CONTA: Funcao[] = ['owner', 'dev', 'mod', 'verified', 'user']

export const nivelFuncao = (f: Funcao) => FUNCOES_CONTA.length - 1 - FUNCOES_CONTA.indexOf(f)

export const eOwnerDev = (f: Funcao | null | undefined) => f === 'owner' || f === 'dev'
export const eStaff = (f: Funcao | null | undefined) => eOwnerDev(f) || f === 'mod'

export function nomeFuncaoConta(f: Funcao): string {
  if (f === 'verified') return l('Verificado', 'Verified')
  if (f === 'user') return l('Jogador', 'Player')
  return f === 'owner' ? 'Owner' : f === 'dev' ? 'Dev' : 'Mod'
}
