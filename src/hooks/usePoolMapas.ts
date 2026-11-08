import { dados } from '@/lib/data'
import { useCarregar } from './useCarregar'

/** A rotação de mapas do hub. Quem só a mostra aproveita o que já está em memória; quem a edita vai buscá-la sempre. */
export function usePoolMapas(emMemoria = true) {
  return useCarregar(() => dados.poolMapas(), [], ['staff'], { chave: 'pool_mapas', fresco: emMemoria ? 300_000 : undefined })
}
