import { useState } from 'react'
import { useAcao } from '@/contexts/Avisos'
import { usePartida } from '@/contexts/Partida'
import { dados } from '@/lib/dados'

/** Entrar e sair da fila, partilhado pelo Dashboard e pela página Jogar. */
export function useFila() {
  const { fila, atualizar } = usePartida()
  const acao = useAcao()
  const [ocupado, setOcupado] = useState(false)

  const alternar = async () => {
    setOcupado(true)
    await acao(() => (fila?.naFila ? dados.sairFila() : dados.entrarFila()))
    await atualizar()
    setOcupado(false)
  }

  return { fila, ocupado, alternar }
}
