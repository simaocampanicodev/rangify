import { useAcaoOcupada } from '@/contexts/Avisos'
import { usePartida } from '@/contexts/Partida'
import { dados, type FilaTipo } from '@/lib/data'

/** Entrar e sair da fila, partilhado pelo Dashboard, pela página Jogar e pela faixa do topo. */
export function useFila() {
  const { fila, atualizar } = usePartida()
  const { ocupado, correr } = useAcaoOcupada(atualizar)

  /** Sem `tipo`, sai da fila onde estás. Com `tipo`, entra nessa fila (ou sai dela, se já lá estás). */
  const alternar = async (tipo?: FilaTipo) => {
    const sair = !!fila?.naFila && (!tipo || fila.fila === tipo)
    await correr(() => (sair ? dados.sairFila() : dados.entrarFila(tipo ?? 'aberta')))
  }

  return { fila, ocupado, alternar }
}
