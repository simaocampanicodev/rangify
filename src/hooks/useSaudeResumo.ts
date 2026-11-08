import { useSessao } from '@/contexts/Sessao'
import { dados, type SaudeResumo } from '@/lib/data'
import { useCarregar } from './useCarregar'
import { useIntervalo } from './useVisivel'

/**
 * O estado do site para o ponto no menu e para o separador Estado da Staff, de minuto a minuto (só Owner e Dev; para
 * os outros é sempre null e não pergunta nada). A cache é partilhada: o menu e a página não pedem duas vezes.
 */
export function useSaudeResumo(): SaudeResumo | null {
  const { podeTestar } = useSessao()
  const r = useCarregar(() => (podeTestar ? dados.saudeResumo() : Promise.resolve(null)), [podeTestar], ['staff'], { chave: 'saude:resumo', fresco: 30_000 })
  useIntervalo(r.recarregar, podeTestar ? 60_000 : null)
  return podeTestar ? r.valor : null
}
