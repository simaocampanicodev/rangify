import { useState } from 'react'
import { useAcao } from '@/contexts/Avisos'
import { usePartida } from '@/contexts/Partida'
import { dados, type FilaTipo } from '@/lib/data'

/** Entrar e sair da fila, partilhado pelo Dashboard, pela página Jogar e pela faixa do topo. */
export function useFila() {
  const { fila, atualizar } = usePartida()
  const acao = useAcao()
  const [ocupado, setOcupado] = useState(false)

  /** Sem `tipo`, sai da fila onde estás. Com `tipo`, entra nessa fila (ou sai dela, se já lá estás). */
  const alternar = async (tipo?: FilaTipo) => {
    setOcupado(true)
    const sair = !!fila?.naFila && (!tipo || fila.fila === tipo)
    await acao(() => (sair ? dados.sairFila() : dados.entrarFila(tipo ?? 'aberta')))
    await atualizar()
    setOcupado(false)
  }

  return { fila, ocupado, alternar }
}
