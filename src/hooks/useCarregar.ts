import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react'
import { aoMudarDados, type Mudanca } from '@/lib/dados'
import { traduzirErro } from '@/lib/erros'

const espera = (ms: number) => new Promise((r) => window.setTimeout(r, ms))

/**
 * Memória dos dados já carregados, para as páginas abrirem logo com a última
 * versão e atualizarem por trás. Só guarda o que tem "chave" e pertence à
 * sessão atual: ao entrar noutra conta, esvazia.
 */
const cache = new Map<string, { valor: unknown; em: number }>()
/** Quantas respostas guarda ao mesmo tempo: as mais antigas saem (cada perfil ou pesquisa visitada é uma chave nova). */
const MAXIMO_GUARDADO = 80
function guardar(chave: string, valor: unknown) {
  cache.delete(chave)
  cache.set(chave, { valor, em: Date.now() })
  if (cache.size > MAXIMO_GUARDADO) cache.delete(cache.keys().next().value!)
}
const aCaminho = new Map<string, Promise<unknown>>()
let dono: string | null = null

export function definirDonoCache(perfilId: string | null) {
  if (perfilId === dono) return
  dono = perfilId
  cache.clear()
  aCaminho.clear()
}

/** Um só pedido para a mesma chave, mesmo que duas partes da página peçam ao mesmo tempo. */
function pedirUmaVez<T>(chave: string | undefined, f: () => Promise<T>): Promise<T> {
  if (!chave) return f()
  const ja = aCaminho.get(chave) as Promise<T> | undefined
  if (ja) return ja
  const p = f().finally(() => aCaminho.delete(chave))
  aCaminho.set(chave, p)
  return p
}

interface Opcoes {
  /** Mantém o esqueleto visível um instante, para a entrada ser suave. */
  minimo?: number
  /** Guarda o resultado em memória com esta chave (inclui nela o que o pedido usa). */
  chave?: string
  /** Com uma versão guardada mais nova do que isto (ms), nem volta a perguntar ao abrir. */
  fresco?: number
}

/**
 * Carrega dados assíncronos e volta a carregar quando as dependências mudam
 * ou quando chega um aviso de mudança dos tipos indicados (aí em silêncio).
 */
export function useCarregar<T>(f: () => Promise<T>, deps: DependencyList, ouvir: Mudanca[] = [], opcoes: Opcoes = {}) {
  const { chave, fresco = 0 } = opcoes
  const guardado = chave ? cache.get(chave) : undefined
  const [valor, setValor] = useState<T | null>(guardado ? (guardado.valor as T) : null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(!guardado)
  const pedido = useRef(0)
  const minimo = opcoes.minimo ?? 0

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const correr = useCallback(f, deps)

  const carregar = useCallback(async (silencioso: boolean) => {
    const n = ++pedido.current
    const inicio = Date.now()
    try {
      const v = await pedirUmaVez(chave, correr)
      if (!silencioso && minimo) await espera(Math.max(0, minimo - (Date.now() - inicio)))
      if (chave) guardar(chave, v)
      if (n === pedido.current) { setValor(v); setErro(null) }
    } catch (e) {
      if (n === pedido.current) setErro(traduzirErro(e instanceof Error ? e.message : 'Não foi possível carregar.'))
    } finally {
      if (n === pedido.current) setCarregando(false)
    }
  }, [correr, minimo, chave])

  useEffect(() => {
    const g = chave ? cache.get(chave) : undefined
    if (g) {
      // Já há uma versão guardada: mostra-a logo e atualiza por trás (se não for fresca).
      setValor(g.valor as T)
      setCarregando(false)
      if (Date.now() - g.em >= fresco) carregar(true)
      return
    }
    setCarregando(true)
    carregar(false)
  }, [carregar, chave, fresco])

  const recarregar = useCallback(() => carregar(true), [carregar])

  const tipos = ouvir.join(',')
  useEffect(() => {
    if (!tipos) return
    const lista = tipos.split(',')
    return aoMudarDados((o) => { if (lista.includes(o)) recarregar() })
  }, [tipos, recarregar])

  return { valor, erro, carregando, recarregar, setValor }
}
