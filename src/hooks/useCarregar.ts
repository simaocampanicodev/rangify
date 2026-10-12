import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react'
import { aoMudarDados, type Mudanca } from '@/lib/dados'

const espera = (ms: number) => new Promise((r) => window.setTimeout(r, ms))

/**
 * Carrega dados assíncronos e volta a carregar quando as dependências mudam
 * ou quando chega um aviso de mudança dos tipos indicados (aí em silêncio).
 * "minimo" mantém o esqueleto visível um instante, para a entrada ser suave
 * em vez de um salto.
 */
export function useCarregar<T>(f: () => Promise<T>, deps: DependencyList, ouvir: Mudanca[] = [], opcoes: { minimo?: number } = {}) {
  const [valor, setValor] = useState<T | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const pedido = useRef(0)
  const minimo = opcoes.minimo ?? 0

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const correr = useCallback(f, deps)

  const carregar = useCallback(async (silencioso: boolean) => {
    const n = ++pedido.current
    const inicio = Date.now()
    try {
      const v = await correr()
      if (!silencioso && minimo) await espera(Math.max(0, minimo - (Date.now() - inicio)))
      if (n === pedido.current) { setValor(v); setErro(null) }
    } catch (e) {
      if (n === pedido.current) setErro(e instanceof Error ? e.message : 'Não foi possível carregar.')
    } finally {
      if (n === pedido.current) setCarregando(false)
    }
  }, [correr, minimo])

  useEffect(() => {
    setCarregando(true)
    carregar(false)
  }, [carregar])

  const recarregar = useCallback(() => carregar(true), [carregar])

  const chave = ouvir.join(',')
  useEffect(() => {
    if (!chave) return
    const tipos = chave.split(',')
    return aoMudarDados((o) => { if (tipos.includes(o)) recarregar() })
  }, [chave, recarregar])

  return { valor, erro, carregando, recarregar, setValor }
}
