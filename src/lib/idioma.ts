/**
 * Língua do site: português (de origem) ou inglês. Cada texto da interface é
 * escrito nas duas línguas lado a lado, com l('Jogar', 'Play'), para nunca
 * ficarem fora de sincronia. A escolha fica guardada no browser; ao mudar, a
 * aplicação volta a desenhar-se toda (ver main.tsx).
 */
import { useSyncExternalStore } from 'react'
import { armazemLocal } from './armazem'

export type Idioma = 'pt' | 'en'

const CHAVE = 'rangify:idioma'
const ouvintes = new Set<() => void>()

function ler(): Idioma {
  return armazemLocal.ler(CHAVE) === 'en' ? 'en' : 'pt'
}

let atual: Idioma = ler()
if (typeof document !== 'undefined') document.documentElement.lang = atual === 'en' ? 'en' : 'pt-PT'

export const emIngles = () => atual === 'en'

/** O texto na língua escolhida. */
export function l(pt: string, en: string): string {
  return atual === 'en' ? en : pt
}

export function mudarIdioma(novo: Idioma) {
  if (novo === atual) return
  atual = novo
  armazemLocal.escrever(CHAVE, novo)
  document.documentElement.lang = novo === 'en' ? 'en' : 'pt-PT'
  ouvintes.forEach((f) => f())
}

export function useIdioma(): Idioma {
  return useSyncExternalStore(
    (f) => { ouvintes.add(f); return () => { ouvintes.delete(f) } },
    () => atual,
  )
}

/** As funções de jogo do Valorant (guardadas em português). */
const FUNCOES_EN: Record<string, string> = { Duelista: 'Duelist', Controlador: 'Controller', Iniciador: 'Initiator', Sentinela: 'Sentinel' }
export const nomeFuncaoJogo = (f: string) => (atual === 'en' ? FUNCOES_EN[f] ?? f : f)

/** Locale para datas e números. */
export const locale = () => (atual === 'en' ? 'en-GB' : 'pt-PT')
