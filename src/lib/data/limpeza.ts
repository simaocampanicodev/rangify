import { limparTexto } from '../entradas'
import type { Dados } from './tipos'

/** Palavras-passe: o que a pessoa escreveu é o que vale, sem cortar nem mudar nada. */
const SEM_LIMPEZA: ReadonlySet<string> = new Set<keyof Dados>(['entrarComPassword', 'definirPassword'])

/** Limpa os textos, mesmo dentro de objetos e listas simples; ficheiros, funções e o resto passam como estão. */
function limpar(v: unknown): unknown {
  if (typeof v === 'string') return limparTexto(v)
  if (Array.isArray(v)) return v.map(limpar)
  if (v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, limpar(x)]))
  }
  return v
}

/**
 * Uma cópia do adaptador em que tudo o que a pessoa escreve chega limpo (sem caracteres invisíveis, em NFC e sem espaços
 * nas pontas), seja qual for o modo. Uma só tabela de exceções em vez de limpar em cada formulário.
 */
export function comTextoLimpo(adaptador: Dados): Dados {
  const dados = { ...adaptador } as unknown as Record<string, unknown>
  for (const [nome, valor] of Object.entries(dados)) {
    if (typeof valor !== 'function' || SEM_LIMPEZA.has(nome)) continue
    dados[nome] = (...args: unknown[]) => (valor as (...a: unknown[]) => unknown).apply(adaptador, args.map(limpar))
  }
  return dados as unknown as Dados
}
